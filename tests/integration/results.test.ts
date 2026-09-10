import assert from "node:assert/strict";
import { test } from "node:test";
import { expect, withServer } from "./nativeServer.ts";

test("native result handlers preserve pipeline, response and isolation contracts", async () => {
  await withServer("packages/core/.scriptc/resultServer", async (port) => {
    const response = await expect(port, "GET", "/api/value/a", 201);
    assert.deepEqual(JSON.parse(response.body), { value: "a12" });
    assert.equal(response.headers["x-transformed"], "yes");
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/events", 200)).body), ["before", "handle", "transform1", "transform2", "after"]);
    await Promise.all(Array.from({ length: 12 }, async (_, id) => {
      assert.deepEqual(JSON.parse((await expect(port, "GET", `/api/value/${id}`, 201)).body), { value: `${id}12` });
    }));
    assert.equal((await expect(port, "HEAD", "/api/value/b", 201)).body, "");
    await expect(port, "POST", "/api/value/b", 405);
    await expect(port, "GET", "/short", 401);
    for (const path of ["/handle-error", "/transform-error", "/serialize-error"]) {
      assert.deepEqual(JSON.parse((await expect(port, "GET", path, 500)).body), { error: "Internal server error" });
    }
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/recover", 422)).body), { recovered: true });
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/double", 202)).body), { first: true });
    await expect(port, "GET", "/transform-double", 204);
    const events: string[] = JSON.parse((await expect(port, "GET", "/events", 200)).body);
    assert(events.includes("error:/double"));
    assert(events.includes("error:/transform-double"));
    assert(!events.includes("unexpected serialize"));
    assert(!events.includes("error:/recover"));
  }, "SIGTERM", null);
});
