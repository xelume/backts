import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { connect, createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { expect, root, unusedPort } from "./nativeServer.ts";

interface Running {
  child: ChildProcess;
  port: number;
  output: () => string;
  waitFor: (text: string) => Promise<void>;
  ended: Promise<void>;
}

async function scenario(mode: string, verify: (running: Running) => Promise<void>, occupiedPort?: number): Promise<void> {
  const port = occupiedPort ?? await unusedPort();
  const child = spawn(`${root}packages/core/.scriptc/resourceLifecycle`, [String(port), mode], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const ended = new Promise<void>((resolve, reject) => { child.once("close", () => resolve()); child.once("error", reject); });
  const deadline = setTimeout(() => { child.kill("SIGKILL"); }, 10000);
  try {
    await verify({ child, port, output: () => output, ended, waitFor: async (text) => {
      const until = Date.now() + 4000;
      while (!output.includes(text)) {
        assert(child.exitCode === null && child.signalCode === null && Date.now() < until, output);
        await delay(10);
      }
    } });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await ended;
    clearTimeout(deadline);
  }
}

test("resources snapshot callbacks, start in order and close once in reverse order", async () => {
  await scenario("sequence", async ({ child, output, ended }) => {
    await ended;
    assert.equal(child.exitCode, 0, output());
    assert.deepEqual(output().trim().split("\n"), ["start:first", "ready:first", "start:second", "start:third", "listening", "close:third", "close:second", "close:first", "closed"]);
  });
});

for (const mode of ["rollback", "rollback-close-error", "close-error", "during-start"]) {
  test(`resource lifecycle: ${mode}`, async () => {
    await scenario(mode, async ({ child, output, ended }) => {
      await ended;
      assert.equal(child.exitCode, 0, output());
      assert.equal(output().split("close:first").length, 2, output());
      if (mode.startsWith("rollback")) {
        assert.doesNotMatch(output(), /start:third|listening/);
        assert.match(output(), /close:second\nclose:first\nstart-error/);
      }
      if (mode.includes("error")) assert.match(output(), /close-error/);
      if (mode === "during-start") assert.doesNotMatch(output(), /start:second|listening/);
    });
  });
}

test("listener failure rolls back all initialized resources", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert(address !== null && typeof address !== "string");
  try {
    await scenario("bind-error", async ({ child, output, ended }) => {
      await ended;
      assert.equal(child.exitCode, 0, output());
      assert.match(output(), /close:third\nclose:second\nclose:first\nstart-error\nclosed/);
      assert.doesNotMatch(output(), /listening/);
    }, address.port);
  } finally { await new Promise<void>((resolve) => { server.close(() => resolve()); }); }
});

for (const path of ["/work", "/disconnect"]) {
  test(`managed resource cleanup waits for handler completion after ${path}`, async () => {
    await scenario("managed", async ({ child, port, output, waitFor, ended }) => {
      await waitFor("run:returned");
      assert.deepEqual(JSON.parse((await expect(port, "GET", "/health", 200)).body), { ready: true });
      if (path === "/work") await expect(port, "GET", path, 200);
      else {
        const socket = connect(port, "127.0.0.1");
        socket.on("error", () => {});
        try {
          socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\n\r\n`);
          await waitFor("handler:started");
        } finally { socket.destroy(); }
      }
      child.kill("SIGTERM");
      await ended;
      assert.equal(child.exitCode, 0, output());
      assert.match(output(), /handler:finished\nclose:third\nclose:second\nclose:first/);
    });
  });
}

test("signals during initialization prevent listening and roll back resources", async () => {
  await scenario("startup-signal", async ({ child, output, waitFor, ended }) => {
    await waitFor("start:first");
    child.kill("SIGINT");
    await ended;
    assert.equal(child.exitCode, 0, output());
    assert.match(output(), /close:first/);
    assert.doesNotMatch(output(), /start:second/);
  });
});

test("run rolls back failed initialization before exiting", async () => {
  await scenario("managed-start-error", async ({ child, output, ended }) => {
    await ended;
    assert.equal(child.exitCode, 1, output());
    assert.match(output(), /close:second\nclose:first/);
    assert.doesNotMatch(output(), /start:third|run:returned/);
  });
});

for (const mode of ["managed-close-error", "cleanup-hang", "second-signal"]) {
  test(`managed resource shutdown handles ${mode}`, async () => {
    await scenario(mode, async ({ child, output, waitFor, ended }) => {
      await waitFor("run:returned");
      child.kill("SIGTERM");
      await waitFor("close:second");
      if (mode === "second-signal") { await delay(350); child.kill("SIGINT"); }
      await ended;
      assert.equal(child.exitCode, 1, output());
      assert.equal(child.signalCode, null, output());
      if (mode === "managed-close-error") assert.match(output(), /close:first/);
    });
  });
}
