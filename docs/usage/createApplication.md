# 创建自己的应用

使用 [BackTS CLI](cli.md) 创建独立应用。模板包含 src/main.ts、独立 TypeScript 配置、npm 依赖和开发脚本，不要求新项目位于本仓库。

包发布后的入口：

```sh
npm create backts@latest my-api
cd my-api
npm run dev
```

当前尚未发布 npm，安装工作区依赖并构建 CLI 后执行：

```sh
pnpm --filter @backts/cli build
pnpm exec backts create /tmp/my-api --skip-install
```

发布前需按 CLI 文档安装本地 tarball，普通 registry 安装目前不可用。创建文件完成不等于依赖已安装。

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

默认 `--template basic` 使用 core 的 createHttpApp，路由用普通函数编写。

```sh
backts create my-api --template basic --skip-install
backts create my-service --template framework --skip-install
```

framework 模板使用 @backts/framework 的 createApplication 和模块声明，提供 Controller/Service 显式工厂示例。两种模板共用构建工具；都不要求装饰器或反射。当前包尚未发布，使用本地包验证安装。
