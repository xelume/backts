import { createHttpApp, type HttpApp, type ApplicationOptions, type RouteGroup } from "@backts/core";
import { defineModule, type ApplicationModule } from "./module";
import { ProviderModule, ProviderRegistry } from "./providerResolver";
import type { ProviderBinding } from "./provider";
import { ModuleScope } from "./moduleScope";

/** 单一根模块，HTTP 选项直接传给 core。 */
export interface FrameworkOptions {
  http?: ApplicationOptions;
  module: ApplicationModule;
  /** 替换已注册 token 的所有绑定；未注册的 token 会报错。 */
  overrides?: ProviderBinding[];
}

class PlannedModule {
  providers: ProviderModule;
  constructor(public module: ApplicationModule, public routes: RouteGroup) { this.providers = new ProviderModule(module.name); }
}

/** 先预检整个模块图，再按父模块优先、imports 顺序执行配置。
 * 重复身份、重复名称、循环导入与非法前缀在工厂执行前失败。
 * 工厂/路由绑定失败直接抛出，不回滚业务副作用或已注册路由。
 */
export function createApplication(options: FrameworkOptions): HttpApp {
  const app = createHttpApp(options.http);
  const plan: PlannedModule[] = [];
  planModule(options.module, app.group("/"), [], [], [], plan);
  const registry = new ProviderRegistry(app, plan.map((item) => item.providers));
  const overrides = options.overrides ?? [];
  const used: number[] = [];
  for (const override of overrides) {
    if (used.includes(override.key.id)) throw new Error(`Duplicate provider override: ${override.key.name}`);
    used.push(override.key.id);
    if (!plan.some((item) => (item.module.providers ?? []).some((binding) => binding.key.id === override.key.id))) throw new Error(`Unknown provider override: ${override.key.name}`);
  }
  try {
    for (const item of plan) {
      registry.register(item.providers, (item.module.providers ?? []).map((binding) => overrides.find((override) => override.key.id === binding.key.id) ?? binding));
      item.providers.exports = item.module.exports ?? [];
    }
    registry.validate();
    for (const item of plan) registry.initialize(item.providers);
    for (const item of plan) {
      const scope = new ModuleScope(item.routes, app);
      for (const controller of item.module.controllers ?? []) controller.configure(registry.resolver(item.providers), scope);
      const configure = item.module.configure;
      if (configure !== undefined) configure(scope);
    }
    return app;
  } finally { registry.finish(); }
}

function planModule(input: ApplicationModule, parent: RouteGroup, visiting: ApplicationModule[], seen: ApplicationModule[], names: string[], plan: PlannedModule[]): void {
  const path = visiting.map((module) => module.name).concat([input.name]).join(" -> ");
  if (visiting.includes(input)) throw new Error(`Circular module import: ${path}`);
  if (seen.includes(input)) throw new Error(`Duplicate module import: ${path}`);
  if (input.name.trim().length === 0 || input.name !== input.name.trim()) throw new Error(`Invalid module name: ${path}`);
  if (names.includes(input.name)) throw new Error(`Duplicate module name: ${path}`);
  const module = defineModule(input);
  let routes: RouteGroup;
  try { routes = parent.group(module.prefix ?? "/", module.middleware); }
  catch { throw new Error(`Invalid group prefix: ${path}`); }
  seen.push(input);
  names.push(module.name);
  const planned = new PlannedModule(module, routes);
  plan.push(planned);
  visiting.push(input);
  const imports = module.imports ?? [];
  for (const imported of imports) {
    const childIndex = plan.length;
    planModule(imported, routes, visiting, seen, names, plan);
    planned.providers.imports.push(plan[childIndex]!.providers);
  }
  visiting.pop();
}
