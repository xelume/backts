import type { ProviderResolver } from "./providerResolver";

let nextToken = 0;

/** 同名但不同声明仍是不同 token；模块内禁止同名注册以避免歧义。 */
export interface ProviderKey { id: number; name: string; }
export interface ProviderToken { key: ProviderKey; }
export interface ProviderBinding extends ProviderToken {
  initialize: (resolver: ProviderResolver, slot: number) => void;
  release: (slot: number) => void;
}
/** 同时是默认绑定和类型化依赖标识。实例仅在装配期间缓存。 */
export interface Provider<T> extends ProviderBinding {
  read: (slot: number) => T;
  write: (slot: number, value: T) => void;
}
export interface ProviderLifecycle<T> {
  start: (value: T) => Promise<void>;
  close: (value: T) => Promise<void>;
}

/** 声明同步工厂；通过 resolver.get 显式请求依赖，不反射构造参数。
 * 外部资源应通过 lifecycle.start 获取；工厂只装配对象。
 */
export function factoryProvider<T>(name: string, create: (resolver: ProviderResolver) => T, lifecycle?: ProviderLifecycle<T>): Provider<T> {
  if (name.trim().length === 0 || name.trim() !== name) throw new Error("Invalid provider name");
  const key = { id: ++nextToken, name };
  const slots: number[] = [];
  const values: T[] = [];
  const write = (slot: number, value: T): void => { slots.push(slot); values.push(value); };
  const start = lifecycle?.start;
  const close = lifecycle?.close;
  return {
    key,
    initialize: (resolver, slot) => {
      const value = create(resolver);
      write(slot, value);
      if (start !== undefined && close !== undefined) {
        resolver.manage({ name: `provider:${resolver.moduleName}:${name}`, start: () => start(value), close: () => close(value) });
      }
    },
    read: (slot) => {
      const index = slots.indexOf(slot);
      if (index < 0) throw new Error(`Provider not initialized: ${name}`);
      return values[index]!;
    },
    write,
    release: (slot) => {
      const index = slots.indexOf(slot);
      if (index >= 0) { slots.splice(index, 1); values.splice(index, 1); }
    },
  };
}

/** 替换同一 token 的工厂；用于模块配置或应用级测试 overrides。 */
export function overrideFactory<T>(token: Provider<T>, create: (resolver: ProviderResolver) => T): ProviderBinding {
  return { key: token.key, initialize: (resolver, slot) => { token.write(slot, create(resolver)); }, release: token.release };
}

/** 使用现成值替换绑定；显式传入同一个可变对象意味着共享，框架不会克隆。 */
export function valueProvider<T>(token: Provider<T>, value: T): ProviderBinding {
  return overrideFactory(token, (_resolver) => value);
}
