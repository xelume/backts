import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discoverNativeTests } from "@backts/cli/testing";

test("native discovery finds nested entries and rejects empty or conflicting outputs", () => {
  const root = mkdtempSync(join(tmpdir(), "native-discovery-"));
  try {
    const directory = join(root, "tests");
    mkdirSync(join(directory, "nested"), { recursive: true });
    writeFileSync(join(directory, "helper.ts"), "");
    assert.throws(() => discoverNativeTests(root), /No .*test entries/);
    writeFileSync(join(directory, "z.native.ts"), "");
    writeFileSync(join(directory, "nested", "a.native.ts"), "");
    assert.deepEqual(discoverNativeTests(root).map((entry) => entry.name), ["a", "z"]);
    writeFileSync(join(directory, "A.native.ts"), "");
    assert.throws(() => discoverNativeTests(root), /conflicting/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public CLI analyzes and builds native tests outside the workspace, preserving the coverage alias", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { readFileSync, existsSync } = await import("node:fs");
  const cli = fileURLToPath(new URL("../../packages/cli/bin.mjs", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "native-cli-"));
  const invoke = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
  try {
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "package.json"), '{"private":true,"type":"module"}');
    writeFileSync(join(root, "tsconfig.json"), readFileSync(new URL("../../packages/cli/templates/basic/tsconfig.json", import.meta.url)));
    writeFileSync(join(root, "tests/a.native.ts"), 'console.log("native test ok");');
    for (const command of ["analyze", "coverage"]) {
      const result = invoke([command, "--tests"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /fully static/);
    }
    const build = invoke(["build", "--tests"]);
    assert.equal(build.status, 0, build.stderr);
    assert.match(spawnSync(join(root, ".scriptc/a"), [], { encoding: "utf8" }).stdout, /native test ok/);
    writeFileSync(join(root, "tests/a.native.ts"), 'import "./missing";');
    writeFileSync(join(root, "tests/z.native.ts"), 'console.log("must not compile");');
    const failure = invoke(["build", "--tests"]);
    assert.notEqual(failure.status, 0);
    assert(!existsSync(join(root, ".scriptc/z")), "must stop before compiling later tests");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
