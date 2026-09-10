import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../packages/cli/dist/bin.mjs", import.meta.url));
const initializer = fileURLToPath(new URL("../../packages/createBackts/dist/bin.mjs", import.meta.url));
function invoke(args: string[], cwd: string, bin = cli) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", timeout: 15000 });
}

test("creates an independent application through both entry points and protects existing files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-create-"));
  try {
    for (const [name, bin, prefix] of [["direct-app", cli, ["create"]], ["initializer-app", initializer, []]] as const) {
      const result = invoke([...prefix, name, "--skip-install", "--pm", "pnpm", "--yes"], cwd, bin);
      assert.equal(result.status, 0, result.stderr);
      const target = join(cwd, name);
      const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
      assert.equal(pkg.name, name);
      assert.equal(pkg.dependencies["@backts/core"], "0.1.0");
      assert.equal(pkg.devDependencies["@backts/cli"], "0.1.0");
      assert.equal(pkg.scripts.dev, "backts dev");
      assert.equal(pkg.scripts.analyze, "backts analyze");
      assert.equal(pkg.scripts.coverage, undefined);
      assert(!JSON.stringify(pkg).includes("workspace:"));
      assert(readdirSync(target).includes(".gitignore"));
      assert(!readFileSync(join(target, "tsconfig.json"), "utf8").includes("extends"));
      writeFileSync(join(target, "keep.txt"), "user data");
      assert.notEqual(invoke(["create", name, "--skip-install"], cwd).status, 0);
      assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "user data");
    }
    mkdirSync(join(cwd, "empty"));
    assert.equal(invoke(["create", ".", "--skip-install"], join(cwd, "empty")).status, 0);
    mkdirSync(join(cwd, "actual"));
    symlinkSync(join(cwd, "actual"), join(cwd, "linked"));
    assert.notEqual(invoke(["create", "linked", "--skip-install"], cwd).status, 0);
    assert.deepEqual(readdirSync(join(cwd, "actual")), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("invalid commands and unattended input fail before writing files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-invalid-"));
  try {
    for (const args of [["create"], ["create", "UPPERCASE", "--skip-install"], ["create", "valid", "--pm", "invalid"], ["create", "valid", "--unknown"], ["build", "extra"], ["build", "--tests", "--entry", "src/main.ts"], ["analyze", "--tests", "--entry", "src/main.ts"], ["dev", "--tests"], ["build", "--", "extra"], ["unknown"]]) {
      assert.notEqual(invoke(args, cwd).status, 0, args.join(" "));
      assert.deepEqual(readdirSync(cwd), []);
    }
    assert.equal(invoke(["--help"], cwd).status, 0);
    assert.match(invoke(["--version"], cwd).stdout, /^0\.1\.0/);
    assert.notEqual(invoke(["start"], cwd).status, 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("command help describes only applicable options and is available from the initializer", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-help-"));
  try {
    for (const command of ["create", "dev", "build", "start", "analyze", "coverage", "doctor"]) {
      const result = invoke([command, "--help"], cwd);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.match(result.stdout, new RegExp(`Usage: backts ${command === "coverage" ? "analyze" : command}`));
      assert.equal(result.stdout.includes("--skip-install"), command === "create");
      assert.equal(result.stdout.includes("--tests"), ["build", "analyze", "coverage"].includes(command));
    }
    assert.equal(invoke([], cwd).status, 0);
    assert.equal(invoke(["help", "build"], cwd).stdout, invoke(["build", "--help"], cwd).stdout);
    const help = invoke(["--help"], cwd, initializer);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--pm/);
    assert.doesNotMatch(help.stdout, /--entry/);
    assert.deepEqual(readdirSync(cwd), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("test entry selection accepts defaults, rejects explicit conflicting options and keeps the coverage alias", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-test-options-"));
  try {
    mkdirSync(join(cwd, "tests"));
    for (const command of ["build", "analyze", "coverage"]) {
      const missing = invoke([command, "--tests"], cwd);
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /No \*\.native\.ts test entries found/);
      for (const args of [["--tests", "--entry", "src/main.ts"], ["--entry", "src/main.ts", "--tests"]]) {
        const conflict = invoke([command, ...args], cwd);
        assert.equal(conflict.status, 1);
        assert.match(conflict.stderr, /cannot be used with/);
      }
    }
    assert.match(invoke(["build", "--tests", "--out", ".scriptc/app"], cwd).stderr, /cannot be used with/);
    assert.deepEqual(readdirSync(cwd), ["tests"]);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("public runCli handles repeated invocations without exiting its caller", async () => {
  const { runCli } = await import("@backts/cli");
  assert.equal(await runCli(["--version"]), 0);
  await assert.rejects(runCli(["unknown"]), /unknown command/);
  assert.equal(await runCli(["--version"]), 0);
});

test("installation failure returns the package manager status and keeps a recoverable project", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-install-"));
  try {
    const commands = join(cwd, "bin");
    mkdirSync(commands);
    writeFileSync(join(commands, "pnpm"), `#!${process.execPath}\nprocess.exit(7);\n`, { mode: 0o755 });
    const result = spawnSync(process.execPath, [cli, "create", "my-api", "--pm", "pnpm", "--yes"], {
      cwd, encoding: "utf8", timeout: 15000, env: { ...process.env, PATH: `${commands}:${process.env["PATH"] ?? ""}` },
    });
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /Project files are ready/);
    assert.match(result.stderr, /pnpm install --ignore-scripts/);
    assert(!result.stdout.includes("Next steps:"));
    assert.equal(JSON.parse(readFileSync(join(cwd, "my-api/package.json"), "utf8")).name, "my-api");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("start uses the default artifact and forwards positional and explicit application arguments", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-start-"));
  try {
    mkdirSync(join(cwd, ".scriptc"));
    writeFileSync(join(cwd, ".scriptc/app"), `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
    const result = invoke(["start", "3100", "--", "--app-option"], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ["3100", "--app-option"]);
    const forwarded = invoke(["start", "--out", ".scriptc/app", "3200", "--", "--help", "--out", "application-output"], cwd);
    assert.equal(forwarded.status, 0, forwarded.stderr);
    assert.deepEqual(JSON.parse(forwarded.stdout), ["3200", "--help", "--out", "application-output"]);
    assert.equal(invoke(["start", "--unknown"], cwd).status, 1);
    writeFileSync(join(cwd, ".scriptc/app"), `#!${process.execPath}\nprocess.exit(7);\n`, { mode: 0o755 });
    assert.equal(invoke(["start"], cwd).status, 7);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
