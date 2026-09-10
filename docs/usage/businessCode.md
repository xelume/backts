# 组织业务代码

随着业务增长，将 HTTP 输入输出、业务规则和存储职责放到各自所属的位置。

先完成[创建自己的应用](createApplication.md)，再按实际复杂度调整目录。下面以 Todo 的现有结构为参考。

## 按功能组织目录

可以沿用 Todo 的显式组合方式，按功能组织：

```text
src/
  main.ts
  items/
    module.ts
    itemController.ts
    itemInput.ts
    itemService.ts
    itemRepository.ts
    inMemoryItemRepository.ts
    errorBoundary.ts
```

## 职责划分

| 文件或层 | 负责什么 |
| --- | --- |
| main | 选择存储实现、管理资源生命周期、装配应用中间件、挂载模块、启动 |
| module | 接收仓储与路由组，装配 Service/Controller、模块错误边界和 HTTP 映射 |
| Controller / Input | 请求解析、输入校验、HTTP 响应 |
| Service | 业务规则，不依赖 HttpContext |
| Repository 契约 | 业务需要的存储操作 |
| 存储实现 | 内存、数据库等实际读写 |
| errorBoundary | 在 HTTP 边界把领域错误映射为 HttpError |

这不是强制目录或基类。只有简单接口时可以直接注册函数；随着业务职责增长再拆分。不要为了调用框架而让所有 Service 继承某个框架类。

## 依赖装配与包边界

真实装配参考 [Todo main](../../examples/todo/src/main.ts)，模块入口参考 [registerTodoModule](../../examples/todo/src/todos/module.ts)。Todo 当前使用内存仓储；替换数据库时，应用负责适配器、连接生命周期与所选驱动的 scriptc 兼容验证。

框架没有自动扫描、装饰器依赖注入或模块容器。跨包依赖使用 `@backts/core` 公开入口；不要相对引用 `packages/core/src`，也不要使用未导出的内部路径。

模块入口接收仓储契约和路由组，内部创建 Service、Controller，并通过子组绑定领域错误边界。父组中间件会继承，模块不会修改父组或相邻路由。每次挂载创建独立对象，但数据隔离取决于仓储实例：不同实例隔离，同一实例显式共享。

模块是业务自己的普通函数，不管理调用方资源的关闭。注册遵循现有启动冻结与重复路由检查，不提供批量注册失败回滚；多个真实模块出现稳定的重复需求后，再考虑公共装配能力。

## 相关文档

- [映射公开错误](errorHandling.md)
- [验证业务与 HTTP 边界](testing.md)
