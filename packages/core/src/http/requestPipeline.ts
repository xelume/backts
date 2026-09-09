import { HttpContext } from "./httpContext";
import type { Handler } from "./router";

/** 继续执行后续处理；必须 await 或 return，且每层至多调用一次。 */
export type Next = () => Promise<void>;
/** 按注册顺序进入、逆序返回；可不调用 next 并自行响应。 */
export type Middleware = (context: HttpContext, next: Next) => Promise<void>;

class NextState {
  called = false;
  active = true;
  completed = false;
  pending: Promise<void> | null = null;
}

async function observeNext(pending: Promise<void>, state: NextState): Promise<void> {
  try { await pending; } catch { /* 原 Promise 仍向调用者传播拒绝。 */ }
  finally { state.completed = true; }
}

/** 每次执行独享游标；注册数组在装配时复制，不携带跨请求状态。 */
export class RequestPipeline {
  private middleware: Middleware[];

  constructor(middleware: Middleware[], private terminal: Handler) {
    this.middleware = middleware.slice();
  }

  execute(context: HttpContext): Promise<void> { return this.invoke(context, 0); }

  private async invoke(context: HttpContext, index: number): Promise<void> {
    if (index === this.middleware.length) {
      await this.terminal(context);
      return;
    }
    const middleware = this.middleware[index]!;
    const state = new NextState();
    const next = (): Promise<void> => {
      if (!state.active) throw new Error("next called after middleware completed");
      if (state.called) throw new Error("next called more than once");
      state.called = true;
      const pending = this.invoke(context, index + 1);
      state.pending = pending;
      // 立即观察拒绝，错误仍由原 Promise 传给 await next()。
      void observeNext(pending, state);
      return pending;
    };
    try {
      await middleware(context, next);
    } finally {
      state.active = false;
      const pending = state.pending;
      if (pending !== null && !state.completed) {
        // 收拢误用产生的异步工作，避免错误响应与后续处理并发写入。
        try { await pending; } catch { /* 以中间件契约错误报告。 */ }
        throw new Error("Middleware completed before next; await or return next()");
      }
    }
  }
}
