import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { expect, root, withServer } from "./nativeServer.ts";

test("native class compatibility", () => {
  assert.match(execFileSync(`${root}packages/core/.scriptc/compatibility`, { encoding: "utf8", timeout: 8000 }), /compatibility ok/);
});

test("framework HTTP contracts through the public package entry", async () => {
  await withServer("packages/core/.scriptc/httpServer", async (port) => {
    const target = "/inspect?tag=a+b&tag=%E4%B8%AD&empty=";
    assert.deepEqual(JSON.parse((await expect(port, "GET", target, 200)).body), { url: target, tags: ["a b", "中"], empty: "", missing: true, type: "application/json" });
    assert.deepEqual(JSON.parse((await expect(port, "PUT", "/text", 200, "你好", "text/plain")).body), { text: "你好" });
    assert.equal((await expect(port, "POST", "/bytes", 200, ["abc", "def"], "application/octet-stream")).body, "abcdef");
    await expect(port, "POST", "/bytes", 413, "x".repeat(16_385), "application/octet-stream");
    await expect(port, "POST", "/mixed-read", 500, "{}");
    assert.equal((await expect(port, "HEAD", "/explicit", 204)).headers["x-head"], "yes");
    assert.equal((await expect(port, "OPTIONS", "/explicit", 204)).headers.allow, "HEAD, OPTIONS");
    await expect(port, "PUT", "/custom", 204);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/items/fixed", 200)).body), { fixed: true });
    await expect(port, "POST", "/items/fixed", 405);
    assert.deepEqual(JSON.parse((await expect(port, "GET", "/items/a%20b", 200)).body), { id: "a b" });
    for (const path of ["/error", "/missing-response"]) {
      assert.deepEqual(JSON.parse((await expect(port, "GET", path, 500)).body), { error: "Internal server error" });
    }
    await expect(port, "GET", "/double-response", 200);
    await expect(port, "POST", "/double-read", 500, "{}");
    await Promise.all(Array.from({ length: 24 }, async (_, index) => {
      const response = await expect(port, "GET", `/request/${index}`, 200);
      assert.deepEqual(JSON.parse(response.body), { id: String(index) });
    }));
  });
});
