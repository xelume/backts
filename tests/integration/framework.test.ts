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

test("module graphs reject invalid imports before factories and snapshot their configuration", () => {
  const result = spawnSync(`${root}examples/todo/.scriptc/moduleGraph`, [], { encoding: "utf8", timeout: 8000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS module graph preflight/);
});

test("controller route descriptions preserve HTTP behavior, snapshots and bound instances", async () => {
  await withServer("examples/todo/.scriptc/routeDescriptions", async (port) => {
    const first = await expect(port, "GET", "/items/1", 200);
    assert.deepEqual(JSON.parse(first.body), { label: "first", id: "1" });
    assert.equal(first.headers["x-route"], "yes");
    assert.equal(first.headers["x-root"], "yes");
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/others/2", 200)).body), { label: "second", id: "2" });
    assert.equal((await expect(port, "HEAD", "/items/1", 200)).body, "");
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/items/error", 422)).body), { error: "Expected" });
    await expect(port, "GET", "/items/short", 204);
    await expect(port, "POST", "/items/1", 405);
    await expect(port, "GET", "/missing", 404);
  }, "SIGTERM", null);
});

test("controller declarations own JSON responses, empty responses, exception mapping and snapshots", async () => {
  await withServer("examples/todo/.scriptc/controller", async (port) => {
    const first = await expect(port, "GET", "/first/value/1", 201);
    assert.deepEqual(JSON.parse(first.body), { label: "first", id: "1!" });
    assert.equal(first.headers["x-route"], "yes");
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/second/value/2", 201)).body), { label: "second", id: "2!" });
    assert.equal((await expect(port, "HEAD", "/first/value/1", 200)).body, "");
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/first/array", 200)).body), [1, 2]);
    assert.equal(JSON.parse((await expect(port, "GET", "/first/scalar", 200)).body), "hello");
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/first/mapped", 422)).body), { error: "invalid" });
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/first/unknown", 500)).body), { error: "Internal server error" });
    await expect(port, "GET", "/first/http", 409);
    await expect(port, "GET", "/first/short", 204);
    assert.equal((await expect(port, "DELETE", "/first/empty", 204)).body, "");
    await expect(port, "DELETE", "/first/mapped", 422);
    assert.deepEqual(JSON.parse((await expect(port, "DELETE", "/first/double", 202)).body), { first: true });
    const events = JSON.parse((await expect(port, "GET", "/events", 200)).body) as string[];
    assert(events.includes("/first/double"));
    assert(events.indexOf("before:/first/value/1") < events.indexOf("after:/first/value/1"));
    assert(events.includes("after:/first/short"));
    assert(!events.includes("after:/first/mapped"));
    await expect(port, "GET", "/first/mutated", 404);
    await expect(port, "POST", "/first/value/1", 405);
  }, "SIGTERM", null);
});

test("providers enforce module visibility, per-application scope, overrides and lifecycle", async () => {
  const result = spawnSync(`${root}examples/todo/.scriptc/providers`, [String(await unusedPort())], { encoding: "utf8", timeout: 8000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS provider contracts/);
});

test("functional controllers adapt sync and async results, snapshot declarations and assemble dependencies once", async () => {
  await withServer("examples/todo/.scriptc/functionalController", async (port) => {
    const sync = await expect(port, "GET", "/sync", 201);
    assert.deepEqual(JSON.parse(sync.body), { message: "hello!" });
    assert.equal(sync.headers["x-route"], "yes");
    assert.deepEqual(JSON.parse((await expect(port, "POST", "/async", 201, "world")).body), { message: "world!" });
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/array", 200)).body), [1, 2]);
    assert.equal((await expect(port, "HEAD", "/sync", 200)).body, "");
    for (const path of ["/sync", "/async"]) assert.equal((await expect(port, "DELETE", path, 204)).body, "");
    for (const path of ["/alias", "/namespace"]) await expect(port, "DELETE", path, 204);
    const createdEmpty = await expect(port, "DELETE", "/created-empty", 201);
    assert.equal(createdEmpty.body, "");
    assert.equal(createdEmpty.headers["content-type"], undefined);
    for (const path of ["/undefined", "/maybe/empty"]) await expect(port, "GET", path, 204);
    for (const [path, value] of [["/null", null], ["/false", false], ["/zero", 0]] as const) {
      assert.equal(JSON.parse((await expect(port, "GET", path, 200)).body), value);
    }
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/maybe/value", 200)).body), { value: "present" });
    await expect(port, "DELETE", "/rejected", 422);
    assert.deepEqual(JSON.parse((await expect(port, "DELETE", "/result", 200)).body), { removed: true });
    assert.deepEqual(JSON.parse((await expect(port, "DELETE", "/accepted", 202)).body), { queued: true });
    assert.deepEqual(JSON.parse((await expect(port, "PUT", "/replace", 200, "new")).body), { title: "new" });
    assert.deepEqual(JSON.parse((await expect(port, "PATCH", "/replace", 200)).body), { updated: true });
    const allowed = await expect(port, "OPTIONS", "/replace", 204);
    assert.equal(allowed.headers.allow, "PUT, PATCH, OPTIONS");
    assert.equal(allowed.body, "");
    assert.equal((await expect(port, "POST", "/empty", 204)).body, "");
    await expect(port, "DELETE", "/mapped", 422);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/mapped", 422)).body), { error: "invalid" });
    await expect(port, "GET", "/short", 204);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/double", 202)).body), { first: true });
    for (const [path, value] of [["/first", 1], ["/first", 2], ["/second", 11]] as const) {
      assert.deepEqual(JSON.parse((await expect(port, "GET", path, 200)).body), { value });
    }
    const events = JSON.parse((await expect(port, "GET", "/events", 200)).body) as string[];
    assert(events.includes("sync") && events.includes("async"));
    assert(events.indexOf("before:/sync") < events.indexOf("after:/sync"));
    assert(events.includes("after:/short"));
    assert(!events.includes("after:/mapped"));
    await expect(port, "PUT", "/sync", 405);
    await expect(port, "GET", "/missing", 404);
  }, "SIGTERM", null);
});
