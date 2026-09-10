import type { HttpApp, ApplicationResource } from "@backts/core";
import type { Provider, ProviderBinding, ProviderToken } from "./provider";

let nextSlot = 0;
export class ProviderModule {
  imports: ProviderModule[] = [];
  bindings: RuntimeBinding[] = [];
  exports: ProviderToken[] = [];
  constructor(public name: string) {}
}
class RuntimeBinding {
  slot = ++nextSlot;
  state = 0;
  constructor(public definition: ProviderBinding, public owner: ProviderModule) {}
}

/** 仅用于同步应用装配；不得存入业务对象后在请求阶段调用。 */
export class ProviderResolver {
  constructor(private registry: ProviderRegistry, private owner: ProviderModule) {}
  get moduleName(): string { return this.owner.name; }
  get<T>(token: Provider<T>): T {
    const binding = this.registry.resolve(this.owner, token);
    return token.read(binding.slot);
  }
  /** 资源顺序由真实依赖解析顺序决定，HTTP 排空后由 core 逆序释放。 */
  manage(resource: ApplicationResource): void { this.registry.manage(resource); }
}

export class ProviderRegistry {
  private active = true;
  private path: string[] = [];
  constructor(private app: HttpApp, private modules: ProviderModule[]) {}

  register(module: ProviderModule, definitions: ProviderBinding[]): void {
    for (const definition of definitions) {
      if (module.bindings.some((binding) => binding.definition.key.id === definition.key.id || binding.definition.key.name === definition.key.name)) {
        throw new Error(`Duplicate provider: ${module.name} -> ${definition.key.name}`);
      }
      // 绑定字段快照，不持有可变配置数组。
      module.bindings.push(new RuntimeBinding({ key: { id: definition.key.id, name: definition.key.name }, initialize: definition.initialize, release: definition.release }, module));
    }
  }

  validate(): void {
    for (const module of this.modules) {
      const exported: number[] = [];
      for (const token of module.exports) {
        if (exported.includes(token.key.id)) throw new Error(`Duplicate provider export: ${module.name} -> ${token.key.name}`);
        exported.push(token.key.id);
        this.lookup(module, token, []);
      }
    }
  }

  initialize(module: ProviderModule): void {
    for (const binding of module.bindings) this.resolve(module, { key: binding.definition.key });
  }

  resolver(module: ProviderModule): ProviderResolver { return new ProviderResolver(this, module); }

  resolve(module: ProviderModule, token: ProviderToken): RuntimeBinding {
    this.assertActive();
    const binding = this.lookup(module, token, []);
    if (binding.state === 2) return binding;
    const label = `${binding.owner.name}.${binding.definition.key.name}`;
    if (binding.state === 1) throw new Error(`Circular provider dependency: ${this.path.concat([label]).join(" -> ")}`);
    binding.state = 1;
    this.path.push(label);
    try {
      binding.definition.initialize(this.resolver(binding.owner), binding.slot);
      binding.state = 2;
      return binding;
    } catch (error) {
      binding.state = 0;
      throw error;
    } finally { this.path.pop(); }
  }

  private lookup(module: ProviderModule, token: ProviderToken, visiting: string[]): RuntimeBinding {
    const own = module.bindings.find((binding) => binding.definition.key.id === token.key.id);
    if (own !== undefined) return own;
    if (visiting.includes(module.name)) throw new Error(`Circular provider export: ${module.name}`);
    const sources = module.imports.filter((imported) => imported.exports.some((item) => item.key.id === token.key.id));
    if (sources.length === 0) throw new Error(`Missing provider: ${module.name} -> ${token.key.name}`);
    if (sources.length > 1) throw new Error(`Ambiguous provider: ${module.name} -> ${token.key.name}`);
    return this.lookup(sources[0]!, token, visiting.concat([module.name]));
  }

  manage(resource: ApplicationResource): void { this.assertActive(); this.app.manage(resource); }
  private assertActive(): void { if (!this.active) throw new Error("Provider resolver is only available during application assembly"); }

  /** 清除临时类型化缓存；业务实例由 Controller 或资源闭包持有。 */
  finish(): void {
    this.active = false;
    for (const module of this.modules) {
      for (const binding of module.bindings) binding.definition.release(binding.slot);
    }
  }
}
