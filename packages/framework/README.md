# @backts/framework

可选的应用框架，依赖 `@backts/core`。提供模块作用域、Controller 工厂与显式依赖装配；HTTP、结果转换、日志和资源生命周期由 core 提供。

```ts
import { createApplication } from '@backts/framework';

const app = createApplication({ modules: [{
  prefix: '/api',
  configure: (scope) => {
    scope.controller(() => new MyController(myService), (routes, controller) => {
      routes.get('/items', (context) => controller.list(context));
    });
  },
}] });
await app.run(3000);
```

MyController 和 myService 是应用自己的对象。框架不要求继承基类，工厂也可以返回函数或普通对象。模块由 `ApplicationModule` 描述，`configure` 同步执行，`scope.mount()` 组合子模块的前缀与中间件，`scope.manage()` 委托 core 注册资源。HTTP 注册按 core 的规则在启动时冻结；保留 scope 也不能在启动后调用 Controller 工厂。

模块数组按顺序装配；Controller 工厂每次注册执行一次，应用关闭后不能重启。实例是否共享由工厂闭包决定；不要在共享实例保存请求身份等可变状态。装配错误直接抛出，不提供路由注册回滚；资源获取放在 manage 的 start 回调中，不放在构造函数里。

不提供装饰器、运行时扫描、自动类型推断注入或容器 token 解析。需要任意业务结构时直接使用 core 的 createHttpApp。

迁移示例见 examples/todo；完整原生回归由工作区 tests/integration 执行。
