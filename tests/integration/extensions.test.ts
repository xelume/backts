import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { expect, withServer } from "./nativeServer.ts";

interface Events {
  trace: string[];
  errors: string[];
  results: { path: string; status: number; durationMs: number; outcome: string }[];
}

test("native extension contracts: composition, errors, completion and configuration freeze", async () => {
  const directory = mkdtempSync(join(tmpdir(), "scriptc-extensions-"));
  writeFileSync(join(directory, "hello.txt"), "hello");
  try {
    await withServer("packages/core/.scriptc/extensionsServer", async (port) => {
      const order = await expect(port, "GET", "/api/nested/order", 204);
      assert.equal(order.headers["x-global"], "yes");
      assert.equal(order.headers["x-group"], "yes");
      let events: Events = JSON.parse((await expect(port, "GET", "/events", 200)).body);
      assert.deepEqual(events.trace, ["global:before", "group:before", "nested:before", "route:before", "handler", "route:after", "nested:after", "group:after", "global:after"]);
      const staticResponse = await expect(port, "GET", "/static/hello.txt", 200);
      assert.equal(staticResponse.headers["x-global"], "yes");
      assert.equal(staticResponse.headers["x-group"], undefined);
      assert.equal((await expect(port, "GET", "/missing", 404)).headers["x-global"], "yes");
      assert.equal((await expect(port, "POST", "/api/items/fixed", 405)).headers["x-group"], undefined);
      await Promise.all(Array.from({ length: 12 }, async (_, id) => {
        assert.deepEqual(JSON.parse((await expect(port, "GET", `/api/items/${id}`, 200)).body), { id: String(id) });
      }));
      await expect(port, "GET", "/short", 401);
      await expect(port, "GET", "/double", 204);
      await expect(port, "GET", "/not-awaited", 204);
      assert.deepEqual(JSON.parse((await expect(port, "GET", "/mapped", 422)).body), { error: "mapped" });
      for (const path of ["/observer-error", "/broken-mapper", "/empty-mapper"]) {
        assert.deepEqual(JSON.parse((await expect(port, "GET", path, 500)).body), { error: "Internal server error" });
      }
      await expect(port, "GET", "/completion-error", 204);
      await expect(port, "POST", "/body", 200, "x".repeat(128));
      await expect(port, "POST", "/body", 413, "x".repeat(129));
      const socket = connect(port, "127.0.0.1");
      await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
      socket.write("GET /abort HTTP/1.1\r\nHost: localhost\r\n\r\n");
      await delay(30);
      socket.destroy();
      await delay(150);
      events = JSON.parse((await expect(port, "GET", "/events", 200)).body);
      assert(events.errors.includes("/double"));
      assert(events.errors.includes("/not-awaited"));
      assert(!events.errors.includes("/short"));
      const completed = events.results.filter((result) => result.path === "/api/nested/order");
      assert.equal(completed.length, 1);
      assert.equal(completed[0]!.outcome, "completed");
      assert.equal(completed[0]!.status, 204);
      assert(completed[0]!.durationMs >= 0);
      const aborted = events.results.filter((result) => result.path === "/abort");
      assert.equal(aborted.length, 1);
      assert.equal(aborted[0]!.outcome, "closed");
      await expect(port, "GET", "/health", 200);
    }, "SIGTERM", null, [directory]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
