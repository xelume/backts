import type { Middleware } from "@backts/core";
import type { ProviderBinding, ProviderToken } from "./provider";
import type { ControllerRegistration } from "./controllerProvider";
import type { ModuleScope } from "./moduleScope";

/** 命名模块声明；imports 表示嵌套作用域，providers/controllers 声明装配，exports 显式公开依赖。 */
export interface ApplicationModule {
  name: string;
  prefix?: string;
  imports?: ApplicationModule[];
  middleware?: Middleware[];
  providers?: ProviderBinding[];
  exports?: ProviderToken[];
  controllers?: ControllerRegistration[];
  configure?: (scope: ModuleScope) => void;
}

/** 固定模块的直接配置快照；依赖仍由显式工厂闭包提供。
 * 子模块在 createApplication 预检时整体快照；同一应用内名称必须唯一。
 */
export function defineModule(input: ApplicationModule): ApplicationModule {
  return {
    name: input.name,
    prefix: input.prefix ?? "/",
    imports: input.imports === undefined ? [] : input.imports.slice(),
    middleware: input.middleware === undefined ? [] : input.middleware.slice(),
    providers: input.providers === undefined ? [] : input.providers.slice(),
    exports: input.exports === undefined ? [] : input.exports.map((token) => ({ key: { id: token.key.id, name: token.key.name } })),
    controllers: input.controllers === undefined ? [] : input.controllers.map((controller) => ({ configure: controller.configure })),
    configure: input.configure ?? ((_scope: ModuleScope) => {}),
  };
}
