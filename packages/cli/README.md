# @backts/cli

BackTS 的 Node 24+ 开发工具。提供 create、dev、build、start、analyze、doctor。应用仍通过 scriptc 编译为原生程序。需要 clang 与平台 SDK，当前支持环境为 macOS ARM64，其他平台不保证兼容。

```sh
backts create my-api --pm npm
backts dev
backts build
backts start
backts doctor
```

默认入口 src/main.ts，产物 .scriptc/app。build/dev 支持 --entry 和 --out；start 支持 --out；analyze 支持 --entry。dev/start 通过 `--` 传递应用参数，例如 `backts dev -- 3100`。

create 支持 --pm npm|pnpm、--skip-install、--yes；非交互环境必须给出目录，默认检测 npm/pnpm。拒绝非空目录和目标符号链接。默认安装跳过依赖脚本，失败保留已创建项目。

交互终端通过 Clack 输入并校验目录、选择模板和包管理器；取消返回退出码 1，不创建文件。显式传入 `--template basic|framework` 时跳过模板选择。`--yes`、CI 和非交互环境跳过提示，未指定模板时使用 basic。使用 `backts <command> --help` 或 `backts help <command>` 查看每个命令的选项和默认值。

CLI 使用 Commander 注册命令，入口组装 `src/commands` 中的命令模块；创建交互使用 `@clack/prompts`。这些依赖不进入 core 或原生应用。

目录按职责组织：

```text
tsdown.config.ts                 构建命令入口、公开 API 和类型声明
dist/                            发布的 Node ESM 产物
src/
  bin.ts                         可执行入口
  index.ts                       命令组装与公开 API
  commands/
    create.ts
    dev.ts
    buildAndAnalyze.ts
    start.ts
    doctor.ts
  native/
    compiler.ts                  原生编译
    tests.ts                     原生测试发现与准备
  runtime/
    processes.ts                 子进程与信号管理
    packageInfo.ts               包版本和资源路径
```

tsdown 将源码构建到 dist，命令入口为 `dist/bin.mjs`，公开类型声明从源码生成。普通 Node ESM 可以直接导入 `@backts/cli`、`@backts/cli/compiler` 和 `@backts/cli/testing`。

源码相对导入省略扩展名，tsc 负责类型检查，tsdown 负责构建。修改 CLI 后运行 `pnpm --filter @backts/cli build`；prepack 自动检查并构建。create/dev 的注册与实现放在各自命令文件中，编译、测试发现和进程管理保留独立模块；包资源路径以 dist 产物位置为基准。

dev 监听项目目录中的 TS/JSON 变动，忽略 node_modules、.git、.scriptc、dist；不会监听外部链接包。变动先编译到独立临时产物，期间旧服务继续运行；失败保留旧服务和原产物。编译成功后给旧服务最多 1 秒退出，超时回收，再原子替换产物并启动新服务。连续保存合并且编译串行。没有进程内 HMR，内存状态随重启清空。启动前请停止占用目标端口的服务。

公开 Node API：根导出 `runCli(argv): Promise<number>`，由调用者设置退出码；`@backts/cli/compiler` 导出 `compileNative({operation, entry, output?, cwd?}): Promise<number>`，仅支持 build/coverage，build 要求 output。输入、输出相对于应用 cwd；读取公开 exports 的静态 TS 模块图，将临时文件放入应用 .scriptc/inputs，输出诊断并返回退出码。解析或启动异常会抛出。相同应用入口的调用应串行，不支持动态 import、require、任意 JS npm 包或 tsconfig paths。

包内交付 dist 和模板，安装后直接运行，tsdown 仅是开发依赖。模板随包版本固定，不在运行时下载远程模板。TypeScript AST 接口属于 unstable，升级固定工具链版本时必须重新验证原生编译。

`backts coverage` 是 `backts analyze` 的兼容别名。`backts analyze --tests` 分析当前包 tests/**/*.native.ts，`backts build --tests` 编译这些入口到 .scriptc/<文件名>，不执行它们。--tests 不与 --entry/--out 混用。入口按路径排序，忽略普通 TS 文件和符号链接，缺少入口或输出重名会失败，首个编译失败终止后续工作。

`@backts/cli/testing` 公开 `discoverNativeTests(packageRoot)` 和 `prepareNativeTests(operation, packageRoot)`；后者的底层 operation 为 build/coverage，返回退出码，发现或解析异常抛出。两者沿用上述发现、输出和失败契约，应用包目录应使用绝对路径。

start/dev 的普通位置参数会传给应用，例如 `backts start 3100`；带选项前缀的应用参数仍需放在 `--` 后。

`backts create <directory> --template basic|framework`：默认 basic 直接消费 core；framework 生成模块与函数式接口。模板选择不改变编译器或运行时要求。

纯 void/Promise<void> 框架方法调用由 CLI 按真实导出身份适配为原生空响应入口，默认 204；别名和 namespace import 受支持。同名普通函数不改写，适配前检查原始源码类型，错误保留原文件路径。
