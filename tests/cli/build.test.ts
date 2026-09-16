import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../../packages/cli/bin.mjs", import.meta.url));

test("application builds synchronize portable public assets and preserve them on compilation failure", () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-build-"));
  const build = (...args: string[]) => spawnSync(process.execPath, [cli, "build", ...args], { cwd, encoding: "utf8", timeout: 120000 });
  const success = (...args: string[]) => {
    const result = build(...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  try {
    mkdirSync(join(cwd, "src"));
    mkdirSync(join(cwd, "public/nested"), { recursive: true });
    writeFileSync(join(cwd, "package.json"), '{"private":true,"type":"module"}');
    writeFileSync(join(cwd, "tsconfig.json"), readFileSync(new URL("../../packages/cli/templates/basic/tsconfig.json", import.meta.url)));
    writeFileSync(join(cwd, "src/main.ts"), 'console.log("portable");');
    writeFileSync(join(cwd, "public/nested/data.bin"), Buffer.from([0, 255, 128]));
    writeFileSync(join(cwd, "public/old.txt"), "old");
    symlinkSync(join(cwd, "public/old.txt"), join(cwd, "public/link.txt"));
    success();
    assert.deepEqual(readFileSync(join(cwd, "build/public/nested/data.bin")), Buffer.from([0, 255, 128]));
    cpSync(join(cwd, "build"), join(cwd, "relocated"), { recursive: true });
    assert.equal(spawnSync(join(cwd, "relocated/app"), [], { cwd: join(cwd, "relocated"), encoding: "utf8" }).stdout.trim(), "portable");

    const artifact = readFileSync(join(cwd, "build/app"));
    writeFileSync(join(cwd, "src/main.ts"), 'const bad: number = "invalid"; console.log(bad);');
    rmSync(join(cwd, "public/old.txt"));
    unlinkSync(join(cwd, "public/link.txt"));
    assert.notEqual(build().status, 0);
    assert.deepEqual(readFileSync(join(cwd, "build/app")), artifact);
    assert.equal(readFileSync(join(cwd, "build/public/old.txt"), "utf8"), "old");
    writeFileSync(join(cwd, "src/main.ts"), 'console.log("portable");');
    success();
    assert.equal(existsSync(join(cwd, "build/public/old.txt")), false);
    assert.equal(readFileSync(join(cwd, "relocated/public/link.txt"), "utf8"), "old");

    success("--out", "release/server");
    assert(existsSync(join(cwd, "release/public/nested/data.bin")));
    success("--out", ".scriptc/dev", "--no-public");
    assert.equal(existsSync(join(cwd, ".scriptc/public")), false);
    assert.match(build("--out", "app").stderr, /overlap/);
    assert.match(build("--out", "public/nested/app").stderr, /overlap/);
    assert.match(build("--out", "build/public").stderr, /executable must not/);
    symlinkSync(join(cwd, "public"), join(cwd, "linked"));
    assert.match(build("--out", "linked/app").stderr, /overlap/);
    assert(existsSync(join(cwd, "public/nested/data.bin")));
    rmSync(join(cwd, "public"), { recursive: true });
    success();
    assert.equal(existsSync(join(cwd, "build/public")), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
