import { HttpError, resultHandler, type HttpContext, type Middleware, type RouteGroup, type ResultTransform } from "@backts/core";

/** 保留各接口结果类型的注册描述；由 jsonRoute 创建。 */
export interface ControllerEndpoint<T> {
  register: (routes: RouteGroup, controller: T, middleware: Middleware[]) => void;
}

/** 返回 undefined 时保留原异常；仅声明业务错误到 HTTP 错误的映射。 */
export type ControllerExceptionMapper = (error: Error) => HttpError | undefined;

export interface ControllerOptions<T> {
  routes: ControllerEndpoint<T>[];
  mapException?: ControllerExceptionMapper;
  /** 前后拦截复用 core Middleware 的 next、短路和响应约束。 */
  interceptors?: Middleware[];
}

export interface JsonRouteOptions<T, R> {
  method: string;
  path: string;
  action: (controller: T, context: HttpContext) => Promise<R>;
  /** 默认 200；创建接口显式声明 201。 */
  status?: number;
  /** 发送前按序转换同一类型的结果。 */
  transforms?: ResultTransform<R>[];
  middleware?: Middleware[];
}

// scriptc 0.1.1 直接抛出可选值会丢失异常类型；参数边界保留原错误对象。
function throwMappedError(error: HttpError): never { throw error; }

/** 快照声明并生成 Controller 注册器，供 scope.controller 装配使用。 */
export function defineController<T>(options: ControllerOptions<T>): (routes: RouteGroup, controller: T) => void {
  const endpoints: ControllerEndpoint<T>[] = [];
  for (const endpoint of options.routes) endpoints.push({ register: endpoint.register });
  const mapException = options.mapException;
  const middleware: Middleware[] = [];
  if (mapException !== undefined) {
    middleware.push(async (_context, next) => {
      try { await next(); }
      catch (error) {
        if (!(error instanceof Error)) throw error;
        const mapped = mapException(error);
        if (mapped !== undefined) throwMappedError(mapped);
        throw error;
      }
    });
  }
  for (const interceptor of options.interceptors ?? []) middleware.push(interceptor);
  return (routes, controller) => {
    for (const endpoint of endpoints) endpoint.register(routes, controller, middleware);
  };
}

/** 类型化 JSON 接口，自动序列化返回值；复用 core 的响应与错误契约。
 * 返回值须可 JSON 序列化，不支持 undefined、函数、循环对象或流。
 * action 可设置响应头，不能自行发送响应。
 */
export function jsonRoute<T, R>(options: JsonRouteOptions<T, R>): ControllerEndpoint<T> {
  const method = options.method;
  const path = options.path;
  const action = options.action;
  const status = options.status ?? 200;
  const transforms = options.transforms === undefined ? [] : options.transforms.slice();
  const middleware = options.middleware === undefined ? [] : options.middleware.slice();
  return { register: (routes, controller, boundary) => {
    routes.route(method, path, resultHandler((context) => action(controller, context), {
      status,
      transforms,
      serialize: (value) => JSON.stringify(value),
    }), boundary.concat(middleware));
  } };
}
