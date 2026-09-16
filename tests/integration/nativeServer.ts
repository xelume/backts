import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const root = fileURLToPath(new URL("../../", import.meta.url));

export interface HttpResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
  rawBody: Buffer;
}

/** 使用 Node HTTP 客户端验证原生服务，不在 Node 上执行框架实现。 */
export function request(
  port: number, method: string, path: string, body?: string | string[],
  contentType: string | null = "application/json",
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {};
    if (contentType !== null) headers["content-type"] = contentType;
    if (typeof body === "string") headers["content-length"] = Buffer.byteLength(body);
    if (Array.isArray(body)) headers["transfer-encoding"] = "chunked";
    const request = httpRequest({ host: "127.0.0.1", port, method, path, headers, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8"), rawBody: Buffer.concat(chunks) }));
    });
    request.setTimeout(4000, () => request.destroy(new Error("HTTP request timed out")));
    request.on("error", reject);
    if (Array.isArray(body)) {
      for (const chunk of body) request.write(chunk);
      request.end();
    } else request.end(body);
  });
}

export async function expect(
  port: number, method: string, path: string, status: number, body?: string | string[],
  contentType: string | null = "application/json",
): Promise<HttpResult> {
  const response = await request(port, method, path, body, contentType);
  assert.equal(response.status, status, `${method} ${path}: ${response.body}`);
  return response;
}

export async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address !== null && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

/** 每次启动独立临时端口；无论断言成功与否，均回收自己创建的进程。 */
export async function withServer(
  binary: string, verify: (port: number) => Promise<void>,
  shutdownSignal: "SIGTERM" | "SIGINT" = "SIGTERM",
  expectedExitSignal: "SIGTERM" | "SIGINT" | null = null,
  args: string[] = [],
): Promise<void> {
  const port = await unusedPort();
  const child = spawn(resolve(root, binary), [String(port), ...args], { cwd: resolve(root, binary, binary.includes("/build/") ? ".." : "../.."), stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let spawnError: Error | undefined;
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.on("error", (error) => { spawnError = error; });
  const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
  try {
    const deadline = Date.now() + 8000;
    while (true) {
      if (spawnError) throw spawnError;
      assert(child.exitCode === null && child.signalCode === null, `Server exited: ${output}`);
      try {
        if ((await request(port, "GET", "/health")).status === 200) break;
      } catch { /* 等待原生监听完成。 */ }
      assert(Date.now() < deadline, `Server readiness timed out: ${output}`);
      await delay(50);
    }
    await verify(port);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill(shutdownSignal);
    let forced = false;
    const timeout = setTimeout(() => { forced = true; child.kill("SIGKILL"); }, 5000);
    try { await exited; } finally { clearTimeout(timeout); }
    assert(!forced, `Graceful shutdown timed out: ${output}`);
    if (!spawnError) {
      assert.equal(child.signalCode, expectedExitSignal, `Unexpected exit signal: ${output}`);
      assert.equal(child.exitCode, expectedExitSignal === null ? 0 : null, `Server failed: ${output}`);
    }
  }
}
