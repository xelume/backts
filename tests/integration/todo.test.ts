import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { connect } from "node:net";
import { test } from "node:test";
import { expect, root, withServer } from "./nativeServer.ts";

test("example native domain contracts", () => {
  assert.match(execFileSync(`${root}examples/todo/.scriptc/domain`, { encoding: "utf8", timeout: 8000 }), /PASS native Todo domain contracts/);
});

test("independent Todo consumer preserves its HTTP contracts", async () => {
  await withServer("examples/todo/.scriptc/app", async (port) => {
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/api/todos?x=1", 200)).body), []);
    assert.deepEqual(JSON.parse((await expect(port, "POST", "/api/todos", 201, JSON.stringify({ title: "  学习 scriptc  " }))).body),
      { id: 1, title: "学习 scriptc", completed: false });
    assert.equal(JSON.parse((await expect(port, "PATCH", "/api/todos/1", 200, '{"completed":true}')).body).completed, true);
    for (const body of ['null', '[]', '1', '"x"', '{}', '{"title":2}', '{"title":null}', '{"title":false}', '{"title":" "}', '{', '{"title":"ok","completed":"yes"}']) {
      await expect(port, "POST", "/api/todos", 400, body);
    }
    await expect(port, "PATCH", "/api/todos/1", 400, '{}');
    await expect(port, "PATCH", "/api/todos/1", 400, '{"completed":null}');
    await expect(port, "POST", "/api/todos", 415, '{"title":"one"}', "text/plain");
    await expect(port, "POST", "/api/todos", 415, '{"title":"one"}', null);
    await expect(port, "POST", "/api/todos", 413, JSON.stringify({ title: "x".repeat(20000) }));
    await expect(port, "POST", "/api/todos", 413, ['{"title":"', "x".repeat(17000), '"}']);
    const padded = '{"title":"boundary"}'.padEnd(16384, " ");
    const boundary = JSON.parse((await expect(port, "POST", "/api/todos", 201, padded)).body) as { id: number };
    await expect(port, "DELETE", `/api/todos/${boundary.id}`, 204);
    await expect(port, "POST", "/api/todos", 413, padded + " ");
    await expect(port, "POST", "/api/todos", 400, JSON.stringify({ title: "x".repeat(121) }));
    for (const id of ["0", "-1", "1.0", "01", "1e0", "9007199254740992", "%ZZ"]) {
      await expect(port, "DELETE", `/api/todos/${id}`, 400);
    }
    await expect(port, "PATCH", "/api/todos/999", 404, '{"completed":true}');
    assert.match((await expect(port, "PUT", "/api/todos", 405)).headers.allow ?? "", /GET/);
    await expect(port, "GET", "/missing", 404);
    await expect(port, "GET", "/api/todos/", 404);
    assert.equal((await expect(port, "HEAD", "/api/todos", 405)).body, "");
    assert.equal((await expect(port, "DELETE", "/api/todos/1", 204)).body, "");
    await expect(port, "DELETE", "/api/todos/1", 404);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/api/todos", 200)).body), []);
    const duplicate = spawnSync(`${root}examples/todo/.scriptc/app`, [String(port)], { cwd: `${root}examples/todo`, timeout: 5000 });
    assert.ifError(duplicate.error);
    assert.notEqual(duplicate.status, 0, "Port conflict must fail startup");
    const failure = JSON.parse(duplicate.stderr.toString());
    assert.equal(failure.event, "startupFailed");
    assert.match(failure.message, /EADDRINUSE/);
    await new Promise<void>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write("POST /api/todos HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{", () => socket.destroy());
      });
      socket.setTimeout(4000, () => socket.destroy(new Error("Socket timed out")));
      socket.on("error", reject);
      socket.on("close", () => resolve());
    });
    await expect(port, "GET", "/health", 200);
  });
});

test("Todo search, pagination, details and response middleware", async () => {
  await withServer("examples/todo/.scriptc/app", async (port) => {
    for (const title of ["Alpha", "Beta", "alphabet"]) await expect(port, "POST", "/api/todos", 201, JSON.stringify({ title }));
    await expect(port, "PATCH", "/api/todos/1", 200, '{"completed":true}');
    const page = await expect(port, "GET", "/api/todos?q=ALP&limit=1&offset=1", 200);
    assert.equal(page.headers["x-total-count"], "2");
    assert.deepEqual(JSON.parse(page.body), [{ id: 3, title: "alphabet", completed: false }]);
    assert.equal(JSON.parse((await expect(port, "GET", "/api/todos?status=completed", 200)).body).length, 1);
    assert.equal(JSON.parse((await expect(port, "GET", "/api/todos?status=active", 200)).body).length, 2);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/api/todos?offset=99", 200)).body), []);
    assert.equal(JSON.parse((await expect(port, "GET", "/api/todos/1", 200)).body).title, "Alpha");
    await expect(port, "GET", "/api/todos/999", 404);
    for (const query of ["limit=0", "limit=101", "offset=-1", "offset=01", "limit=x", "status=wrong", "q=a&q=b", "status=all&status=active", "limit=1&limit=2"]) await expect(port, "GET", `/api/todos?${query}`, 400);
    const home = await expect(port, "GET", "/", 200);
    assert.equal(home.headers["x-content-type-options"], "nosniff");
    assert.match(home.body, /id="filter-form"/);
    assert.equal((await expect(port, "GET", "/api/todos?limit=0", 400)).headers["referrer-policy"], "same-origin");
  });
});
