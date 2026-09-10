# 检查、构建与测试

安装依赖后先运行 `pnpm --filter @backts/cli --filter create-backts build`，再使用开发、类型检查、分析或测试命令。完整检查运行 `pnpm check`，会先构建工具和应用。

| 命令 | 范围 |
| --- | --- |
| `pnpm build` | 按依赖顺序构建 CLI、创建器和原生应用 |
| `pnpm dev` | 启动 Todo 开发服务 |
| `pnpm start` | 启动已构建的 Todo |
| `pnpm typecheck` | 检查各包和仓库测试类型 |
| `pnpm analyze` | 原生静态编译分析；不是运行时测试覆盖率 |
| `pnpm test` | 构建原生测试产物，运行 CLI 与 HTTP 集成测试 |
| `pnpm check` | 依次执行 build、typecheck、analyze、test |

根 package.json 直接调用 pnpm 递归命令，不维护额外的任务编排器。新增包通过 workspace 和标准 scripts 参与检查。core 以 TS 源码交付，保留 typecheck，没有重复的 build。

typecheck 只检查类型，analyze 执行静态分析，test 构建所需原生测试产物，dev 自动构建并监听应用。start 使用已有的应用二进制，需要先运行 build。修改 CLI 后运行 `pnpm --filter @backts/cli build` 更新产物。旧 pnpm coverage 仍作为 analyze 的兼容别名。

## 原生测试入口

`backts build --tests` 递归发现当前包的 tests/**/*.native.ts，串行构建到 .scriptc/<文件名>。`backts analyze --tests` 分析同一组入口。`--tests` 不能和 --entry/--out 混用；单应用分析使用 `backts analyze`。

只编译测试不等于运行测试。core/Todo 保留包内 test:build 脚本供工作区编排使用，Node HTTP 驱动测试仍在本仓库执行。

发现规则保持兼容：按路径排序，忽略普通 TS 辅助文件与符号链接；缺少入口、空输出名或大小写不敏感的重名均失败。先验证全部输出名再构建，编译失败立即停止。新增入口无需编辑脚本。

已有产物时，可直接执行专项测试：

```sh
node --test tests/integration/logger.test.ts
```

## 原生编译限制

scriptc 0.0.36 无法直接静态编译此框架的裸包导入，CLI 按公开 exports 整理 TS 源码图。动态 import、require、跨包相对源码引用和任意 JS 包不受支持。

类型检查成功不等于原生构建成功。analyze 出现 blocker 或动态回退时失败；当前 HTTP aborted 监听可能使 LLVM 后端改用 C 后端，这不等于 JavaScript 动态回退。

[仓库外 tarball 验收](cli.md) 单独执行，需要安装依赖、本机编译环境和临时端口监听权限，不把安装操作放入默认测试。
