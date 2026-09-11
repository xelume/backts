# 检查、构建与测试

在生成的应用目录中运行以下命令。安装方式见 [创建自己的应用](createApplication.md)。

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 检查应用 TypeScript 类型 |
| `npm run analyze` | 检查应用能否静态编译 |
| `npm run build` | 编译应用，输出 `.scriptc/app` |
| `npm run dev` | 构建并启动开发服务，监听源码变化 |
| `npm run start` | 运行已构建的应用 |

`start` 使用已有二进制，需要先执行 `build`。`analyze` 表示静态可编译性，不表示运行时测试覆盖率。使用 pnpm 的项目可将上述 `npm run` 替换为 `pnpm run`。

## 原生测试入口

`backts build --tests` 递归发现当前包的 tests/**/*.native.ts，以默认最多 2 个任务并发构建到 .scriptc/<文件名>。`backts analyze --tests` 分析同一组入口。`--tests` 不能和 --entry/--out 混用；单应用分析使用 `backts analyze`。

这两个命令只编译或分析测试入口，不会运行测试；应用需要自行执行生成的原生测试程序。

发现规则保持兼容：按路径排序，忽略普通 TS 辅助文件与符号链接；缺少入口、空输出名或大小写不敏感的重名均失败。先验证全部输出名再构建，首个失败停止派发新任务，并等待已启动任务结束；诊断按完成顺序输出。新增入口无需编辑脚本。

`backts build --tests --jobs 1` 和 `backts analyze --tests --jobs 1` 可恢复串行执行。`--jobs` 仅适用于 `--tests`，必须为正安全整数；默认并发数为 CPU 可用并行度与 2 的较小值。不同入口使用独立的源码与后端暂存目录，成功后才将产物复制到最终输出路径；不要同时针对同一个包启动多个测试编译命令。

## 原生编译限制

scriptc 0.0.36 无法直接静态编译此框架的裸包导入，CLI 按公开 exports 整理 TS 源码图。动态 import、require、跨包相对源码引用和任意 JS 包不受支持。

类型检查成功不等于原生构建成功。analyze 出现 blocker 或动态回退时失败；当前 HTTP aborted 监听可能使 LLVM 后端改用 C 后端，这不等于 JavaScript 动态回退。
