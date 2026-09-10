import { ApplicationLogger, type LoggerOptions } from "./logger";
import { HttpContext } from "./httpContext";
import { HttpError } from "./httpError";
import { Router, type Handler } from "./router";
import { StaticFiles, type StaticOptions } from "./staticFiles";
import { AddressInUseError, HttpServer, type CompletionObserver } from "./httpServer";
import { ManagedRuntime } from "./managedRuntime";
import { RequestErrors, type ErrorHandler, type ErrorObserver } from "./requestErrors";
import { RequestPipeline, type Middleware } from "./requestPipeline";
import { RouteGroup } from "./routeGroup";
import { resolveListenOptions, type ListenOptions } from "./listenOptions";
import { ApplicationLifecycle, type ApplicationResource } from "./applicationLifecycle";

export type { ListenOptions } from "./listenOptions";

/** 应用装配选项；回调在构造时固定，未知错误默认隐藏为 500。 */
export interface ApplicationOptions {
  maximumBodyBytes?: number;
  logger?: false | LoggerOptions;
  errorHandler?: ErrorHandler;
  onError?: ErrorObserver;
  onRequestComplete?: CompletionObserver;
}

/** 单次启动的装配门面；业务通过组合路由和中间件扩展，不继承内部服务。 */
export class Application {
  private router = new Router();
  private staticFiles = new StaticFiles();
  private middleware: Middleware[] = [];
  private pipeline: RequestPipeline | null = null;
  private server: HttpServer;
  private runtime: ManagedRuntime;
  private started = false;
  private logger: ApplicationLogger;
  private lifecycle: ApplicationLifecycle;

  constructor(input: number | ApplicationOptions = 16_384) {
    const options: ApplicationOptions = typeof input === "number" ? { maximumBodyBytes: input } : input;
    const maximumBodyBytes = options.maximumBodyBytes ?? 16_384;
    if (!Number.isInteger(maximumBodyBytes) || maximumBodyBytes < 1) throw new Error("Invalid body limit");
    this.logger = new ApplicationLogger(options.logger);
    this.server = new HttpServer(maximumBodyBytes, (context) => this.dispatch(context),
      new RequestErrors(this.logger, options.errorHandler, options.onError), () => { this.logRoutes(); }, this.logger, options.onRequestComplete);
    this.lifecycle = new ApplicationLifecycle(this.server, this.logger, () => { this.runtime.detach(); });
    this.runtime = new ManagedRuntime(this.server, this.logger, (options) => this.lifecycle.start(options), () => this.lifecycle.close());
  }

  private logRoutes(): void {
    for (const route of this.router.describe()) this.logger.mapped(route.method, route.path, false);
    for (const prefix of this.staticFiles.prefixes()) this.logger.mapped("GET/HEAD", prefix, true);
  }

  private assertConfigurable(): void {
    if (this.started) throw new Error("Application already started");
  }

  /** 全局中间件覆盖业务、静态文件与 404；仅可在启动前添加。 */
  use(middleware: Middleware): void {
    this.assertConfigurable();
    this.middleware.push(middleware);
  }

  /** 注册资源生命周期；按顺序启动、逆序释放，只能在启动前调用。
   * 回调在注册时固定；依赖实例仍由业务显式注入，不提供容器解析。
   */
  manage(resource: ApplicationResource): void {
    this.assertConfigurable();
    this.lifecycle.add(resource);
  }

  /** 方法规范化为大写；路由中间件在路径参数设置后执行。 */
  route(method: string, path: string, handler: Handler, middleware: Middleware[] = []): void {
    this.assertConfigurable();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)) throw new Error("Invalid HTTP method");
    const pipeline = new RequestPipeline(middleware, handler);
    this.router.add(method.toUpperCase(), path, (context) => pipeline.execute(context));
  }
  get(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("GET", path, handler, middleware); }
  post(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("POST", path, handler, middleware); }
  patch(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("PATCH", path, handler, middleware); }
  delete(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("DELETE", path, handler, middleware); }
  put(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("PUT", path, handler, middleware); }
  head(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("HEAD", path, handler, middleware); }
  options(path: string, handler: Handler, middleware: Middleware[] = []): void { this.route("OPTIONS", path, handler, middleware); }

  /** 创建业务路由组；前缀与组中间件展开到同一 Router。 */
  group(prefix: string, middleware: Middleware[] = []): RouteGroup {
    this.assertConfigurable();
    return new RouteGroup(prefix, (method, path, handler, chain) => this.route(method, path, handler, chain), middleware);
  }

  serveStatic(options: StaticOptions): void;
  serveStatic(root: string, prefix?: string): void;
  serveStatic(input: string | StaticOptions, prefix?: string): void {
    this.assertConfigurable();
    this.staticFiles.add(input, prefix);
  }

  private freeze(): void {
    this.assertConfigurable();
    this.started = true;
    this.pipeline = new RequestPipeline(this.middleware, async (context) => {
      if (!await this.router.tryDispatch(context) && !await this.staticFiles.serve(context)) throw new HttpError(404, "Not found");
    });
  }

  private dispatch(context: HttpContext): Promise<void> {
    const pipeline = this.pipeline;
    if (pipeline === null) throw new Error("Application is not started");
    return pipeline.execute(context);
  }

  /** 独立进程入口，托管信号与启动失败退出。 */
  run(options: ListenOptions): Promise<void>;
  run(port: number, host?: string | boolean): Promise<void>;
  async run(input: number | ListenOptions, host?: string | boolean): Promise<void> {
    try {
      const options = resolveListenOptions(input, host);
      this.freeze();
      await this.runtime.run(options);
    } catch (error) {
      this.runtime.detach();
      this.logger.message("startupFailed", "error", error instanceof AddressInUseError ? error.message : "Server startup failed");
      process.exit(1);
    }
  }

  /** 嵌入式入口，不注册信号；Promise 在实际监听成功后完成。 */
  listen(options: ListenOptions): Promise<void>;
  listen(port: number, host?: string | boolean): Promise<void>;
  listen(input: number | ListenOptions, host?: string | boolean): Promise<void> {
    const options = resolveListenOptions(input, host);
    this.freeze();
    return this.lifecycle.start(options);
  }

  /** 共享关闭 Promise；先排空 HTTP，再等待处理器并逆序释放已注册资源。 */
  close(): Promise<void> { return this.lifecycle.close(); }
}
