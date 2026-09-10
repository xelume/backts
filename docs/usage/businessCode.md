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

`@backts/framework` 依赖 core，提供 createApplication、defineModule 和 ModuleScope。AppModule 是唯一根入口，TodoModule 等功能模块通过 imports 声明；模块用 providers 声明 factoryProvider，用 controllers 声明 provideController，用 exports 公开依赖。框架负责装配；scope.controller/manage/configure 保留给高级用法。

```text
src/main.ts                  引用 AppModule，配置全局中间件和静态目录并启动
src/appModule.ts             声明根模块，通过 imports 组合功能模块
src/health/module.ts         独立声明健康检查路由
src/todos/module.ts          声明模块并装配业务实例
src/todos/controller.ts      接口声明、HTTP 输入与业务结果转换
src/todos/service.ts         业务规则
src/todos/repository.ts      数据类型、仓储契约与内存实现
```

真实用法参考 [Todo 入口](../../examples/todo/src/main.ts) 和 [Todo 模块](../../examples/todo/src/todos/module.ts)。领域策略仍由应用拥有；框架负责执行装配，而不是包含 Todo 业务。

工厂通过 resolve.get(token) 声明依赖，框架负责解析与复用，不使用自动扫描或反射。类无需继承框架基类，工厂也可返回普通对象。父模块中间件向子模块继承，不修改相邻模块。不同实例隔离，同一仓储由调用方显式共享。

configure 和构造函数应只装配对象；外部资源在 manage 的 start 中获取。装配失败抛错，不提供注册回滚。资源顺序、启动失败回滚和关闭期限见[生命周期](applicationLifecycle.md)。

## 包依赖边界

轻量应用 → core；框架应用 → framework → core。应用需要 HTTP 类型或结果适配器时也可直接依赖 core。运行时不依赖 CLI；CLI 作为开发工具负责两种应用的原生编译。

跨包只能使用公开入口，禁止导入其他包的私有源码。装饰器是后续可选声明方式，当前未实现。

模块图在任何工厂执行前完成预检：重复名称、重复导入（包括菱形引用）、循环导入和非法前缀会失败。装配按父模块优先、imports 顺序执行。多次挂载同一功能时创建不同名称的定义；共享资源仍显式注入。不同应用可以复用同一模块声明。

默认使用 defineController({ routes: [jsonRoute(...), noContentRoute(...)], mapException? })，通过 provideController 注册到模块 controllers。framework 负责路由注册、JSON 序列化、状态码、204 发送和异常映射执行。action 保留类型明确的直接调用回调；旧 bindControllerRoutes 和直接响应绑定仍兼容。

[装饰器实验](../../experiments/decorators/README.md)确认当前 scriptc 拒绝方法装饰器，因此这次先稳定模块/路由描述，不引入 @Get 或反射注入。

应用测试通过 createApplication 的 overrides 替换已注册依赖，可选 valueProvider 和 overrideFactory，不修改原模块。Controller 的 interceptors 复用中间件前后执行机制，jsonRoute.transforms 提供发送前的类型化结果转换。
