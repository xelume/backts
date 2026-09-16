import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("fresh workspace links commands before build and builds both example consumers", { timeout: 180000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), "backts-bootstrap-"));
  const workspace = join(directory, "workspace");
  const source = fileURLToPath(new URL("../", import.meta.url));
  const run = (args: string[], cwd = workspace) => {
    const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", timeout: 120000, env: { ...process.env, CI: "true" } });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    return result.stdout + result.stderr;
  };
  try {
    cpSync(source, workspace, {
      recursive: true,
      filter: (path) => !["node_modules", ".git", "dist", ".scriptc"].includes(basename(path)) &&
        !["basic", "todo"].some((example) => path === join(source, "examples", example, "build")),
    });
    assert.equal(existsSync(join(workspace, "packages/cli/dist")), false);
    assert.equal(existsSync(join(workspace, "packages/createBackts/dist")), false);
    for (const example of ["basic", "todo"]) assert.equal(existsSync(join(workspace, "examples", example, "build")), false);
    // 独立于普通测试运行；先由宿主或 CI 安装依赖以填充 pnpm store。
    const installed = run(["install", "--offline", "--frozen-lockfile", "--ignore-scripts"]);
    assert.doesNotMatch(installed, /Failed to create bin/);
    for (const consumer of [".", "examples/basic", "examples/todo", "packages/core", "packages/createBackts"]) {
      accessSync(join(workspace, consumer, "node_modules/.bin/backts"), constants.X_OK);
    }
    run(["build"]);
    const cli = JSON.parse(readFileSync(join(workspace, "packages/cli/package.json"), "utf8"));
    for (const consumer of [".", "examples/basic", "examples/todo", "packages/core", "packages/createBackts"]) {
      assert.equal(run(["exec", "backts", "--version"], join(workspace, consumer)).trim(), cli.version);
    }
    for (const example of ["basic", "todo"]) accessSync(join(workspace, "examples", example, "build/app"), constants.X_OK);
    assert.deepEqual(
      readFileSync(join(workspace, "examples/todo/build/public/index.html")),
      readFileSync(join(workspace, "examples/todo/public/index.html")),
    );
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
