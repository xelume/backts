import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compileNative } from "@backts/cli/compiler";
import { root } from "../integration/nativeServer.ts";

test("both generated templates compile through public package entries outside the repository", async () => {
  const directory = mkdtempSync(join(tmpdir(), "backts-templates-"));
  try {
    for (const template of ["basic", "framework"]) {
      const cwd = join(directory, template);
      const result = spawnSync(process.execPath, [`${root}packages/cli/dist/bin.mjs`, "create", cwd, "--template", template, "--skip-install", "--yes"], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      assert.equal(pkg.dependencies["@backts/framework"], template === "framework" ? "0.0.1" : undefined);
      mkdirSync(join(cwd, "node_modules/@backts"), { recursive: true });
      symlinkSync(`${root}node_modules/@types`, join(cwd, "node_modules/@types"));
      for (const name of template === "framework" ? ["core", "framework"] : ["core"]) {
        symlinkSync(`${root}packages/${name}`, join(cwd, "node_modules/@backts", name));
      }
      assert.equal(await compileNative({ operation: "build", entry: "src/main.ts", output: ".scriptc/app", cwd }), 0);
    }
    const invalid = spawnSync(process.execPath, [`${root}packages/cli/dist/bin.mjs`, "create", join(directory, "invalid"), "--template", "unknown", "--skip-install"], { encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
