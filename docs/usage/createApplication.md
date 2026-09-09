# 创建自己的应用

在工作区创建独立的 Hello 应用，完成类型检查、原生编译和第一次请求。

建议先完成[环境与运行](gettingStarted.md)。本页创建的文件均属于新应用，不需要修改框架。

## 创建目录与配置

当前推荐在本工作区新增独立消费者。下面以 `examples/hello/` 为例：它匹配现有 `examples/*` workspace 规则，不需要修改框架源码。

```text
examples/hello/
  package.json
  tsconfig.json
  src/
    main.ts
```

`examples/hello/package.json`：

```json
{
  "name": "@backts/example-hello",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "coverage": "node ../../scripts/compileNative.ts coverage src/main.ts",
    "build": "node ../../scripts/compileNative.ts build src/main.ts .scriptc/hello",
    "start": ".scriptc/hello"
  },
  "dependencies": {
    "@backts/core": "workspace:*"
  }
}
```

`examples/hello/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

## 编写应用入口

`examples/hello/src/main.ts`：

```ts
import { Application } from "@backts/core";

const app = new Application();

app.get("/health", async (context) => {
  context.json(200, JSON.stringify({ status: "ok" }));
});

app.get("/hello/:name", async (context) => {
  const name = context.param("name");
  context.json(200, JSON.stringify({ message: `Hello, ${name}` }));
});

await app.run({ port: 3100, host: "127.0.0.1" });
```

## 构建与启动

新增 workspace 包之后运行：

```bash
pnpm install --ignore-scripts
pnpm --filter @backts/example-hello typecheck
pnpm --filter @backts/example-hello coverage
pnpm --filter @backts/example-hello build
pnpm --filter @backts/example-hello start
```

此处安装会更新工作区链接及锁文件，所以不使用 `--frozen-lockfile`；日常已有依赖的安装仍使用冻结锁文件。

## 验证响应

```bash
curl -i http://127.0.0.1:3100/hello/BackTS
```

预期返回 `200`，响应体为 `{"message":"Hello, BackTS"}`。

## 纳入工作区检查

根目录的构建与检查命令目前显式协调 core 和 Todo；新包需要单独运行上述检查。将来把新包纳入根任务时应更新相应的命令入口，不能认为它会自动加入根 `pnpm check`。

后续示例中的 `app` 均指当前应用实例，路由和中间件应放在 `run()` / `listen()` 之前。各启动配置示例是互斥选择，不要对同一实例连续调用多个启动方法。

## 相关文档

- [添加路由](routing.md)
- [组织业务代码](businessCode.md)
- [验证新功能](testing.md)

