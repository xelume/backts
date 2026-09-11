import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { readProjectVersions } from "../../packages/cli/build/projectVersions.ts";
import { createProjectPackage } from "../../packages/cli/src/creation/projectPackage.ts";
import { checkProjectVersions } from "../../scripts/checkProjectVersions.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "backts-versions-"));
  const root = pathToFileURL(directory + "/");
  const write = (path: string, value: unknown) => {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(value, null, 2) + "\n");
  };
  const update = (path: string, changes: Record<string, unknown>) => write(path, { ...JSON.parse(readFileSync(new URL(path, root), "utf8")), ...changes });
  write("package.json", { devDependencies: { "@types/node": "24.0.0" } });
  write("packages/core/package.json", { version: "1.2.3" });
  write("packages/framework/package.json", { version: "2.3.4", dependencies: { "@backts/core": "workspace:*" } });
  write("packages/cli/package.json", { version: "3.4.5", dependencies: { typescript: "7.0.2", scriptc: "0.0.36" }, engines: { node: ">=24" } });
  write("packages/createBackts/package.json", { version: "4.5.6", dependencies: { "@backts/cli": "workspace:*" } });
  const build = () => write("packages/cli/dist/projectVersions.json", readProjectVersions(root));
  build();
  return { directory, root, write, update, build, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

test("project versions preserve independently versioned packages and exact prerelease dependencies", () => {
  const f = fixture();
  try {
    f.update("packages/core/package.json", { version: "1.3.0-rc.1" });
    const versions = readProjectVersions(f.root);
    for (const template of ["basic", "framework"]) {
      const pkg = createProjectPackage("example", template, versions);
      assert.equal(pkg.version, "0.1.0");
      assert.deepEqual(pkg.dependencies, { "@backts/core": "1.3.0-rc.1", ...(template === "framework" ? { "@backts/framework": "2.3.4" } : {}) });
      assert.deepEqual(pkg.devDependencies, { "@backts/cli": "3.4.5", "@types/node": "24.0.0", typescript: "7.0.2" });
      assert.equal(Object.hasOwn(pkg.dependencies, "scriptc"), false);
    }
    assert.throws(() => createProjectPackage("example", "invalid", versions), /Unknown template/);
    for (const version of ["latest", "^1.0.0", "workspace:*", undefined]) {
      f.update("packages/core/package.json", { version });
      assert.throws(() => readProjectVersions(f.root), /exact version/);
    }
  } finally { f.dispose(); }
});

test("project version check rejects stale builds and non-exact workspace dependencies", () => {
  const f = fixture();
  try {
    checkProjectVersions(f.root);
    f.update("packages/core/package.json", { version: "1.2.4" });
    assert.throws(() => checkProjectVersions(f.root), /stale/);
    f.build();
    checkProjectVersions(f.root);
    f.update("packages/createBackts/package.json", { dependencies: { "@backts/cli": "latest" } });
    assert.throws(() => checkProjectVersions(f.root), /exact CLI dependency/);
  } finally { f.dispose(); }
});
