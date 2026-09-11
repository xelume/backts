import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { unusedPort, request } from "../integration/nativeServer.ts";

// 在仓库外安装 tarball 后运行：node tests/cli/packedApp.ts /absolute/app/path。
const cwd = resolve(process.argv[2]!);
const bin = resolve(cwd, "node_modules/@backts/cli/dist/bin.mjs");
const port = await unusedPort();
for (const args of [["doctor"], ["analyze"], ["build"]]) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd, stdio: "inherit" });
  assert.equal(result.status, 0, args.join(" "));
}
const types = spawnSync(resolve(cwd, "node_modules/.bin/tsc"), ["--noEmit"], { cwd, stdio: "inherit" });
assert.equal(types.status, 0);
// 已发布的声明也必须能被标准 Node ESM 消费者解析。
const typeDirectory = mkdtempSync(resolve(cwd, ".cli-types-"));
try {
  const entry = resolve(typeDirectory, "consumer.mts");
  writeFileSync(entry, `
import { runCli } from "@backts/cli";
import { compileNative, type CompileOptions } from "@backts/cli/compiler";
import { discoverNativeTests, prepareNativeTests, type NativeTest } from "@backts/cli/testing";
const run: (argv: string[]) => Promise<number> = runCli;
const compile: (options: CompileOptions) => Promise<number> = compileNative;
const discover: (root: string) => NativeTest[] = discoverNativeTests;
const prepare: (operation: "build" | "coverage", root: string) => Promise<number> = prepareNativeTests;
`);
  for (const [module, resolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]]) {
    const result = spawnSync(resolve(cwd, "node_modules/.bin/tsc"), [
      "--ignoreConfig", "--noEmit", "--strict", "--target", "ES2022", "--module", module!, "--moduleResolution", resolution!, entry,
    ], { cwd, stdio: "inherit" });
    assert.equal(result.status, 0, `CLI declarations with ${resolution}`);
  }
} finally {
  rmSync(typeDirectory, { recursive: true, force: true });
}
// 两种模板的问候语分别由入口和 Hello 模块拥有。
const source = resolve(cwd, existsSync(resolve(cwd, "src/hello.ts")) ? "src/hello.ts" : "src/main.ts");
const original = readFileSync(source, "utf8");
const child = spawn(process.execPath, [bin, "dev", "--", String(port)], { cwd, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
const exited = new Promise<void>((accept) => child.once("close", () => accept()));
async function waitFor(check: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, output);
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`${label} timed out\n${output}`);
}
async function message(value: string): Promise<boolean> {
  try { return (await request(port, "GET", "/")).body.includes(value); } catch { return false; }
}
try {
  await waitFor(() => message("Hello BackTS"), "initial startup");
  assert.equal((await request(port, "GET", "/health")).status, 200);
  writeFileSync(source, original + '\nimport "./missing-module";\n');
  await waitFor(async () => output.includes("Build failed. Keeping the current service;"), "compile failure");
  assert.equal(await message("Hello BackTS"), true, "a failed build must preserve the running service");
  writeFileSync(source, original.replace("Hello BackTS", "Updated BackTS"));
  await waitFor(() => message("Updated BackTS"), "recovery");
  writeFileSync(source, original.replace("Hello BackTS", "Intermediate"));
  await delay(30);
  writeFileSync(source, original.replace("Hello BackTS", "Latest BackTS"));
  await waitFor(() => message("Latest BackTS"), "consecutive edits");
} finally {
  child.kill("SIGINT");
  const force = setTimeout(() => child.kill("SIGKILL"), 10000);
  try { await exited; } finally { clearTimeout(force); writeFileSync(source, original); }
}
assert.equal(child.exitCode, 0, output);
assert.equal(await message("Latest BackTS"), false, "dev must stop its service");
// 验证 start 命令也管理它启动的原生进程。
const server = spawn(process.execPath, [bin, "start", "--", String(port)], { cwd, stdio: "ignore" });
const serverExited = new Promise<void>((accept) => server.once("close", () => accept()));
try {
  const deadline = Date.now() + 8000;
  while (!(await message("Latest BackTS"))) {
    assert(Date.now() < deadline, "start timed out");
    await delay(50);
  }
} finally {
  server.kill("SIGTERM");
  const force = setTimeout(() => server.kill("SIGKILL"), 10000);
  try { await serverExited; } finally { clearTimeout(force); }
}
assert.equal(server.exitCode, 0);
assert.equal(await message("Latest BackTS"), false);
console.log("Packed application passed: typecheck, analyze, build, HTTP, dev recovery, consecutive edits, shutdown, start.");
