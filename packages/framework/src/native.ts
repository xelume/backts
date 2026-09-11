import type { HttpContext, Middleware, ResultTransform } from "@backts/core";
import type { Route } from "./functionalController";

/** CLI 的纯 void 路由适配契约；业务使用 get/post/put/patch/del/head/options。 */
export interface EmptyRouteOptions {
  status?: number;
  middleware?: Middleware[];
  transforms?: ResultTransform<void>[];
}

/** 编译器专用公开子路径：等待业务完成后发送空响应，不缓存请求状态。
 * 同步/异步 void 均由此处收敛，不实例化 JSON 的 void 泛型。
 */
export function emptyRoute<R extends void | Promise<void>>(method: string, path: string, handle: (context: HttpContext) => R, options: EmptyRouteOptions = {}): Route {
  const status = options.status ?? 204;
  if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error("Invalid empty response status");
  if ((options.transforms ?? []).length > 0) throw new Error("Empty routes cannot transform a response body");
  const middleware = (options.middleware ?? []).slice();
  return { register: (routes, boundary) => {
    routes.route(method, path, async (context) => {
      if (context.responded) throw new Error("Controller action cannot send a response directly");
      await handle(context);
      if (context.responded) throw new Error("Controller action cannot send a response directly");
      context.empty(status);
    }, boundary.concat(middleware));
  } };
}
