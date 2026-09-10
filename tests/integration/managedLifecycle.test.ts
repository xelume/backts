import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { expect, root, withServer } from "./nativeServer.ts";

test("run handles invalid startup configuration with a controlled failure", () => {
  for (const port of ["0", "65536", "not-a-port"]) {
    const child = spawnSync(`${root}examples/todo/.scriptc/app`, [port], { cwd: `${root}examples/todo`, encoding: "utf8", timeout: 5000 });
    assert.ifError(child.error);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Server startup failed/);
    assert.doesNotMatch(child.stdout, /Listening on/);
  }
});

test("run closes gracefully on SIGINT", async () => {
  await withServer("examples/todo/.scriptc/app", async (port) => {
    await expect(port, "GET", "/health", 200);
  }, "SIGINT");
});

test("managed close removes its own SIGINT listener", async () => {
  await withServer("packages/core/.scriptc/managedLifecycle", async () => {}, "SIGINT", "SIGINT");
});

test("managed close preserves unrelated SIGTERM listeners", async () => {
  await withServer("packages/core/.scriptc/managedLifecycle", async () => {});
});
