import { ApplicationLogger } from "./logger";
import { HttpContext } from "./httpContext";
/** 默认 HTTP 映射与原始异常；cause 仅供服务端诊断，不应直接发送给客户端。 */
export interface RequestFailure { status: number; message: string; cause: unknown; }

/** 自定义错误响应；仅在尚未响应时调用，必须提交一次响应。 */
export type ErrorHandler = (failure: RequestFailure, context: HttpContext) => Promise<void>;
/** 只观察错误，不参与生成响应；异步回调必须返回 Promise。 */
export type ErrorObserver = (failure: RequestFailure, context: HttpContext) => Promise<void>;

export class RequestErrors {
  constructor(private logger: ApplicationLogger, private handler?: ErrorHandler, private observer?: ErrorObserver) {}

  async handle(failure: RequestFailure, context: HttpContext): Promise<void> {
    this.logger.message("requestError", failure.status >= 500 ? "error" : "warn", `${context.method} ${context.path}: Request error (${failure.status})`);
    const observer = this.observer;
    if (observer !== undefined) {
      try { await observer(failure, context); }
      catch { this.logger.message("internalError", "error", "Request error observer failed"); }
    }
    if (context.responded) return;
    const handler = this.handler;
    if (handler !== undefined) {
      try {
        await handler(failure, context);
        if (!context.responded) throw new Error("Error handler did not send a response");
        return;
      } catch {
        this.logger.message("internalError", "error", "Request error handler failed");
        if (context.responded) return;
        context.json(500, JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }
    context.json(failure.status, JSON.stringify({ error: failure.message }));
  }
}
