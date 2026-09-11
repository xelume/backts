# Framework 入门

从 Framework 模板开始，完成一个返回问候语的功能模块，并用替换依赖的原生服务验证接口。所有文件和命令都以生成的应用目录为基准，不依赖本仓库私有源码。

## 创建项目

先准备[环境](gettingStarted.md#环境要求)和[私库访问权限](cli.md#私有-npm-仓库配置)：

```sh
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-service --template framework --yes
cd my-service
npm exec -- backts doctor
```

模板已有 HelloModule、HealthModule 和 AppModule。保留它们，新增下方两个文件，再替换 AppModule 的内容。

## 编写业务规则

创建 `src/greetings/service.ts`。业务规则不依赖框架；空名称属于业务输入错误。本示例不涉及数据库或持久化。

```ts
export class GreetingInputError extends Error {}

export class GreetingService {
  constructor(private prefix: string) {}

  greet(name: string): string {
    const normalized = name.trim();
    if (normalized.length === 0) throw new GreetingInputError("Name is required");
    return `${this.prefix}, ${normalized}`;
  }
}
```

## 声明模块和接口

创建 `src/greetings/module.ts`：

```ts
import { HttpError } from "@backts/core";
import { controller, defineModule, factoryProvider, get, post, type RoutesOptions } from "@backts/framework";
import { GreetingInputError, GreetingService } from "./service";

export const greetingService = factoryProvider("GreetingService", () => new GreetingService("Hello"));

export const GreetingModule = defineModule({
  name: "GreetingModule",
  prefix: "/greetings",
  providers: [greetingService],
  controllers: [controller((resolve): RoutesOptions => {
    const service = resolve.get(greetingService);
    return {
      routes: [
        get("/:name", (context) => ({ message: service.greet(context.param("name")) })),
        post("", async (context) => ({ message: service.greet(await context.readText()) })),
      ],
      mapException: (error) => error instanceof GreetingInputError
        ? new HttpError(400, error.message)
        : undefined,
    };
  })],
});
```

工厂在应用装配时创建 Service，Controller 同步解析一次后通过闭包使用它。不要在请求中调用 `resolve.get`，也不要在工厂中连接外部资源；资源通过[生命周期回调](applicationLifecycle.md#显式管理资源)获取和释放。

GET 读取路径名称，POST 使用文本请求体并返回计算结果，因此两者都使用默认 JSON 200。创建资源的 POST 可通过第三个参数 `{ status: 201 }` 指定状态。方法处理器无返回值时默认 204，不能同时手动调用 `context.json()`。输入为空时通过 mapException 返回公开的 400 错误，未知异常保持默认安全 500。

这里的 `: RoutesOptions` 用于当前编译器的装配回调兼容性，应保留。

## 接入应用并验证

用以下内容替换 `src/appModule.ts`，保留模板的 `src/main.ts`：

```ts
import { defineModule } from "@backts/framework";
import { HelloModule } from "./hello";
import { HealthModule } from "./health/module";
import { GreetingModule } from "./greetings/module";

export const AppModule = defineModule({
  name: "AppModule",
  imports: [HelloModule, HealthModule, GreetingModule],
});
```

在应用目录执行：

```sh
npm run typecheck
npm run analyze
npm run build
npm run start
```

另开终端验证：

```sh
curl -i http://localhost:3000/greetings/BackTS
curl -i http://localhost:3000/greetings -H 'Content-Type: text/plain' --data '  Ada  '
curl -i http://localhost:3000/greetings -H 'Content-Type: text/plain' --data '   '
```

依次预期：200 `{"message":"Hello, BackTS"}`、200 `{"message":"Hello, Ada"}`、400 `{"error":"Name is required"}`。完成后用 Ctrl+C 停止服务；日常迭代可改用 `npm run dev`。

## 与 Core 共用 HTTP 能力

`createApplication()` 返回 HttpApp，仍可调用 use、serveStatic、manage、run 和 close。HTTP 配置放在 `http` 字段，替换模板 main.ts 中原有构造行即可，不要创建第二个实例：

```ts
const app = createApplication({
  module: AppModule,
  http: {
    maximumBodyBytes: 64 * 1024,
    logger: { format: "json", routes: false },
  },
});
```

| 场景 | Core | Framework |
| --- | --- | --- |
| 创建应用 | `createHttpApp(options)` | `createApplication({ module: AppModule, http: options })` |
| 返回 JSON | 异步 handler 调用 `context.json(status, JSON.stringify(data))` | `get/post` 等处理器直接返回 data |
| 无响应体 | handler 调用 `context.noContent()` | 方法处理器无返回值默认 204 |
| 全局中间件 | 启动前 `app.use()` | 相同；模块 middleware 仅覆盖匹配的模块路由 |
| 请求和错误类型 | 从 `@backts/core` 导入 | 同样从 `@backts/core` 导入 |

Core 的直接响应路由和 Framework 的返回值路由可以注册在同一个应用中，每条路由遵守自己的响应约定。

## 用替换依赖验证接口

在应用中创建 `tests/greetings.native.ts`。复用原模块和 Controller，仅替换 Service 的配置，确认请求确实使用替换后的实例：

```ts
import { createApplication, valueProvider } from "@backts/framework";
import { AppModule } from "../src/appModule";
import { greetingService } from "../src/greetings/module";
import { GreetingService } from "../src/greetings/service";

const app = createApplication({
  module: AppModule,
  overrides: [valueProvider(greetingService, new GreetingService("Test"))],
});
const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3101;
await app.run({ port, host: "127.0.0.1" });
```

确认 3101 端口可用，在应用目录编译并启动：

```sh
npm exec -- backts build --tests
./.scriptc/greetings 3101
```

另开终端执行带断言的 Node 客户端。成功输出 PASS 并返回退出码 0；网络错误、状态或正文不符时非零退出：

```sh
node --input-type=module -e '
import assert from "node:assert/strict";
const response = await fetch("http://127.0.0.1:3101/greetings/BackTS", { signal: AbortSignal.timeout(5000) });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { message: "Test, BackTS" });
console.log("PASS greeting override");
'
```

完成后在服务终端按 Ctrl+C。这个 native 文件是持续运行的 HTTP 测试服务，断言由外部 Node 客户端执行；自动化时需负责服务就绪等待和 finally 清理，可参考仓库的 [HTTP 测试辅助器](../../tests/integration/nativeServer.ts)。

更多规则见 [Framework API](../../packages/framework/README.md)；业务规则的原生测试见[检查与测试](testing.md#编写第一个原生测试)。
