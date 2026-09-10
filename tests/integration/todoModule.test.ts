import assert from "node:assert/strict";
import { test } from "node:test";
import { expect, withServer } from "./nativeServer.ts";

test("Todo module owns its HTTP boundary and uses explicitly supplied storage", async () => {
  await withServer("examples/todo/.scriptc/moduleServer", async (port) => {
    const seeded = await expect(port, "GET", "/api/first", 200);
    assert.equal(seeded.headers["x-parent"], "yes");
    assert.deepEqual(JSON.parse(seeded.body), [{ id: 1, title: "seed", completed: false }]);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/api/second", 200)).body), []);
    await expect(port, "POST", "/api/second", 201, '{"title":"second"}');
    assert.equal(JSON.parse((await expect(port, "GET", "/api/first/1", 200)).body).title, "seed");
    assert.equal(JSON.parse((await expect(port, "GET", "/api/second/1", 200)).body).title, "second");
    await expect(port, "PATCH", "/api/shared/1", 200, '{"title":"shared"}');
    assert.equal(JSON.parse((await expect(port, "GET", "/api/first/1", 200)).body).title, "shared");
    assert.deepEqual(JSON.parse((await expect(port, "PATCH", "/api/first/1", 400, '{}')).body), { error: "Provide title, completed, or both" });
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/api/outside", 500)).body), { error: "Internal server error" });
    await expect(port, "GET", "/api/first/", 404);
    await expect(port, "PUT", "/api/first", 405);
  }, "SIGTERM", null);
});
