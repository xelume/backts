import { HttpContext } from "./httpContext";
import { HttpError } from "./httpError";

export type Handler = (context: HttpContext) => Promise<void>;

/** 路由注册快照，不暴露处理器；path 保留完整前缀和参数名。 */
export interface RouteInfo { method: string; path: string; }

class Route {
  constructor(
    public method: string,
    public segments: string[],
    public handler: Handler,
  ) {}
}

/** 显式路由表；静态段逐段优先于参数段，同形路由不允许重复。 */
export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
      throw new Error("Invalid route path");
    }
    const segments = path.split("/");
    const names: string[] = [];
    for (const segment of segments) {
      if (segment.startsWith(":")) {
        const name = segment.slice(1);
        if (name.length === 0 || names.includes(name)) throw new Error("Invalid parameter name");
        names.push(name);
      }
    }
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== segments.length) continue;
      let same = true;
      for (let index = 0; index < segments.length; index += 1) {
        const left = route.segments[index]!;
        const right = segments[index]!;
        if (left !== right && !(left.startsWith(":") && right.startsWith(":"))) same = false;
      }
      if (same) throw new Error("Duplicate route");
    }
    this.routes.push(new Route(method, segments, handler));
  }

  /** 按注册顺序返回独立快照，修改结果不会改变路由匹配。 */
  describe(): RouteInfo[] {
    return this.routes.map((route) => ({ method: route.method, path: route.segments.join("/") }));
  }

  async dispatch(context: HttpContext): Promise<void> {
    if (!await this.tryDispatch(context)) throw new HttpError(404, "Not found");
  }

  /** 仅没有匹配路径时返回 false；方法错误或处理器异常不会触发后备服务。 */
  async tryDispatch(context: HttpContext): Promise<boolean> {
    const parts = context.path.split("/");
    let bestIndex = -1;
    let bestRank = "";
    // 先选路径，再选方法：静态资源不会因方法不匹配落入参数路由。
    for (let index = 0; index < this.routes.length; index += 1) {
      const route = this.routes[index]!;
      if (route.segments.length !== parts.length) continue;
      let matches = true;
      let rank = "";
      for (let part = 0; part < parts.length; part += 1) {
        const segment = route.segments[part]!;
        if (segment.startsWith(":")) {
          if (parts[part] === "") matches = false;
          rank += "0";
        } else {
          if (segment !== parts[part]) matches = false;
          rank += "1";
        }
      }
      if (matches && (bestIndex < 0 || rank > bestRank)) {
        bestIndex = index;
        bestRank = rank;
      }
    }
    if (bestIndex < 0) return false;
    const best = this.routes[bestIndex]!;
    const allowed: string[] = [];
    for (const route of this.routes) {
      if (route.segments.length !== best.segments.length) continue;
      let same = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const left = route.segments[index]!;
        const right = best.segments[index]!;
        if (left !== right && !(left.startsWith(":") && right.startsWith(":"))) same = false;
      }
      if (!same) continue;
      allowed.push(route.method);
      if (route.method !== context.method) continue;
      const names: string[] = [];
      const values: string[] = [];
      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index]!;
        if (segment.startsWith(":")) {
          names.push(segment.slice(1));
          try { values.push(decodeURIComponent(parts[index]!)); }
          catch { throw new HttpError(400, "Invalid path encoding"); }
        }
      }
      context.setParameters(names, values);
      await route.handler(context);
      return true;
    }
    context.header("allow", allowed.join(", "));
    throw new HttpError(405, "Method not allowed");
  }
}
