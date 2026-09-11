# 创建自己的应用

使用 [BackTS CLI](cli.md) 创建独立应用。模板包含 src/main.ts、独立 TypeScript 配置、npm 依赖和开发脚本，不要求新项目位于本仓库。

私库的创建入口（认证要求见 [CLI 文档](cli.md#私有-npm-仓库配置)）：

```sh
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-api --yes
cd my-api
npm run dev
```

仓库贡献者若需验证本地 CLI，在仓库根目录安装依赖并构建 CLI 后执行（生成应用的依赖仍来自私库，并非自动链接工作区源码）：

```sh
pnpm --filter @backts/cli build
pnpm exec backts create /tmp/my-api
```

模板会生成 `.npmrc` 并自动安装依赖。私库认证使用用户级 npm 配置或 CI 环境；需要仅生成文件时可传入 `--skip-install`。

默认入口注册 `/` 与 `/health` 并监听 localhost:3000。新增路由写在 app.run() 之前：

```ts
app.get("/hello/:name", async (context) => {
  context.json(200, JSON.stringify({ message: `Hello, ${context.param("name")}` }));
});
```

开发进程会重新编译并重启。执行 `curl http://localhost:3000/hello/BackTS` 检查结果。

新项目自带 typecheck、analyze、build、start 脚本。若将它加入本工作区，需有意把包依赖改为 workspace 协议；根编排按 packages/*、examples/* 与标准包脚本发现任务；CLI 不自动修改工作区配置。

- [路由](routing.md)
- [业务组织](businessCode.md)
- [原生编译与测试](testing.md)

## 模板选择

交互终端中省略 `--template` 会显示模板选择：Basic（默认）使用 core 的 createHttpApp，路由用普通函数编写；Framework 使用模块、Controller 和 Service。可用方向键选择并按 Enter 确认。

显式指定 `--template` 会跳过模板选择。使用 `--yes`、CI 或非交互环境时，未指定模板默认使用 basic。

```sh
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-api --template basic --yes
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-service --template framework --yes
```

framework 模板使用 @backts/framework 的 createApplication 和模块声明，提供直接返回业务结果的函数式接口示例。两种模板共用构建工具；都不要求装饰器或反射。模板已配置所需的 core/framework 依赖。

Framework 项目继续阅读 [Framework 入门](framework.md)，按模块添加接口、配置 HTTP 选项并测试依赖替换。
