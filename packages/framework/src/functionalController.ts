import { resultHandler, type HttpContext, type Middleware, type RouteGroup, type ResultTransform } from "@backts/core";
import { defineController, jsonRoute, type ControllerExceptionMapper } from "./controller";
import type { ControllerRegistration } from "./controllerProvider";
import type { ProviderResolver } from "./providerResolver";
import { emptyRoute } from "./native";

/** 已保存结果类型的函数式接口；通过 HTTP 方法入口声明。 */
export interface Route {
  register: (routes: RouteGroup, middleware: Middleware[]) => void;
}

/** 控制器的接口与局部边界；业务依赖由装配回调的闭包持有。 */
export interface RoutesOptions {
  routes: Route[];
  mapException?: ControllerExceptionMapper;
  interceptors?: Middleware[];
}

/** JSON 接口的响应配置；默认 200，创建资源时显式指定 201。 */
export interface JsonOptions<R> {
  status?: number;
  transforms?: ResultTransform<R>[];
  middleware?: Middleware[];
}

/** 默认有数据时 JSON 200，无返回值时 204；显式 status 优先。
 * status: 204 忽略返回值且禁止结果转换。
 */
export interface RouteOptions<R> extends JsonOptions<R> {}

/** 直接注册函数式接口；有依赖时传同步装配回调，每个应用/模块执行一次。
 * resolver 只能在装配期间使用；请求处理应捕获已解析的业务依赖。
 * 静态配置在声明时快照；回调返回的配置在装配时快照。
 * scriptc 内联装配回调需标注返回 RoutesOptions，或返回已声明此类型的函数结果。
 */
export function controller(input: RoutesOptions | ((resolve: ProviderResolver) => RoutesOptions)): ControllerRegistration {
  if (typeof input === "function") {
    return { configure: (resolve, scope) => {
      scope.controller(() => input(resolve), (routes, options) => bind(options)(routes, 0));
    } };
  }
  const register = bind(input);
  return { configure: (_resolve, scope) => { scope.controller(() => 0, register); } };
}

function bind(options: RoutesOptions): (routes: RouteGroup, instance: number) => void {
  return defineController<number>({
    routes: options.routes.map((route) => {
      const register = route.register;
      return { register: (routes: RouteGroup, _instance: number, middleware: Middleware[]) => register(routes, middleware) };
    }),
    mapException: options.mapException ?? ((_error: Error) => undefined),
    interceptors: options.interceptors ?? [],
  });
}

/** 返回可 JSON 序列化的业务结果，支持同步或异步处理；不能自行发送响应。
 * R 是处理器的原始返回类型；scriptc 下异步处理器配 transforms 时显式传 Promise<Result>。
 */
export function json<R>(method: string, path: string, handle: (context: HttpContext) => R, options: JsonOptions<Awaited<R>> = {}): Route {
  // 保留具体返回类型；scriptc 不支持回调返回 T | Promise<T>，await 后显式标注解析结果。
  const endpoint = jsonRoute<number, Awaited<R>>({
    method, path,
    action: async (_instance, context): Promise<Awaited<R>> => await handle(context) as Awaited<R>,
    status: options.status ?? 200,
    transforms: options.transforms ?? [],
    middleware: options.middleware ?? [],
  });
  return { register: (routes, middleware) => endpoint.register(routes, 0, middleware) };
}

function methodRoute<R>(method: string, path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>>): Route {
  if (options.status === 204) {
    if ((options.transforms ?? []).length > 0) throw new Error("204 routes cannot transform a response body");
    return emptyRoute(method, path, async (context) => { await handle(context); }, { status: 204, middleware: options.middleware ?? [] });
  }
  const handler = resultHandler<Awaited<R>>(async (context): Promise<Awaited<R>> => await handle(context) as Awaited<R>, {
    status: options.status ?? 200,
    emptyStatus: options.status ?? 204,
    serialize: (value) => {
      if (value === undefined) throw new Error("Empty result reached JSON serialization");
      // scriptc 支持记录内的可选值；固定字段包装后去掉外壳，保留原始 JSON 值。
      const envelope: { value: Awaited<R> } = { value };
      const encoded = JSON.stringify(envelope);
      if (encoded === "{}") throw new Error("Result serializer must return JSON text");
      return encoded.slice(9, -1);
    },
    transforms: options.transforms ?? [],
  });
  const middleware = (options.middleware ?? []).slice();
  return { register: (routes, boundary) => { routes.route(method, path, handler, boundary.concat(middleware)); } };
}

/** GET 接口；HEAD 需要单独声明。 */
export function get<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("GET", path, handle, options);
}

/** POST 接口；创建资源时用 options.status 显式声明 201。 */
export function post<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("POST", path, handle, options);
}

/** PATCH 接口；无返回值时默认 204。 */
export function patch<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("PATCH", path, handle, options);
}

/** PUT 接口；默认返回 JSON，无返回值时默认 204。 */
export function put<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("PUT", path, handle, options);
}

/** HEAD 接口；执行处理与转换，响应体由 core 的 HEAD 语义抑制。 */
export function head<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("HEAD", path, handle, options);
}

/** OPTIONS 接口；响应头由处理器设置，不隐式添加 CORS 策略。 */
export function options<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("OPTIONS", path, handle, options);
}

/** DELETE 接口；默认返回 JSON，无返回值时默认 204。 */
export function del<R>(path: string, handle: (context: HttpContext) => R, options: RouteOptions<Awaited<R>> = {}): Route {
  return methodRoute<R>("DELETE", path, handle, options);
}
