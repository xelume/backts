import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compileNative } from "@backts/cli/compiler";

test("repeated native builds preserve inputs and invalidate changed or removed dependencies", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-compiler-cache-"));
  const entry = join(cwd, "main.ts");
  const dependency = join(cwd, "value.ts");
  const output = join(cwd, ".scriptc/app");
  const build = () => compileNative({ operation: "build", entry, output, cwd });
  const run = () => {
    const result = spawnSync(output, [], { encoding: "utf8", timeout: 8000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    writeFileSync(join(cwd, "package.json"), '{"private":true,"type":"module"}');
    writeFileSync(join(cwd, "tsconfig.json"), readFileSync(new URL("../../packages/cli/templates/basic/tsconfig.json", import.meta.url)));
    writeFileSync(entry, 'import { value } from "./value"; console.log(value);');
    writeFileSync(dependency, 'export const value = "first";');
    assert.equal(await build(), 0);
    assert.equal(run(), "first");
    const inputs = join(cwd, ".scriptc/inputs");
    const stage = join(inputs, readdirSync(inputs)[0]!);
    const unchanged = ["package.json", "tsconfig.json", "sourceMap.json", "module0.ts", "module1.ts"];
    const timestamp = new Date("2000-01-01T00:00:00Z");
    for (const name of unchanged) utimesSync(join(stage, name), timestamp, timestamp);
    assert.equal(await build(), 0);
    assert.equal(run(), "first");
    for (const name of unchanged) assert.equal(statSync(join(stage, name)).mtimeMs, timestamp.getTime(), name);

    writeFileSync(dependency, 'export const value = "updated";');
    assert.equal(await build(), 0);
    assert.equal(run(), "updated", "changed dependency must invalidate the executable");
    const artifact = readFileSync(output);
    writeFileSync(dependency, 'export const value: number = "invalid";');
    assert.notEqual(await build(), 0);
    assert.deepEqual(readFileSync(output), artifact, "failed compilation must preserve the published executable");

    writeFileSync(entry, 'console.log("standalone");');
    rmSync(dependency);
    assert.equal(await build(), 0);
    assert.equal(run(), "standalone");
    assert.equal(existsSync(join(stage, "module1.ts")), false, "removed inputs must not affect future analysis");
    assert.deepEqual(Object.values(JSON.parse(readFileSync(join(stage, "sourceMap.json"), "utf8"))), [realpathSync(entry)]);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
