import assert from "node:assert/strict";
import { test } from "node:test";
import { expect, withServer, unusedPort } from "./nativeServer.ts";

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

test("AppModule creates isolated Todo storage for applications in the same process", async () => {
  const secondPort = await unusedPort();
  await withServer("examples/todo/.scriptc/appIsolation", async (firstPort) => {
    await expect(firstPort, "POST", "/api/todos", 201, '{"title":"first"}');
    assert.deepEqual(JSON.parse((await expect(secondPort, "GET", "/api/todos", 200)).body), []);
    const second = await expect(secondPort, "POST", "/api/todos", 201, '{"title":"second"}');
    assert.equal(JSON.parse(second.body).id, 1);
    assert.equal(JSON.parse((await expect(firstPort, "GET", "/api/todos/1", 200)).body).title, "first");
    for (const port of [firstPort, secondPort]) {
      for (const [path, status] of [["/health", 200], ["/missing", 404]] as const) {
        const response = await expect(port, "GET", path, status);
        assert.equal(response.headers["x-content-type-options"], undefined);
        assert.equal(response.headers["referrer-policy"], undefined);
      }
    }
  }, "SIGTERM", null, [String(secondPort)]);
});
