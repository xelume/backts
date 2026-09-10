import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { root, unusedPort, withServer, expect } from "./nativeServer.ts";

test("framework accepts plain objects, freezes factories and shares core lifecycle", async () => {
  const result = spawnSync(`${root}examples/todo/.scriptc/framework`, [String(await unusedPort())], { encoding: "utf8", timeout: 8000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS framework composition/);
});

test("basic consumer serves HTTP without framework or business classes", async () => {
  await withServer("examples/basic/.scriptc/app", async (port) => {
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/", 200)).body), { message: "Hello BackTS" });
  });
});
