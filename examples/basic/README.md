# Basic 示例

只依赖 @backts/core 的轻量应用。使用 createHttpApp 和普通异步函数，无 Controller、Service 或模块约定。

在工作区执行 `pnpm --filter @backts/example-basic build`，再执行 `pnpm --filter @backts/example-basic start`。

GET / 返回欢迎消息，GET /health 返回健康状态。需要框架式组织方式时参考 examples/todo。
