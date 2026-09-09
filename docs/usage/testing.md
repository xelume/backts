# 测试与原生编译

确认 TypeScript 代码既能通过类型检查，也能编译成原生程序并通过实际请求测试。

先完成[环境与运行](gettingStarted.md)。除非注明，命令均在 `backts/` 执行。

## 工作区检查命令

已有工作区的检查入口：

```bash
pnpm typecheck
pnpm coverage
pnpm build
pnpm test:build
pnpm test
pnpm check
```

| 命令 | 验证范围 |
| --- | --- |
| typecheck | core、Todo、构建工具与 Node 测试的 TS 类型 |
| coverage | scriptc 静态可编译程度，不是运行时测试覆盖率 |
| build | core 类型验证与 Todo 二进制 |
| test:build | 构建 core 和 Todo 的原生测试入口 |
| test | 重建应用与测试二进制，执行 Node 集成测试 |
| check | 类型、静态分析、构建与完整测试 |

## 添加与运行测试

原生测试入口按包内 `tests/**/*.native.ts` 自动发现。文件名（去掉后缀）作为二进制名称，忽略大小写后不能冲突。仅类型测试不要使用该后缀。新增 Node 集成测试放在根 `tests/integration/*.test.ts`。

例如已构建测试二进制后，只跑日志专项：

```bash
node --test tests/integration/logger.test.ts
```

## 验证应用消费者

单独验证 Todo 消费入口：

```bash
pnpm --filter @backts/example-todo coverage
pnpm --filter @backts/example-todo build
```

## 原生编译限制

当前 scriptc 0.0.36 的裸包导入不能直接静态编译本框架，需使用工作区的 compileNative.ts。它按公开 exports 整理静态 TS 模块图，不启用动态引擎。动态 import、require、跨包相对源码引用不在该工具支持范围内。

`tsc` 成功不代表原生构建成功。新增语法、依赖或回调写法后，应检查 coverage 和原生二进制。coverage 出现 blocker 时构建流程会失败。当前 HTTP aborted 监听可能使 LLVM 后端退到 C 后端，这不等于 JavaScript 动态回退。

## 相关文档

- [独立消费者的构建命令](createApplication.md)
- [运行构建产物](distribution.md)

