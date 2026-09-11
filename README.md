# BackTS

用 TypeScript 构建原生后端服务。BackTS 是面向 scriptc 原生编译的 TypeScript HTTP 框架工作区。**框架是独立库包，Todo 是独立示例消费者。** 当前仍为实验性的 HTTP 内核，不是生产级完整后端平台。

## 分层与交付

| 包 | 职责 | 使用入口 |
| --- | --- | --- |
| @backts/core | 不规定业务编程方式的 HTTP、路由、中间件、结果处理与生命周期 | createHttpApp |
| @backts/framework | 可选模块、Controller 工厂和显式依赖装配 | createApplication |
| @backts/cli | 创建、原生编译、开发与运行工具 | backts |
| create-backts | 创建命令入口 | npm create backts |

依赖方向：framework → core；轻量应用直接消费 core，框架应用消费 framework（HTTP 类型和辅助函数仍来自 core）。运行时不依赖 CLI，CLI 是开发依赖。

examples/basic 展示普通函数处理器；examples/todo 展示框架模块、函数式接口与 Service。core 内部可以使用类，但用户不需要定义类或继承基类。框架采用显式工厂，不提供反射容器或装饰器。

轻量应用通过 @backts/core 的 createHttpApp() 创建，应用类型为 HttpApp。框架式应用通过 @backts/framework 的 createApplication({ module: AppModule }) 创建。两者复用同一 HTTP 与生命周期实现。

- [业务组织与两种入口](docs/usage/businessCode.md)
- [架构与扩展边界](docs/architecture.md)
- [版本与发布](docs/releasing.md)
- [Core API](packages/core/README.md)
- [Framework API](packages/framework/README.md)

## 安装与开发

环境要求：Node 24+、clang 和平台 SDK。编译器和 TypeScript 随 CLI 安装，具体要求见[环境说明](docs/usage/gettingStarted.md#环境要求)。运行环境为 macOS ARM64，其他平台不保证兼容。

按 [CLI 使用说明](docs/usage/cli.md) 配置私库并创建应用，然后在应用目录执行：

```sh
npm run typecheck
npm run analyze
npm run build
npm run start
```

日常开发使用 `npm run dev`，会编译、启动并监听源码变化。命令细节见 [检查、构建与测试](docs/usage/testing.md)。

框架包以 TS 源码交付，core 的 typecheck 执行类型验证，不生成服务二进制。应用消费者拥有可执行入口；示例产物在 examples/todo/.scriptc/app。开发环境用 Node 运行编译器和测试，最终应用仍为静态原生可执行文件。

## 原生编译与兼容性

框架包以 TypeScript 源码交付。应用应使用 `backts build` 构建，CLI 会解析包的公开 exports，将可达源码整理到应用的 `.scriptc/inputs` 后交给 scriptc 编译。在 scriptc 0.0.36 下，直接使用 `scriptc build` 无法处理当前框架所需的裸 TS 包导入。

支持静态 import/export；不支持动态 import、require、跨包相对源码引用、任意 JavaScript npm 依赖或 tsconfig paths。类型检查成功不代表原生编译成功，可先运行 `backts analyze` 检查静态可编译性。

当前 HTTP 请求处理可能使用 scriptc 的 C 后端，生成的原生程序不包含 JavaScript 引擎。

## 当前范围

框架支持全局/路由中间件、嵌套路由分组、错误响应策略与请求完成观察。原示例 URL、成功响应与默认 HTTP 契约保持兼容。尚未提供 ORM、DI 容器、认证或 WebSocket。

仍缺少生产部署所需的认证授权、TLS/可信代理、限流、完整超时、持久化、日志可靠投递和跨平台验证。根工作区和示例保持 private。安装配置和使用方法见 [CLI 文档](docs/usage/cli.md)。

静态文件服务已提供：使用 app.serveStatic(root, prefix?) 或对象配置，详细契约见框架 README。Todo 示例页面位于 /static/，外部 public 目录需要随应用分发。

close() 停止接入、平滑关闭空闲连接，并等待活动响应；5 秒后销毁剩余连接，但不主动终止进程。通过 manage 注册资源后，还会等待请求处理结束并逆序释放资源；启动失败逆序回滚，包括部分初始化资源。run() 托管 Ctrl+C，完整关闭流程由第 6 秒的进程退出兜底覆盖。listen()/close() 的资源回调期限由调用方负责，详见[应用生命周期](docs/usage/applicationLifecycle.md)。pnpm 在被中断时仍可能显示 ELIFECYCLE，该提示本身不代表服务残留。

## 当前开发策略

当前项目不承担旧版本兼容要求。API 调整时同步迁移仓库内消费者、测试和文档，删除被替代的入口，不为旧版本保留兼容别名或适配层。
