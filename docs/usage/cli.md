# BackTS CLI

CLI 用 Node 执行开发工具，应用用 scriptc 编译为原生可执行文件。当前已验证 macOS ARM64、Node 24+、clang/平台 SDK、scriptc 0.0.36、TypeScript 7.0.2。Windows 原生开发命令目前拒绝执行，其他 Unix 平台仍需实际验证。

## 创建与开发

以下公网入口需先发布三个包；当前尚未发布：

```sh
npm create backts@latest my-api
cd my-api
npm run dev
```

创建命令支持 `--pm npm|pnpm`、`--skip-install`、`--yes`。交互终端使用 Clack 输入目录、校验输入并选择包管理器；Ctrl+C 取消时返回退出码 1，尚未创建文件。`--yes`、CI 或非交互环境跳过询问，必须给出目录，包管理器从调用环境检测，无法检测时使用 npm。默认只提供 basic 模板，内容随 CLI 版本固定，无远程模板拉取。目标必须不存在或为空目录，不覆盖已有文件。

默认安装使用 `install --ignore-scripts`，不批准依赖构建脚本。安装失败返回非零退出码，保留项目并给出恢复指引。`--skip-install` 可以先生成文件，再单独安装。

生成的应用包括：

```text
package.json       普通版本依赖；不包含 workspace 协议
src/main.ts        / 和 /health 路由
tsconfig.json     独立配置（无仓库继承）
.gitignore
README.md
```

## 项目内命令

`backts --help` 查看命令清单，`backts <command> --help` 或 `backts help <command>` 查看该命令的参数、说明与默认值。

| 命令 | 行为 |
| --- | --- |
| `backts dev` | 编译并启动；TS/JSON 修改时串行重新编译、重启 |
| `backts build` | 构建 src/main.ts 为 .scriptc/app |
| `backts start` | 只启动现有产物 |
| `backts analyze` | 验证原生静态可编译性，非测试覆盖率 |
| `backts doctor` | 检查 Node、工具链依赖、clang 和 macOS SDK |

build/dev 支持 `--entry <file>`、`--out <file>`；analyze 支持 --entry；start 支持 --out。使用 `npm exec -- backts dev -- 3100` 或 `pnpm exec backts dev -- 3100` 指定模板应用端口。应用自行解释 `--` 之后的参数。

dev 监听项目目录，忽略 node_modules、.git、.scriptc、dist，不监听项目外链接依赖。源码变化时先编译临时产物，旧服务继续处理请求；编译失败保留旧服务与原产物。成功后先给旧服务最多 1 秒退出，超时强制回收，再原子替换产物并启动新服务。尚未完成的请求可能在开发替换时被中断。连续保存会合并，构建期间发生的变化会在当前构建完成后重新构建。Ctrl+C/SIGTERM 同时清理编译进程与服务进程，并移除临时产物；手动退出仍使用正常的优雅关闭期限。内存状态随重启丢失，不是进程内 HMR。

CLI 不替用户停止已有服务；启动前应确认目标端口可用。自定义输出目录不能放在应用源码中。应用外部资源仍由应用管理。

## 包与兼容边界

- @backts/core：TS 源码框架，零 CLI 运行依赖。
- @backts/cli：Node JS 命令、编译能力、内置模板；公开根 API runCli 与 /compiler API compileNative。
- create-backts：调用 CLI 的创建入口；不复制模板。

命令通过 Commander 注册在 CLI 的 `src/commands` 中，入口负责组装与返回退出码；创建交互使用 `@clack/prompts`。这两个依赖仅属于 CLI，不进入 core 或原生应用。构建与开发进程继续由现有编译器和进程管理模块负责。

CLI 源码采用无扩展名的相对 import/export。tsdown 构建 Node ESM 和类型声明到 dist，命令入口为 `dist/bin.mjs`；tsc 负责类型检查。发布 dist 和模板，tsdown 仅为开发依赖，安装发布包即可运行；环境要求仍为 Node 24+。

create/dev 的命令注册与实现分别放在 `commands/create.ts`、`commands/dev.ts` 中；创建流程按输入确认、模板写入、依赖安装组织为本地函数。`native/compiler.ts`、`native/tests.ts`、`runtime/processes.ts` 保留各自复用职责，`runtime/packageInfo.ts` 根据 dist 产物位置管理版本、模板和 CLI 子进程入口路径。开发时的编译子进程也使用 dist/bin.mjs。

原生测试发现器通过 CLI 的公开编译入口复用原有能力。scriptc 的裸 TS 包导入限制仍存在，CLI 在 .scriptc/inputs 中整理源码，不修改应用源文件。动态 import、require、跨包相对导入、任意 JS npm 包和 tsconfig paths 不受支持。

## 发布前的仓库外验收

先安装工作区依赖。在仓库根依次运行打包命令；CLI 和创建器的 prepack 执行类型检查与构建（以下目录可替换为新的临时目录）：

```sh
mkdir -p /tmp/backts-cli-acceptance/artifacts /tmp/backts-cli-acceptance/bootstrap
pnpm --filter @backts/core pack --pack-destination /tmp/backts-cli-acceptance/artifacts
pnpm --filter @backts/cli pack --pack-destination /tmp/backts-cli-acceptance/artifacts
pnpm --filter create-backts pack --pack-destination /tmp/backts-cli-acceptance/artifacts
```

在 bootstrap 目录安装 CLI 与创建器 tarball，再执行其中的真实 bin 创建 sibling 项目：

```sh
cd /tmp/backts-cli-acceptance/bootstrap
npm install --ignore-scripts --no-audit --no-fund ../artifacts/backts-cli-0.1.0.tgz ../artifacts/create-backts-0.1.0.tgz
node node_modules/create-backts/dist/bin.mjs ../my-api --skip-install --yes
cd ../my-api
npm install --ignore-scripts --no-audit --no-fund ../artifacts/backts-core-0.1.0.tgz ../artifacts/backts-cli-0.1.0.tgz
```

这里用 tarball 替代尚未发布的两个依赖版本；不使用 workspace 链接、源码路径引用或复制仓库构建脚本。随后回到 backts 仓库执行：

```sh
node tests/cli/packedApp.ts /tmp/backts-cli-acceptance/my-api
```

验收包括类型检查、静态分析、原生构建、HTTP、开发失败恢复、连续保存、关闭释放端口和 start。该脚本会暂时修改测试项目 main.ts 并恢复，请只针对专用验收项目运行。安装需要网络与主机权限，HTTP 验收需要允许监听本机临时端口。

## 发布状态

三个包已准备 tarball 分发，尚未提交或发布。npm 包名/组织权限、版本意图工具和发布流程还需在首次正式发布前落实；建议采用 Changesets。升级 CLI 时应同步检查模板固定的 core 兼容版本，不能只修改一个版本号后跳过仓库外验收。

## 原生测试准备与仓库任务

`backts analyze --tests` 分析当前包的 tests/**/*.native.ts，`backts build --tests` 只构建这些测试，输出 .scriptc/<文件名>，不运行它们。--tests 不能与 --entry/--out 混用；未找到入口或输出重名时失败。旧 `backts coverage`（包括 --tests）保留为 analyze 的兼容别名。

工作区内日常使用根目录 `pnpm dev/build/typecheck/analyze/test/check`。安装依赖后即可使用 CLI；build 只构建原生应用。check 显式串行执行 build、typecheck、analyze 和 test。core 和 CLI 均无自身 build 步骤；原生测试发现器由 CLI 拥有，应用不引用仓库相对路径脚本。详细执行顺序见 [检查与测试](testing.md)。

start/dev 的普通位置参数会传给应用，例如 `backts start 3100`；带选项前缀的应用参数仍需放在 `--` 后。
