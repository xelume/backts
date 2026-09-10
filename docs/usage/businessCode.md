# 选择业务组织方式

BackTS 支持直接使用基础能力包，或使用上层应用框架。两者共用 HTTP 与资源生命周期实现。

## 直接使用 core

```ts
import { createHttpApp } from '@backts/core';
const app = createHttpApp();
app.get('/health', async (context) => {
  context.json(200, '{"status":"ok"}');
});
await app.run(3000);
```

业务可以使用函数、闭包、普通对象或类，core 不要求 Controller/Service/Repository 分层。参考 [Basic 示例](../../examples/basic/src/main.ts)。内部使用类不意味着用户必须定义类。

## 使用 framework

`@backts/framework` 依赖 core，提供 createApplication、ApplicationModule 和 ModuleScope。应用声明模块前缀、中间件与 configure；scope.controller(create, bind) 创建 Controller 并注册路由，scope.mount(module) 挂载子模块，scope.manage(resource) 注册资源。

```text
src/main.ts                  创建应用，选择依赖实例并传入模块
src/todos/module.ts          声明模块，提供 Controller 工厂和 HTTP 映射
src/todos/todoController.ts  HTTP 与业务转换
src/todos/todoService.ts     业务规则
src/todos/todoRepository.ts  业务仓储契约
```

真实用法参考 [Todo 入口](../../examples/todo/src/main.ts) 和 [Todo 模块](../../examples/todo/src/todos/module.ts)。领域策略仍由应用拥有；框架负责执行装配，而不是包含 Todo 业务。

工厂显式传入 Service 和仓储，不使用自动扫描或反射注入。类无需继承框架基类，工厂也可返回普通对象。父模块中间件向子模块继承，不修改相邻模块。不同实例隔离，同一仓储由调用方显式共享。

configure 和构造函数应只装配对象；外部资源在 manage 的 start 中获取。装配失败抛错，不提供注册回滚。资源顺序、启动失败回滚和关闭期限见[生命周期](applicationLifecycle.md)。

## 包依赖边界

轻量应用 → core；框架应用 → framework → core。应用需要 HTTP 类型或结果适配器时也可直接依赖 core。运行时不依赖 CLI；CLI 作为开发工具负责两种应用的原生编译。

跨包只能使用公开入口，禁止导入其他包的私有源码。装饰器是后续可选声明方式，当前未实现。
