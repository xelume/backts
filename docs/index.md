# BackTS 开发指南

用 TypeScript 构建原生后端服务。

`@backts/core` 是面向 scriptc 原生编译的 TypeScript HTTP 框架。本文档介绍如何运行示例、创建应用、开发接口，以及测试和分发原生程序。

当前框架仍处于实验阶段，包为 private，尚未发布到 npm。已验证环境为 macOS ARM64。

## 入门

- [环境与运行](usage/gettingStarted.md)：准备工具链，运行 Todo 示例并验证接口。
- [创建自己的应用](usage/createApplication.md)：创建独立工作区应用，编译并启动第一个服务。

## 开发指南

- [应用配置与生命周期](usage/applicationLifecycle.md)：配置监听地址、请求体上限和关闭流程。
- [路由与分组](usage/routing.md)：注册接口、组织路由前缀并理解匹配规则。
- [读取请求与发送响应](usage/requestResponse.md)：读取和校验输入，设置响应头并发送响应。
- [中间件](usage/middleware.md)：装配公共处理逻辑和控制请求执行顺序。
- [错误处理与观察](usage/errorHandling.md)：返回公开错误并观察请求结果。
- [日志与启动路由清单](usage/logging.md)：配置终端、JSON 和自定义日志输出。
- [静态资源](usage/staticFiles.md)：挂载公开目录并理解文件服务限制。
- [组织业务代码](usage/businessCode.md)：划分 HTTP、业务和存储职责。

## 测试与运行

- [测试与原生编译](usage/testing.md)：执行类型检查、静态编译分析和原生测试。
- [运行与分发](usage/distribution.md)：准备二进制与资源目录，运行和更新应用。
- [常见问题与能力边界](usage/troubleshooting.md)：排查使用问题并确认框架支持范围。

## 参考文档

- [框架 API](../packages/core/README.md)：公开接口、默认行为与精确契约。
- [Todo 示例](../examples/todo/README.md)：示例业务、HTTP 接口与页面功能。
- [架构设计](architecture.md)：模块职责、依赖方向与扩展边界。

## 示例约定

除非单独注明，命令在 `backts/` 目录执行，源码路径也以该目录为基准。

功能示例沿用[创建自己的应用](usage/createApplication.md)中的 `app` 实例，路由和中间件在启动前注册。构造和启动配置按需替换，不要对同一实例重复启动。
