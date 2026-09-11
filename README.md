# BackTS

用 TypeScript 构建不包含 JavaScript 引擎的原生 HTTP 后端服务。BackTS 使用 scriptc 编译，提供轻量 HTTP 基础包和可选的模块化应用框架。

当前处于实验阶段，已验证环境为 **macOS ARM64**。适合验证原生 TypeScript HTTP 服务和编写示例应用；尚未具备完整的生产后端能力，也不承诺旧版本 API 兼容。

## 快速开始

需要 Node 24+、clang 与平台 SDK。scriptc 和 TypeScript 随依赖安装，无需全局安装；固定版本与工具链说明见[环境要求](docs/usage/gettingStarted.md#环境要求)。

包从私有 registry 安装，先按[私库配置](docs/usage/cli.md#私有-npm-仓库配置)准备访问权限；需要认证时先完成登录。然后执行：

```sh
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-api --yes
cd my-api
npm exec -- backts doctor
npm run dev
```

另开终端验证：

```sh
curl -i http://localhost:3000/health
```

预期状态为 `200`，响应体为 `{"status":"ok"}`。修改 `src/main.ts` 后会重新编译并重启；编译失败时旧服务继续运行。使用 Ctrl+C 停止开发服务。

构建并运行已有产物，在应用目录执行：

```sh
npm run typecheck
npm run analyze
npm run build
npm run start
```

先停止 dev 再 start，避免占用同一端口。`start` 不会重新构建，`analyze` 不代表运行时测试覆盖率。

## 选择应用方式

| 方式 | 适用场景 | 编程入口 |
| --- | --- | --- |
| Basic（默认） | 希望自行组织业务代码的轻量应用 | `@backts/core` 的 `createHttpApp()`，处理器显式发送响应 |
| Framework | 需要功能模块和显式依赖装配 | `@backts/framework` 的 `createApplication()`，Controller 处理器返回结果 |

创建 Framework 项目时，在创建命令的 `--` 后增加 `--template framework`。两者共用 HTTP 与资源生命周期，不要求装饰器、反射或继承基类。Framework 依赖 core；CLI 是开发依赖，不进入原生运行时。

## 使用文档

- [文档首页](docs/index.md)：按应用使用者或仓库贡献者选择路径。
- [创建应用](docs/usage/createApplication.md)：安装、模板选择与第一个接口。
- [Framework 入门](docs/usage/framework.md)：模块、Service、错误映射与依赖替换测试。
- [业务组织方式](docs/usage/businessCode.md)：选择 Core 或 Framework。
- [检查与测试](docs/usage/testing.md)、[运行与分发](docs/usage/distribution.md)。
- [Core API](packages/core/README.md)、[Framework API](packages/framework/README.md)、[CLI 命令](docs/usage/cli.md)。

## 能力与边界

已提供 HTTP 路由、路由分组、中间件、请求体读取、错误处理、日志、静态资源、资源生命周期，以及可选的模块和显式依赖装配。

尚未提供内置认证授权、ORM、反射注入、请求级依赖作用域、WebSocket、TLS、可信代理、限流、完整请求超时或日志可靠投递。其他平台仍需验证，完整说明见[能力边界](docs/usage/troubleshooting.md)。

框架包以 TypeScript 源码交付，应用使用 `backts build` 编译。支持通过公开 exports 的静态 TS 导入，不支持动态 import、require、跨包相对源码引用、任意 JavaScript npm 依赖或 tsconfig paths。类型检查通过后仍需原生分析和构建，详见[编译限制](docs/usage/testing.md#原生编译限制)。

Todo 示例页面位于 `/`，数据保存在内存中，重启清空。静态资源不会嵌入二进制，分发时需携带 `public` 目录；见[静态资源](docs/usage/staticFiles.md)。

## 开发本仓库

- [运行仓库示例](docs/usage/gettingStarted.md#运行仓库示例)：使用仓库指定的 pnpm 版本安装和运行。
- [架构与扩展边界](docs/architecture.md)：包职责与实现约束。
- [版本与发布](docs/releasing.md)：验证、版本意图与发布流程。

API 调整时同步迁移仓库内消费者、测试和文档，删除被替代的入口，不为旧版本保留兼容别名或适配层。文档维护约定见[文档首页](docs/index.md#文档维护)。
