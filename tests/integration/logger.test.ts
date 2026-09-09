import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import { request, unusedPort, root } from "./nativeServer.ts";

test("native framework logger supports readable and JSON output without ANSI in pipes", () => {
  const binary = `${root}packages/core/.scriptc/logger`;
  for (const format of ["pretty", "json"]) {
    const result = spawnSync(binary, { encoding: "utf8", timeout: 8000, env: { ...process.env, LOG_FORMAT: format, TZ: "UTC" } });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert(!result.stdout.includes("\x1b"));
    if (format === "json") {
      assert.deepEqual(JSON.parse(result.stdout).request, { method: "GET", path: "/probe", status: 200, durationMs: 0, outcome: "completed" });
      assert.equal(JSON.parse(result.stderr).event, "requestError");
    } else {
      assert.match(result.stdout, /^\[BackTS\]  \d{2}:\d{2}:\d{2}  INFO\s+\[HTTP\]\s+GET\s+\/probe\s+→ 200\s+<1 ms\n$/);
      assert.match(result.stderr, /WARN\s+\[Exception\]\s+POST \/probe: Request error \(400\)/);
    }
  }
});

for (const mode of ["default", "listen", "routesOff", "off", "json", "custom", "broken"]) {
  test(`Application logger ${mode} preserves responses and observers`, async () => {
    const port = await unusedPort();
    const child = spawn(`${root}packages/core/.scriptc/loggerServer`, [String(port), mode, `${root}examples/todo/public`], {
      env: { ...process.env, LOG_FORMAT: "pretty" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", () => resolve());
    });
    try {
      const deadline = Date.now() + 8000;
      while (true) {
        try { if ((await request(port, "GET", "/health")).status === 200) break; } catch {}
        assert(Date.now() < deadline && child.exitCode === null, output);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal((await request(port, "GET", "/error")).status, 500);
      const observed = JSON.parse((await request(port, "GET", "/health")).body);
      assert.equal(observed.errors, 1);
      assert(observed.completions >= 2);
    } finally {
      child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 7000);
      try { await exited; } finally { clearTimeout(timeout); }
    }
    assert.equal(child.exitCode, 0, output);
    if (mode === "off" || mode === "broken") assert.equal(output, "");
    else if (mode === "default" || mode === "listen" || mode === "routesOff") {
      assert.match(output, /INFO\s+\[HTTP\]\s+GET\s+\/health\s+→ 200/);
      assert.match(output, /ERROR\s+\[HTTP\]\s+GET\s+\/error\s+→ 500/);
      assert.match(output, /Listening on/);
      if (mode === "routesOff") assert.doesNotMatch(output, /\[Routes\]|\[Static\]/);
      else {
        assert.equal(output.match(/\[Routes\]/g)?.length, 3);
        assert.match(output, /\[Routes\]\s+GET\s+\/api\/todos\/:id/);
        assert.match(output, /\[Static\]\s+GET\/HEAD\s+\/assets \(static mount\)/);
        assert(output.indexOf("Listening on") < output.indexOf("[Routes]"));
      }
      assert.match(output, /Server closed/);
      assert(!output.includes("\x1b"));
    } else {
      const events = output.trim().split("\n").map((line) => {
        if (mode === "custom") { assert(line.startsWith("CUSTOM ")); line = line.slice(7); }
        return JSON.parse(line);
      });
      for (const name of ["listening", "requestCompleted", "requestError", "closing", "closed"]) {
        assert(events.some((event) => event.event === name), `Missing ${name}: ${output}`);
      }
      assert.equal(events.filter((event) => event.event === "requestCompleted" && event.request.path === "/error").length, 1);
      assert.deepEqual(events.filter((event) => event.event === "routeMapped").map((event) => event.route), [
        { method: "GET", path: "/health" }, { method: "GET", path: "/error" }, { method: "GET", path: "/api/todos/:id" },
      ]);
      assert.deepEqual(events.filter((event) => event.event === "staticMounted").map((event) => event.route), [{ method: "GET/HEAD", path: "/assets" }]);
      assert(events.findIndex((event) => event.event === "listening") < events.findIndex((event) => event.event === "routeMapped"));
      assert(!output.includes(`${root}examples`));
      assert(!output.includes("Private failure"));
      assert(!output.includes("\x1b"));
    }
  });
}

test("disabled logger keeps startup failure silent and nonzero", () => {
  const result = spawnSync(`${root}packages/core/.scriptc/loggerServer`, ["-1", "off", `${root}examples/todo/public`], { encoding: "utf8", timeout: 8000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout + result.stderr, "");
});

test("failed startup emits no route inventory", () => {
  const result = spawnSync(`${root}packages/core/.scriptc/loggerServer`, ["-1", "json", `${root}examples/todo/public`], { encoding: "utf8", timeout: 8000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).event, "startupFailed");
});
