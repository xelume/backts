# BackTS CLI

CLI 用 Node 执行开发工具，应用用 scriptc 编译为原生可执行文件。当前已验证 macOS ARM64、Node 24+、clang/平台 SDK；编译器和 TypeScript 随 CLI 安装，版本要求见[环境说明](gettingStarted.md#环境要求)。Windows 原生开发命令目前拒绝执行，其他 Unix 平台仍需实际验证。

## 创建与开发

使用以下命令创建 BackTS 应用。先按下一节配置认证，再创建项目：

```sh
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-api --yes
cd my-api
npm run dev
```

## 私有 npm 仓库配置

BackTS 包从 `https://registry.qlqs.work/` 安装。

basic 和 framework 模板自带以下 `.npmrc` 配置，创建后会自动安装依赖。已有项目手动接入时可追加这一行：

```ini
@backts:registry=https://registry.qlqs.work/
```

第三方依赖继续使用消费环境的默认 registry。`create-backts` 没有 scope，不能通过 `@backts:registry` 定位，因此创建命令仍需显式指定 registry。创建工具自身的下载使用该私库，私库需提供或代理其第三方依赖。

需要认证时，先执行 `npm login --registry=https://registry.qlqs.work/`，或通过用户级 npm 配置/CI secret 注入该 registry 的凭据。不要将真实 token 写入项目文件。模板只包含 registry 映射，不包含认证信息。

## 创建行为

创建命令支持 `--pm npm|pnpm`、`--skip-install`、`--yes`。交互终端使用 Clack 输入目录、校验输入、选择模板和包管理器；Ctrl+C 取消时返回退出码 1，尚未创建文件。`--yes`、CI 或非交互环境跳过询问，必须给出目录，包管理器从调用环境检测，无法检测时使用 npm。未传 `--template` 时，交互终端提供 Basic（默认，普通函数处理器）与 Framework（模块、Controller、Service）选择；显式传参跳过模板选择。`--yes`、CI 或非交互环境未指定模板时使用 basic，内容随 CLI 版本固定，无远程模板拉取。目标必须不存在或为空目录，不覆盖已有文件。

默认安装使用 `install --ignore-scripts`，不批准依赖构建脚本。安装失败返回非零退出码，保留项目并给出恢复指引。`--skip-install` 可以先生成文件，再单独安装。

生成的应用包括：

```text
package.json       CLI 根据随包版本清单生成的精确依赖；不包含 workspace 协议
src/main.ts        / 和 /health 路由
tsconfig.json     独立配置（无仓库继承）
.gitignore
.npmrc            @backts 私库配置，不含凭据
README.md
```

## 项目内命令

`backts --help` 查看命令清单，`backts <command> --help` 或 `backts help <command>` 查看该命令的参数、说明与默认值。

| 命令 | 行为 |
| --- | --- |
| `backts dev` | 编译并启动；TS/JSON 修改时串行重新编译、重启 |
| `backts build` | 构建 src/main.ts 为 build/app，并同步 public 到 build/public |
| `backts start` | 只启动现有产物 |
| `backts analyze` | 验证原生静态可编译性，非测试覆盖率 |
| `backts doctor` | 检查 Node、工具链依赖、clang 和 macOS SDK |

build/dev 支持 `--entry <file>`、`--out <file>`；analyze 支持 --entry；start 支持 --out。使用 `npm exec -- backts dev -- 3100` 或 `pnpm exec backts dev -- 3100` 指定模板应用端口。应用自行解释 `--` 之后的参数。

dev 监听项目目录，忽略 node_modules、.git、.scriptc、dist、build，不监听项目外链接依赖。源码变化时先编译临时产物，旧服务继续处理请求；编译失败保留旧服务与原产物。成功后先给旧服务最多 1 秒退出，超时强制回收，再原子替换产物并启动新服务。尚未完成的请求可能在开发替换时被中断。连续保存会合并，构建期间发生的变化会在当前构建完成后重新构建。Ctrl+C/SIGTERM 同时清理编译进程与服务进程，并移除临时产物；手动退出仍使用正常的优雅关闭期限。内存状态随重启丢失，不是进程内 HMR。

CLI 不替用户停止已有服务；启动前应确认目标端口可用。自定义输出目录不能放在应用源码中。应用外部资源仍由应用管理。

## 包与兼容边界

- @backts/core：TS 源码基础能力包，零 CLI 运行依赖。
- @backts/framework：可选模块/Controller 装配，依赖 core 公开入口。
- @backts/cli：Node JS 命令、编译能力、内置模板；公开根 API runCli 与 /compiler API compileNative。
- create-backts：调用 CLI 的创建入口；不复制模板。

scriptc 0.1.1 存在裸 TS 包导入限制，CLI 在 .scriptc/inputs 中整理源码，不修改应用源文件。动态 import、require、跨包相对导入、任意 JS npm 包和 tsconfig paths 不受支持。

重复构建保留内容未变的临时输入与后端产物，删除已不在依赖图中的临时源码，由 scriptc 校验源码、配置及工具链后复用缓存。编译失败不覆盖已有可执行文件。删除 .scriptc 可重新生成本地编译输入；scriptc 的全局缓存由编译器独立管理。

scriptc 新增的 import.meta.url/filename/dirname 在此源码整理流程中可能指向临时模块，不能用于定位部署资源。静态资源继续按文档约定相对于进程工作目录配置。

## 原生测试命令

`backts analyze --tests` 分析当前包的 tests/**/*.native.ts，`backts build --tests` 只构建这些测试，输出 .scriptc/<文件名>，不运行它们。--tests 不能与 --entry/--out 混用；未找到入口或输出重名时失败。旧 `backts coverage`（包括 --tests）保留为 analyze 的兼容别名。

start/dev 的普通位置参数会传给应用，例如 `backts start 3100`；带选项前缀的应用参数仍需放在 `--` 后。

## 框架模板

使用[创建应用](createApplication.md#模板选择)中的完整创建命令生成框架式应用；已有 CLI 命令环境也可执行 `backts create my-app --template framework`。默认 basic 使用普通函数处理器。创建时自动生成私库配置并安装依赖。framework 模板包含 `@backts/framework` 和 `@backts/core` 依赖。

build 的 --out 指定可执行文件路径，public 同步到其同级目录；--no-public 跳过资源同步。start 的工作目录为可执行文件所在目录。dev 保持 .scriptc/app 和项目工作目录。
