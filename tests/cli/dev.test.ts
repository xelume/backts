import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { request, unusedPort } from "../integration/nativeServer.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(root, "packages/cli/bin.mjs");

async function withDev(verify: (state: {
  cwd: string; port: number; source: string; original: string;
  output: () => string; wait: (check: () => Promise<boolean>, label: string) => Promise<void>;
  message: (value: string) => Promise<boolean>; terminate: () => void;
}) => Promise<void>): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), "backts-dev-"));
  const port = await unusedPort();
  mkdirSync(join(cwd, "src"));
  mkdirSync(join(cwd, "node_modules/@backts"), { recursive: true });
  symlinkSync(join(root, "packages/core"), join(cwd, "node_modules/@backts/core"));
  symlinkSync(join(root, "node_modules/@types"), join(cwd, "node_modules/@types"));
  writeFileSync(join(cwd, "package.json"), '{"private":true,"type":"module"}');
  writeFileSync(join(cwd, "tsconfig.json"), readFileSync(join(root, "packages/cli/templates/basic/tsconfig.json")));
  const source = join(cwd, "src/main.ts");
  const original = readFileSync(join(root, "packages/cli/templates/basic/src/main.ts"), "utf8");
  writeFileSync(source, original);
  const child = spawn(process.execPath, [cli, "dev", "--", String(port)], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const exited = new Promise<void>((accept, reject) => { child.once("error", reject); child.once("close", () => accept()); });
  async function wait(check: () => Promise<boolean>, label: string): Promise<void> {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, output);
      if (await check()) return;
      await delay(30);
    }
    throw new Error(`${label} timed out\n${output}`);
  }
  async function message(value: string): Promise<boolean> {
    try { return (await request(port, "GET", "/")).body.includes(value); } catch { return false; }
  }
  try {
    await wait(() => message("Hello BackTS"), "initial startup");
    await verify({ cwd, port, source, original, output: () => output, wait, message, terminate: () => { child.kill("SIGINT"); } });
  } finally {
    child.kill("SIGINT");
    const force = setTimeout(() => child.kill("SIGKILL"), 10000);
    try {
      await exited;
      assert.equal(child.exitCode, 0, output);
      await assert.rejects(request(port, "GET", "/health"));
      assert(!readdirSync(join(cwd, ".scriptc")).some((name) => name.startsWith(".backts-dev-")));
    } finally { clearTimeout(force); rmSync(cwd, { recursive: true, force: true }); }
  }
}

test("dev preserves the service on build failure and replaces it promptly despite a half-open idle connection", { timeout: 90000 }, async () => {
  await withDev(async ({ cwd, port, source, original, output, wait, message }) => {
    const artifact = readFileSync(join(cwd, ".scriptc/app"));
    writeFileSync(source, original + '\nimport "./missing";');
    await wait(async () => output().includes("Build failed. Keeping the current service;"), "failed build");
    assert(await message("Hello BackTS"), "failed compilation must leave the old service available");
    assert.deepEqual(readFileSync(join(cwd, ".scriptc/app")), artifact, "failed compilation must not replace the artifact");
    const socket: Socket = connect({ port, host: "127.0.0.1", allowHalfOpen: true });
    socket.on("error", () => {});
    socket.resume();
    await new Promise<void>((accept, reject) => { socket.once("connect", accept); socket.once("error", reject); });
    try {
      const begin = output().length;
      writeFileSync(source, original.replace("Hello BackTS", "Updated BackTS"));
      await wait(async () => output().slice(begin).includes("Building…"), "rebuild started");
      assert(await message("Hello BackTS"), "old service must remain available during compilation");
      await wait(async () => output().slice(begin).includes("Restarting;"), "replacement started");
      const replacingAt = Date.now();
      await wait(() => message("Updated BackTS"), "replacement ready");
      assert(Date.now() - replacingAt < 3000, output());
      assert(!output().includes("Server shutdown timed out"), output());
      writeFileSync(source, original.replace("Hello BackTS", "Intermediate"));
      await delay(30);
      writeFileSync(source, original.replace("Hello BackTS", "Latest BackTS"));
      await wait(() => message("Latest BackTS"), "latest save");
    } finally { socket.destroy(); }
  });
});

test("interrupting a rebuild stops both the compiler and the retained service", { timeout: 60000 }, async () => {
  await withDev(async ({ source, original, output, wait, terminate }) => {
    const begin = output().length;
    writeFileSync(source, original.replace("Hello BackTS", "Interrupted build"));
    await wait(async () => output().slice(begin).includes("Building…"), "rebuild started");
    terminate();
  });
});
