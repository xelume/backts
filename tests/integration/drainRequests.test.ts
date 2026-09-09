import assert from "node:assert/strict";
import { connect, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { expect, withServer } from "./nativeServer.ts";

test("close drains an active response completely and releases idle sockets", async () => {
  await withServer("packages/core/.scriptc/drainServer", async (port) => {
    const idle = connect(port, "127.0.0.1");
    idle.on("error", () => {});
    await new Promise<void>((resolve, reject) => { idle.once("connect", resolve); idle.once("error", reject); });
    const idleClosed = new Promise<void>((resolve) => idle.once("close", () => resolve()));
    const response = expect(port, "GET", "/slow", 200);
    try {
      const deadline = Date.now() + 2000;
      while (!JSON.parse((await expect(port, "GET", "/state", 200)).body).active) {
        assert(Date.now() < deadline);
        await delay(10);
      }
      await expect(port, "POST", "/close", 204);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([idleClosed, new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Idle connection remained open")), 2000);
        })]);
      } finally { clearTimeout(timeout); }
      assert.equal(JSON.parse((await response).body).data, "payload".repeat(150_000));
      await assert.rejects(expect(port, "GET", "/health", 200));
    } finally { idle.destroy(); await response; }
  });
});

test("client aborts during draining do not strand connection ownership", async () => {
  await withServer("packages/core/.scriptc/drainServer", async (port) => {
    const socket: Socket = connect(port, "127.0.0.1");
    socket.on("error", () => {});
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
    socket.write("GET /slow HTTP/1.1\r\nHost: localhost\r\n\r\n");
    try {
      const deadline = Date.now() + 2000;
      while (!JSON.parse((await expect(port, "GET", "/state", 200)).body).active) {
        assert(Date.now() < deadline);
        await delay(10);
      }
      await expect(port, "POST", "/close", 204);
    } finally { socket.destroy(); }
  });
});
