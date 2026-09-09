# 组织业务代码

随着业务增长，将 HTTP 输入输出、业务规则和存储职责放到各自所属的位置。

先完成[创建自己的应用](createApplication.md)，再按实际复杂度调整目录。下面以 Todo 的现有结构为参考。

## 按功能组织目录

可以沿用 Todo 的显式组合方式，按功能组织：

```text
src/
  main.ts
  items/
    registerRoutes.ts
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
| main | 创建依赖、装配中间件、挂载路由、启动 |
| registerRoutes | HTTP 方法与处理器映射 |
| Controller / Input | 请求解析、输入校验、HTTP 响应 |
| Service | 业务规则，不依赖 HttpContext |
| Repository 契约 | 业务需要的存储操作 |
| 存储实现 | 内存、数据库等实际读写 |
| errorBoundary | 在 HTTP 边界把领域错误映射为 HttpError |

这不是强制目录或基类。只有简单接口时可以直接注册函数；随着业务职责增长再拆分。不要为了调用框架而让所有 Service 继承某个框架类。

## 依赖装配与包边界

真实装配参考 [Todo main](../../examples/todo/src/main.ts)，路由映射参考 [registerTodoRoutes](../../examples/todo/src/todos/registerRoutes.ts)。Todo 当前使用内存仓储；替换数据库时，应用负责适配器、连接生命周期与所选驱动的 scriptc 兼容验证。

框架没有自动扫描、装饰器依赖注入或模块容器。跨包依赖使用 `@backts/core` 公开入口；不要相对引用 `packages/core/src`，也不要使用未导出的内部路径。

## 相关文档

- [映射公开错误](errorHandling.md)
- [验证业务与 HTTP 边界](testing.md)

