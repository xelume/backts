import type { RouteGroup } from "@backts/core";
import type { ModuleScope } from "./moduleScope";
import type { ProviderResolver } from "./providerResolver";

export interface ControllerRegistration {
  configure: (resolver: ProviderResolver, scope: ModuleScope) => void;
}

/** 声明 Controller 工厂与接口定义；模块不再手动调用 scope.controller。 */
export function provideController<T>(create: (resolver: ProviderResolver) => T, definition: (routes: RouteGroup, controller: T) => void): ControllerRegistration {
  return { configure: (resolver, scope) => { scope.controller(() => create(resolver), definition); } };
}
