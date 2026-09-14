import type { RouteGroup, HttpContext, Middleware } from "@backts/core";

/** Controller 路由描述；handle 显式调用实例并发送响应，不按方法名反射。
 * 需要返回值转换时，可在显式绑定函数中组合 core 的 resultHandler。
 */
export interface ControllerRoute<T> {
  method: string;
  path: string;
  handle: (controller: T, context: HttpContext) => Promise<void>;
  middleware?: Middleware[];
}

/** 将路由描述快照转换为 scope.controller 的绑定函数，最终调用 core.route。
 * 不改变路径、方法、HEAD、错误或单次响应语义；注册失败直接传播。
 */
export function bindControllerRoutes<T>(definitions: ControllerRoute<T>[]): (routes: RouteGroup, controller: T) => void {
  const snapshot: Required<ControllerRoute<T>>[] = [];
  for (const route of definitions) snapshot.push({
    method: route.method,
    path: route.path,
    handle: route.handle,
    middleware: route.middleware === undefined ? [] : route.middleware.slice(),
  });
  return (routes, controller) => {
    for (const route of snapshot) {
      routes.route(route.method, route.path, (context) => route.handle(controller, context), route.middleware);
    }
  };
}
