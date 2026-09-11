import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { root } from "../integration/nativeServer.ts";

test("packed CLI and initializer generate both templates using only shipped BackTS files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "backts-templates-"));
  try {
    const packages = ["core", "framework", "cli", "createBackts"];
    for (const name of packages) {
      const source = `${root}packages/${name}`;
      const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
      const archive = join(directory, `${name}.tgz`);
      execFileSync("pnpm", ["--config.ignore-scripts=true", "pack", "--out", archive], { cwd: source, stdio: "pipe", timeout: 30000 });
      const target = join(directory, "node_modules", pkg.name);
      mkdirSync(target, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", target]);
    }
    const packedCli = join(directory, "node_modules/@backts/cli");
    const cliPkg = JSON.parse(readFileSync(join(packedCli, "package.json"), "utf8"));
    // 离线复用已安装的第三方依赖；BackTS 自身必须来自 tarball。
    for (const name of Object.keys(cliPkg.dependencies)) {
      const target = join(directory, "node_modules", name);
      mkdirSync(join(target, ".."), { recursive: true });
      symlinkSync(`${root}packages/cli/node_modules/${name}`, target);
    }
    const coreVersion = JSON.parse(readFileSync(join(directory, "node_modules/@backts/core/package.json"), "utf8")).version;
    const frameworkPkg = JSON.parse(readFileSync(join(directory, "node_modules/@backts/framework/package.json"), "utf8"));
    const initializerPkg = JSON.parse(readFileSync(join(directory, "node_modules/create-backts/package.json"), "utf8"));
    assert.equal(frameworkPkg.dependencies["@backts/core"], coreVersion);
    assert.equal(initializerPkg.dependencies["@backts/cli"], cliPkg.version);
    const cliEntry = join(packedCli, cliPkg.bin.backts);
    const initializerEntry = join(directory, "node_modules/create-backts", initializerPkg.bin["create-backts"]);
    const { compileNative } = await import(pathToFileURL(join(packedCli, "dist/compiler.mjs")).href);
    for (const template of ["basic", "framework"]) {
      const cwd = join(directory, template);
      const entry = template === "basic" ? [cliEntry, "create"] : [initializerEntry];
      const result = spawnSync(process.execPath, [...entry, cwd, "--template", template, "--skip-install", "--yes"], { cwd: directory, encoding: "utf8", timeout: 15000 });
      assert.equal(result.status, 0, result.stderr);
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      assert.equal(pkg.version, "0.1.0");
      assert.equal(pkg.dependencies["@backts/core"], coreVersion);
      assert.equal(pkg.dependencies["@backts/framework"], template === "framework" ? frameworkPkg.version : undefined);
      assert.equal(pkg.devDependencies["@backts/cli"], cliPkg.version);
      assert.equal(pkg.devDependencies.typescript, cliPkg.dependencies.typescript);
      assert.doesNotMatch(JSON.stringify(pkg), /workspace:|__\w+__|latest/);
      mkdirSync(join(cwd, "node_modules/@backts"), { recursive: true });
      symlinkSync(`${root}node_modules/@types`, join(cwd, "node_modules/@types"));
      for (const name of template === "framework" ? ["core", "framework"] : ["core"]) {
        symlinkSync(join(directory, "node_modules/@backts", name), join(cwd, "node_modules/@backts", name));
      }
      assert.equal(await compileNative({ operation: "build", entry: "src/main.ts", output: ".scriptc/app", cwd }), 0);
    }
    const invalid = spawnSync(process.execPath, [cliEntry, "create", join(directory, "invalid"), "--template", "unknown", "--skip-install"], { encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
