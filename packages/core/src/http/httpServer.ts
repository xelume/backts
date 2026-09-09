import { ApplicationLogger } from "./logger";
import { createServer, type Server } from "node:http";
import { HttpContext } from "./httpContext";
import { HttpConnections } from "./httpConnections";
import { HttpError } from "./httpError";
import type { Handler } from "./router";
import type { ResolvedListenOptions } from "./listenOptions";
import { RequestErrors } from "./requestErrors";

/** 响应传输结果快照；closed 表示响应完成前连接已关闭，不代表业务已取消。 */
export interface RequestCompletion {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  outcome: string;
}
/** 不参与响应；Promise 拒绝由框架隔离，不自动延长服务关闭等待。 */
export type CompletionObserver = (result: RequestCompletion) => Promise<void>;

/** HTTP 传输适配器；只管理连接和响应生命周期，不接管进程退出。 */
export class HttpServer {
  private connections = new HttpConnections();
  private server: Server | null = null;
  private closing: Promise<void> | null = null;
  private started = false;

  constructor(
    private maximumBodyBytes: number,
    private handle: Handler,
    private errors: RequestErrors,
    private onClosed: () => void,
    private onListening: () => void,
    private logger: ApplicationLogger,
    private observer?: CompletionObserver,
  ) {}

  get forced(): boolean { return this.connections.forced; }
  forceClose(): void { this.connections.forceClose(); }

  private async observe(result: RequestCompletion): Promise<void> {
    this.logger.complete(result);
    const observer = this.observer;
    if (observer === undefined) return;
    try { await observer(result); }
    catch { this.logger.message("internalError", "error", "Request completion observer failed"); }
  }

  listen(options: ResolvedListenOptions): Promise<void> {
    if (this.started) throw new Error("Application already started");
    this.started = true;
    const server = createServer(async (request, response) => {
      const release = this.connections.begin(request.socket);
      const startedAt = Date.now();
      const method = request.method ?? "GET";
      const path = (request.url ?? "/").split("?")[0]!;
      let finished = false;
      const finish = (outcome: string): void => {
        if (finished) return;
        finished = true;
        release();
        void this.observe({ method, path, status: response.statusCode, durationMs: Date.now() - startedAt, outcome });
      };
      response.on("close", () => { finish("closed"); });
      const context = new HttpContext(request, response, method, path, this.maximumBodyBytes, () => { finish("completed"); });
      try {
        if (this.connections.draining) {
          context.header("connection", "close");
          throw new HttpError(503, "Server is shutting down");
        }
        await this.handle(context);
        if (!context.responded) throw new Error("Handler did not send a response");
      } catch (error) {
        try {
          const status = error instanceof HttpError ? error.status : 500;
          const message = error instanceof HttpError ? error.message : "Internal server error";
          await this.errors.handle({ status, message, cause: error }, context);
        }
        catch {
          this.logger.message("internalError", "error", "Failed to send error response");
          request.socket.destroy();
        }
      }
    });
    server.on("connection", (socket) => { this.connections.track(socket); });
    this.server = server;
    return new Promise((resolve, reject) => {
      let listening = false;
      server.on("error", () => {
        if (listening) this.logger.message("internalError", "error", "HTTP server error");
        else reject(new Error("HTTP server failed"));
      });
      server.listen(options.port, options.host, () => {
        listening = true;
        this.logger.message("listening", "info", `Listening on http://${options.host}:${options.port}`);
        this.onListening();
        resolve();
      });
    });
  }

  close(): Promise<void> {
    const closing = this.closing;
    if (closing !== null) return closing;
    const server = this.server;
    if (server === null) return Promise.resolve();
    const result = new Promise<void>((resolve) => {
      this.logger.message("closing", "info", "Shutting down; waiting up to 5 seconds for connections");
      const deadline = setTimeout(() => { this.logger.message("shutdownTimeout", "error", "Server shutdown timed out"); this.connections.forceClose(); }, 5000);
      server.close(() => {
        clearTimeout(deadline);
        this.onClosed();
        this.logger.message("closed", "info", "Server closed");
        resolve();
      });
      this.connections.drainIdle();
    });
    this.closing = result;
    return result;
  }
}
