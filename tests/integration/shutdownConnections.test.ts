import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { root, request, unusedPort } from "./nativeServer.ts";

async function holdConnection(port: number, partial: boolean, unmanaged: boolean): Promise<Socket> {
  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  // 退出可能直接关闭或 reset 连接，两者均为合法结果。
  socket.on("error", () => {});
  if (partial) {
    const path = unmanaged ? "/double-read" : "/api/todos";
    socket.write(`POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
  } else {
    const received = new Promise<void>((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => { socket.destroy(); reject(new Error("No keep-alive response")); }, 4000);
      socket.on("data", (chunk: Buffer) => {
        text += chunk.toString();
        if (text.includes("\r\n\r\n") && text.includes("{")) { clearTimeout(timer); resolve(); }
      });
    });
    socket.write("GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n");
    await received;
  }
  return socket;
}

async function verifyShutdown(launcher: "binary" | "pnpm" | "unmanaged", secondSignal: boolean, active = false): Promise<void> {
  const port = await unusedPort();
  const command = launcher === "pnpm" ? "pnpm" : `${root}${launcher === "unmanaged" ? "packages/core/.scriptc/httpServer" : "examples/todo/.scriptc/app"}`;
  const child = spawn(command, launcher === "pnpm" ? ["start", String(port)] : [String(port)], {
    cwd: launcher === "pnpm" ? root : `${root}examples/todo`,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert(child.pid);
  let output = "";
  let ended = false;
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => { ended = true; resolve(); });
  });
  let socket: Socket | undefined;
  let groupGone = false;
  function signalGroup(signal: NodeJS.Signals): void {
    try { process.kill(-child.pid!, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
  try {
    const readyBy = Date.now() + 10000;
    while (true) {
      assert(!ended, output);
      try { if ((await request(port, "GET", "/health")).status === 200) break; } catch {}
      assert(Date.now() < readyBy, `Readiness timed out: ${output}`);
      await delay(50);
    }
    socket = await holdConnection(port, secondSignal || active, launcher === "unmanaged");
    await delay(100);
    assert(!socket.destroyed, "Connection must remain open to reproduce shutdown hang");
    const began = Date.now();
    signalGroup(launcher === "unmanaged" ? "SIGTERM" : "SIGINT");
    if (secondSignal) {
      const seenBy = Date.now() + 2000;
      while (!output.includes("Shutting down;")) {
        assert(Date.now() < seenBy && !ended, output);
        await delay(20);
      }
      // 第二次用户操作与 pnpm 对第一次操作的转发突发分开。
      await delay(350);
      signalGroup("SIGINT");
    }
    const timeout = setTimeout(() => signalGroup("SIGKILL"), 8000);
    try { await closed; } finally { clearTimeout(timeout); }
    const elapsed = Date.now() - began;
    if (!active && !secondSignal) {
      assert(elapsed < 3000, `Idle connection took ${elapsed}ms to close`);
      assert.doesNotMatch(output, /timed out|Forced shutdown/);
      if (launcher === "binary") assert.equal(child.exitCode, 0, output);
    } else if (launcher === "unmanaged") {
      assert.equal(child.exitCode, 0, output);
      assert(elapsed >= 4500 && elapsed < 8000, `Connection deadline took ${elapsed}ms`);
    }
    else {
      assert.match(output, secondSignal ? /Forced shutdown requested/ : /Server shutdown timed out/);
      if (secondSignal) assert(elapsed < 3000, `Second signal took ${elapsed}ms`);
      else assert(elapsed >= 4500 && elapsed < 8000, `Deadline took ${elapsed}ms`);
      assert.notEqual(child.exitCode, 0, output);
    }
    // 即便 pnpm 先结束，也必须确认同组原生子进程已退出，而非仅停止监听。
    const goneBy = Date.now() + 2000;
    while (!groupGone && Date.now() < goneBy) {
      try { process.kill(-child.pid, 0); await delay(30); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") groupGone = true; else throw error; }
    }
    assert(groupGone, `Descendant process survived: ${output}`);
    await assert.rejects(request(port, "GET", "/health"));
  } finally {
    socket?.destroy();
    if (!groupGone) signalGroup("SIGKILL");
    await closed;
  }
}

for (const launcher of ["binary", "pnpm"] as const) {
  test(`${launcher}: idle keep-alive closes without waiting for the deadline`, async () => {
    await verifyShutdown(launcher, false);
  });
  test(`${launcher}: unfinished request connections are closed at the deadline`, async () => {
    await verifyShutdown(launcher, false, true);
  });
  test(`${launcher}: second Ctrl+C terminates an unfinished request immediately`, async () => {
    await verifyShutdown(launcher, true);
  });
}

test("unmanaged close destroys overdue connections without forcing process exit", async () => {
  await verifyShutdown("unmanaged", false, true);
});
