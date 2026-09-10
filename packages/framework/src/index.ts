import { createHttpApp, type HttpApp, type ApplicationOptions, type RouteGroup, type Middleware, type ApplicationResource } from "@backts/core";

/** 模块声明只保存装配函数；每次挂载独立执行，依赖实例的共享由工厂决定。 */
export interface ApplicationModule {
  prefix: string;
  configure: (scope: ModuleScope) => void;
  middleware?: Middleware[];
}

/** 模块的作用域，HTTP 与生命周期始终委托给 core。 */
export class ModuleScope {
  constructor(public routes: RouteGroup, private app: HttpApp) {}

  /** 工厂显式创建 Controller/依赖，绑定函数声明 HTTP 映射，不扫描方法或反射类型。 */
  controller<T>(create: () => T, bind: (routes: RouteGroup, controller: T) => void): void {
    // 先通过 core 的注册入口检查冻结，避免启动后运行有副作用的工厂。
    this.app.group("/");
    const controller = create();
    bind(this.routes, controller);
  }

  /** 注册模块资源，名称在整个应用中唯一；依赖生命周期由 core 管理。 */
  manage(resource: ApplicationResource): void { this.app.manage(resource); }

  /** 挂载子模块，继承路由前缀和中间件。 */
  mount(module: ApplicationModule): void {
    this.app.group("/");
    const routes = this.routes.group(module.prefix, module.middleware);
    module.configure(new ModuleScope(routes, this.app));
  }
}

/** 框架应用配置，modules 按数组顺序同步装配；失败时抛错，不自动回滚注册。 */
export interface FrameworkOptions {
  http?: ApplicationOptions;
  modules: ApplicationModule[];
}

/** 创建具有模块/Controller 装配约定的应用；返回同一 core 应用管理监听与关闭。 */
export function createApplication(options: FrameworkOptions): HttpApp {
  const app = createHttpApp(options.http);
  const scope = new ModuleScope(app.group("/"), app);
  for (const module of options.modules) scope.mount(module);
  return app;
}
