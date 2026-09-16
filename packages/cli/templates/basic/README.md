# __PROJECT_NAME__

使用 `@backts/core` 的原生 HTTP 应用，通过普通异步处理器显式发送响应。

## 环境与启动

需要 Node 24+、clang 与平台 SDK，当前已验证 macOS ARM64。编译器随 CLI 安装。
如果创建时跳过安装或安装失败，先在项目目录执行 `__PM__ install --ignore-scripts`；私库认证使用用户级 npm 配置，不要将 token 写入项目。

在项目目录执行：

```sh
__PM__ exec backts doctor
__PM__ run dev
```

另开终端执行 `curl -i http://localhost:3000/health`，预期 200 和 `{"status":"ok"}`。根路径 `/` 返回欢迎消息。
在 `src/main.ts` 的 `app.run()` 前添加路由。

修改源码会编译并重启；编译失败保留旧服务。成功替换最多等待旧服务一秒，进行中的请求可能中断，内存状态会重置。Ctrl+C 停止开发进程及子进程。
端口可用 `npm exec -- backts dev -- 3100` 或 `pnpm exec backts dev -- 3100` 指定。

## 检查与分发

先停止 dev，再执行以下命令，避免占用同一端口：

```sh
__PM__ run typecheck
__PM__ run analyze
__PM__ run build
__PM__ run start
```

start 只运行已有产物，analyze 是静态编译分析，不是测试覆盖率。原生产物为 `build/app`，运行该文件无需 Node 或开发依赖。仅在已验证的目标平台分发，build 自动复制 public；部署时复制整个 build 目录并执行 `cd build && ./app`。

当前框架为实验阶段。支持公开包入口的静态 TS 导入，不支持任意 JavaScript npm 包、动态导入或 tsconfig paths。

## 文档

- [使用指南](https://github.com/xelume/backts/blob/main/docs/index.md)
- [Framework 入门](https://github.com/xelume/backts/blob/main/docs/usage/framework.md)
- [检查与测试](https://github.com/xelume/backts/blob/main/docs/usage/testing.md)
- [常见问题](https://github.com/xelume/backts/blob/main/docs/usage/troubleshooting.md)

以上为跟随 main 更新的开发版文档；请按项目依赖版本切换对应发布 tag 或提交，访问仓库需要相应权限。
