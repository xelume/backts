# BackTS 开发指南

用 TypeScript 构建原生后端服务。

BackTS 由不规定业务结构的 `@backts/core` 基础包和可选的 `@backts/framework` 应用框架组成，面向 scriptc 原生编译。本文档介绍如何运行示例、创建应用、开发接口，以及测试和分发原生程序。

当前框架仍处于实验阶段，安装方式和命令说明见 [CLI 文档](usage/cli.md)。已验证环境为 macOS ARM64。

## 创建和开发应用

无需克隆本仓库，按以下顺序阅读：

1. [环境要求](usage/gettingStarted.md#环境要求)与[私库配置](usage/cli.md#私有-npm-仓库配置)。
2. [创建自己的应用](usage/createApplication.md)：选择模板并验证第一个接口。
3. Basic 应用继续阅读路由和请求响应指南；Framework 应用先读 [Framework 入门](usage/framework.md)。
4. [检查与测试](usage/testing.md)，然后[构建分发](usage/distribution.md)。

[CLI 参考](usage/cli.md)提供完整命令与参数。

## 开发本仓库

已经取得源码的贡献者从[运行仓库示例](usage/gettingStarted.md#运行仓库示例)开始，再阅读[架构](architecture.md)和[发布流程](releasing.md)。应用命令在生成项目目录执行，仓库命令在 `backts/` 执行。

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

- [Core API](../packages/core/README.md)：公开接口、默认行为与精确契约。
- [Framework API](../packages/framework/README.md)：模块和 Controller 装配。
- [Basic 示例](../examples/basic/README.md)：普通函数处理器。
- [Todo 示例](../examples/todo/README.md)：示例业务、HTTP 接口与页面功能。
- [架构设计](architecture.md)：模块职责、依赖方向与扩展边界。

## 示例约定

使用指南中的应用命令和 `src/`、`tests/` 路径以生成的应用目录为基准；仓库示例与维护命令会单独注明工作目录。

功能示例沿用[创建自己的应用](usage/createApplication.md)中的 `app` 实例，路由和中间件在启动前注册。构造和启动配置按需替换，不要对同一实例重复启动。

## 文档维护

README 负责定位与入口；使用指南负责完成读者任务；包 README 负责公开 API 契约；架构和评估文档记录实现决策及历史证据。细节优先链接到所属文档，避免多处复制。

修改 API、默认值、CLI、模板或工具链的维护者，应同步检查相关指南和两个模板 README。新增教程示例需完成类型检查、原生构建及对应行为验证；链接检查同时考虑仓库和发布包阅读场景。历史评估应标注日期、适用版本和已解决项，不能把旧测试结果当作当前验证。
