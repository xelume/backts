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

examples/basic 展示普通函数处理器；examples/todo 展示框架模块与 Controller/Service。core 内部可以使用类，但用户不需要定义类或继承基类。框架采用显式工厂，不提供反射容器或装饰器。

本次预发布 API 迁移：从 core 导入 Application 并 new 的旧用法改为 createHttpApp()；应用类型为 HttpApp。框架式应用改用 @backts/framework 的 createApplication({ module: AppModule })。两者复用同一 HTTP 与生命周期实现。

- [业务组织与两种入口](docs/usage/businessCode.md)
- [架构与扩展边界](docs/architecture.md)
- [Core API](packages/core/README.md)
- [Framework API](packages/framework/README.md)

## 开发命令

环境：Node 24+、pnpm 10.33.4、clang/平台 SDK。依赖锁定 scriptc 0.0.36、TypeScript 7.0.2、@types/node 26.4.0。本机验证为 macOS ARM64，不保证其他平台。**无需 Python，也没有增加测试第三方依赖。**

CLI 的创建、开发、参数和仓库外验收见 [CLI 使用说明](docs/usage/cli.md)。安装依赖后先运行 `pnpm --filter @backts/cli --filter create-backts build`，再使用 dev/typecheck/analyze/test。`pnpm check` 会按顺序构建工具、应用并执行全部检查。修改 CLI 源码后需重新构建；发布包安装后直接运行。

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm start
```

| 命令 | 含义 |
| --- | --- |
| `pnpm typecheck` | 检查各包及仓库测试类型 |
| `pnpm analyze` | 分析框架测试入口和示例消费入口；出现 blocker 或动态回退则失败 |
| `pnpm build` | 按依赖顺序构建 CLI、创建器和 Todo 原生程序 |
| `pnpm test` | 构建原生测试产物，再执行 CLI 和 HTTP 测试 |
| `pnpm check` | 依次执行 build、typecheck、analyze、test |
| `pnpm dev` | 编译并启动 Todo 开发模式 |
| `pnpm start [port]` | 启动已构建的 Todo 示例，默认 localhost:3000；框架库自身不监听端口 |

框架包以 TS 源码交付，core 的 typecheck 执行类型验证，不生成服务二进制。应用消费者拥有可执行入口；示例产物在 examples/todo/.scriptc/app。开发环境用 Node 运行编译器和测试，最终应用仍为静态原生可执行文件。

## scriptc 包导入的兼容措施

在当前安装的 0.0.36 上，裸包导入会按 npm 依赖处理。仅设置 workspace 链接和 exports 不能让本框架直接静态编译；尝试 --npm-static 也未能保留所需类型和类实现。不能把“通过 tsc”当成“通过原生包编译”。

因此 CLI 使用 packages/cli/src/native/compiler.ts：

1. 从指定应用或测试入口读取静态 TypeScript 模块图。
2. 裸包名通过 Node createRequire(...).resolve(...) 解析，遵守公开 exports；拒绝跨包相对源码引用。
3. 将可达模块复制到消费者自己的 .scriptc/inputs 下，仅在临时副本中重写模块路径，不改业务逻辑、源码或编译器。
4. scriptc 编译临时入口，输出到消费者的 .scriptc 目录。诊断路径还原为原源码路径。

这是当前版本的**CLI 构建兼容措施，不是 scriptc 已原生支持裸 TS 包导入的声明**。临时应用输入包含应用与所依赖的框架代码，如同应用链接库；它不进入框架包，不改变源码所有权。示例源码依旧只消费公开包名。

工具使用 TypeScript 7.0.2 的原生解析服务与 AST（`typescript/unstable/sync`、`typescript/unstable/ast`）解析静态 named/default/namespace/组合 import、export-from 和副作用 import；注释和字符串不参与模块识别。它不是完整 TypeScript 打包器。动态 import/require 被拒绝，不支持任意 JS npm 依赖或导入别名。错误位置的行内列号可能因路径长度变化有偏差。独立消费者使用 `@backts/cli` 的 `backts build`；不能直接执行普通 scriptc build 并假定包导入已获支持。CLI 不读取仓库根配置。

请求 aborted 事件仍会让 0.0.36 自动采用 C 后端，产物不包含 JS 引擎，未使用 --dynamic。

## 测试边界

原生测试入口统一命名为 `tests/**/*.native.ts`。CLI 递归发现并排序；`analyze --tests` 与 `build --tests` 共用同一发现规则，新增入口无需编辑 package.json。普通 `.ts` 辅助文件和类型测试不作为可执行入口。未发现入口、空输出名或大小写不敏感的重名输出均会失败，编译错误立即停止后续任务。

CLI 测试准备入口串行调用 `compileNative()`，输出保持为当前包 `.scriptc/<入口名>`，例如 `httpServer.native.ts` 仍生成 `.scriptc/httpServer`。Todo 应用 `src/main.ts` 的静态分析单独保留，不与测试入口混为一类。删除测试时同时移除对应集成消费者；执行器不自动清理其他本地产物。

全部测试源码是 TypeScript。Node 内置 node:test、HTTP 客户端与 child_process 启动并测试真实 scriptc 原生产物；没有用 Node 直接执行业务来替代原生验证。

- 框架测试：路由优先级、重复注册、405、错误隐藏、单次读写、并发上下文和关闭。
- 示例测试：CRUD、非法输入、媒体类型、请求体字节边界与分块请求、断连、端口冲突、领域快照和实例隔离。
- 包边界测试：框架不导入应用；示例通过公开入口解析框架；私有子路径不可导入。

测试申请临时端口，只关闭自己创建的进程；断言失败也会清理服务。沙箱可能需要本机监听权限。analyze（兼容别名 coverage）仅表示静态可编译性，不表示测试覆盖率或可靠性评分。项目未配置独立 lint，不宣称通过 lint。

## 当前范围

框架支持全局/路由中间件、嵌套路由分组、错误响应策略与请求完成观察。原示例 URL、成功响应与默认 HTTP 契约保持兼容。尚未提供 ORM、DI 容器、认证或 WebSocket。

仍缺少生产部署所需的认证授权、TLS/可信代理、限流、完整超时、持久化、日志可靠投递和跨平台验证。core、CLI 与创建入口已配置为可发布包，但尚未发布 npm。根工作区和 Todo 保持 private。提交或发布包变更前仍须建立并执行版本意图与发布检查流程。

静态文件服务已提供：使用 app.serveStatic(root, prefix?) 或对象配置，详细契约见框架 README。Todo 示例页面位于 /static/，外部 public 目录需要随应用分发。

close() 停止接入、平滑关闭空闲连接，并等待活动响应；5 秒后销毁剩余连接，但不主动终止进程。通过 manage 注册资源后，还会等待请求处理结束并逆序释放资源；启动失败逆序回滚，包括部分初始化资源。run() 托管 Ctrl+C，完整关闭流程由第 6 秒的进程退出兜底覆盖。listen()/close() 的资源回调期限由调用方负责，详见[应用生命周期](docs/usage/applicationLifecycle.md)。pnpm 在被中断时仍可能显示 ELIFECYCLE，该提示本身不代表服务残留。

## 0.0.36 升级验证

2026-09-09 通过 npm latest 升级并锁定到 0.0.36，安装时跳过依赖脚本。上游近期版本的主要收益：0.0.34/35 的编译缓存与前端性能改进已包含在原版本；0.0.36 新增 macOS ARM64 release runtime pack，以及 `--emit=ir|c|llvm` 诊断产物。原生 FFI 回调和 library ABI 变更暂不属于本 HTTP 源码库的使用范围。

实测 Todo 直接使用 `--npm-static auto` 分析仍存在 SC2013/类型 blocker，保留源码整理工具。完整 HTTP 请求体读取仍因 `http.reqOnAborted` 回退到 C 后端，不能宣称已获得 LLVM runtime pack 的全部收益。超时配置属性的上游支持不等于 deadline enforcement，本次不新增未经验证的超时承诺。

新增请求头、原始 URL、query、文本/字节请求体，以及显式 PUT/HEAD/OPTIONS 和通用方法注册。现有 JSON、默认 body 上限与 HEAD/405 行为保持兼容。详细 API 见 core README。

参考：https://github.com/vercel-labs/scriptc/blob/main/CHANGELOG.md

构建工具与类型检查统一直接依赖 TypeScript 7.0.2。解析服务的 snapshot 和进程均在 finally 中释放；AST 接口当前属于 unstable，升级 TypeScript 时必须验证构建输入重写。scriptc 自身仍传递依赖 typescript5，锁文件保留该上游依赖，不使用 overrides 强制替换。
