import type { Handler } from "./router";
import type { Middleware } from "./requestPipeline";

type RegisterRoute = (method: string, path: string, handler: Handler, middleware: Middleware[]) => void;

function normalizePrefix(prefix: string): string {
  if (!prefix.startsWith("/") || prefix.includes("//") || prefix.includes("?") || prefix.includes("#")) throw new Error("Invalid group prefix");
  if (prefix === "/") return "";
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

/** 前缀与中间件的组合视图；所有路由最终注册到同一张路由表。
 * 中间件数组在创建时复制，子组继承父组顺序；保留引用也不能在应用启动后注册。
 */
export class RouteGroup {
  private prefix: string;
  private middleware: Middleware[];

  constructor(prefix: string, private register: RegisterRoute, middleware: Middleware[] = []) {
    this.prefix = normalizePrefix(prefix);
    this.middleware = middleware.slice();
  }

  /** path 为组内绝对路径；空字符串表示前缀本身，/ 表示带尾斜杠路径。 */
  route(method: string, path: string, handler: Handler, middleware: Middleware[] = []): void {
    if (path !== "" && !path.startsWith("/")) throw new Error("Invalid group route path");
    this.register(method, `${this.prefix}${path}` || "/", handler, this.middleware.concat(middleware));
  }

  get(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("GET", path, handler, middleware); }
  post(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("POST", path, handler, middleware); }
  put(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("PUT", path, handler, middleware); }
  patch(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("PATCH", path, handler, middleware); }
  delete(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("DELETE", path, handler, middleware); }
  head(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("HEAD", path, handler, middleware); }
  options(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("OPTIONS", path, handler, middleware); }

  /** 创建子前缀；组中间件仅在路由与方法均匹配后执行。 */
  group(prefix: string, middleware: Middleware[] = []): RouteGroup {
    const suffix = normalizePrefix(prefix);
    return new RouteGroup(`${this.prefix}${suffix}` || "/", this.register, this.middleware.concat(middleware));
  }
}
