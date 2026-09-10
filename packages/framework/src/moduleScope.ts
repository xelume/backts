import type { HttpApp, RouteGroup, ApplicationResource } from "@backts/core";

/** 模块的装配作用域；子模块统一通过 imports 声明，避免隐藏依赖。 */
export class ModuleScope {
  constructor(public routes: RouteGroup, private app: HttpApp) {}

  /** 每次调用创建一个实例并同步绑定路由；共享由工厂决定，不反射或扫描方法。
   * 资源获取应放在 manage.start，不能放在构造函数里。
   */
  controller<T>(create: () => T, bind: (routes: RouteGroup, controller: T) => void): void {
    // 通过 core 检查注册冻结，避免启动后执行有副作用的工厂。
    this.app.group("/");
    bind(this.routes, create());
  }

  /** 名称在整个应用内唯一，启动与逆序释放由 core 拥有。 */
  manage(resource: ApplicationResource): void { this.app.manage(resource); }
}
