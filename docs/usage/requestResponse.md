# 读取请求与发送响应

从请求中读取并校验输入，再提交一次明确的 HTTP 响应。

先了解[路由注册](routing.md)。示例沿用应用入口中的 `app`，各路由在启动前注册；代码块中的额外 import 放在文件顶部。

## 读取请求

| API | 返回值与用途 |
| --- | --- |
| `context.method` | 请求方法 |
| `context.path` | 不包含 query 的路径 |
| `context.url` | 原始请求目标，包含 query 和编码 |
| `context.param(name)` | 已匹配路径参数；名称不存在时抛错 |
| `context.query(name)` | 查询参数首值，缺失为 undefined |
| `context.queryAll(name)` | 所有同名查询参数，保留顺序 |
| `context.requestHeader(name)` | 大小写不敏感的请求头，缺失为 undefined |
| `context.readJson()` | JSON 输入，返回 unknown |
| `context.readText()` | UTF-8 文本 |
| `context.readBytes()` | 原始 Buffer |

### 查询参数

```ts
app.get("/search", async (context) => {
  const q = context.query("q") ?? "";
  const tags = context.queryAll("tag");
  context.json(200, JSON.stringify({ q, tags }));
});
```

`/search?q=hello+world&tag=a&tag=b` 得到 q 为 `hello world`、tags 为 `["a","b"]`。`?q=` 得到空字符串，不等同于缺失。若业务不允许重复参数，应检查 `queryAll()` 数量并自行拒绝。

### JSON 校验

`readJson()` 要求 `Content-Type: application/json`，允许 charset 参数。空 body 或无效 JSON 返回 400，其他媒体类型返回 415；不自动接受 `application/*+json`。

下面是可复制到应用中的校验示例，字段断言之后仍进行显式检查：

```ts
import { HttpError } from "@backts/core";

interface CreateItemInput { title?: string; }

function readTitle(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Expected an object");
  }
  let input: CreateItemInput;
  try { input = value as CreateItemInput; }
  catch { throw new HttpError(400, "Invalid fields"); }
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new HttpError(400, "Title is required");
  }
  return input.title.trim();
}

app.post("/validated-items", async (context) => {
  const title = readTitle(await context.readJson());
  context.json(201, JSON.stringify({ title }));
});
```

示例只回显校验结果，不执行持久化。`as` 不是运行时校验；原生 checked cast 还可能抛错，因此在 HTTP 边界捕获并映射为 400。完整业务校验可以参考 [Todo 输入解析](../../examples/todo/src/todos/todoInput.ts)。

### 请求体只能读取一次

三种读取方式共享一次性限制，不能先 readText 再 readJson。中间件读取请求体后，下游也不能再次读取；需要共享解析结果时，应由应用明确设计传递方式，当前没有通用的 context.state API。

大小限制按原始字节累计，包括分块传输，不依赖 Content-Length。超限返回 413。readText 与 readBytes 不检查媒体类型；二进制输入或签名校验应使用 readBytes，避免文本转换改变原始字节。

## 发送响应

| API | 行为 |
| --- | --- |
| `json(status, text)` | 发送已序列化 JSON 字符串 |
| `noContent()` | 204，无响应体 |
| `bytes(status, contentType, buffer)` | 原始字节，自动设置 Content-Length |
| `header(name, value)` | 设置响应头，必须在响应提交前调用 |
| `redirect(path)` | 308 同站点绝对路径重定向 |
| `emptyFile(contentType, length)` | 200 无 body，主要用于静态 HEAD |
| `responded` | 是否已经提交响应 |

`json()` 不接受普通对象，也不替你 JSON.stringify：

```ts
app.get("/version", async (context) => {
  context.header("x-service", "hello");
  context.json(200, JSON.stringify({ version: "1.0" }));
});
```

发送纯文本可使用 bytes：

```ts
import { Buffer } from "node:buffer";

app.get("/text", async (context) => {
  context.bytes(200, "text/plain; charset=utf-8", Buffer.from("Hello"));
});
```

一次请求只能提交一次响应。重复提交、提交后改响应头都会抛错；处理器结束却没有响应时，框架默认返回 500。框架在 HEAD 请求上省略响应体，但仍需要注册相应 HEAD 路由。

`redirect()` 接受 `/new-path` 等路径，拒绝完整外部 URL、`//host`、反斜杠及换行。它固定使用 308，不是任意状态码的重定向 API。

## 相关文档

- [错误响应策略](errorHandling.md)
- [配置请求体大小上限](applicationLifecycle.md)
- [中间件读取请求体的限制](middleware.md)


## 可选的结果处理

需要在发送前转换结果时，用 `resultHandler()` 将返回值处理器适配到现有路由。原有直接调用 `context.json()` 的方式保持不变。

```ts
import { resultHandler } from "@backts/core";

app.get("/message", resultHandler(async () => ({ message: "hello" }), {
  status: 200,
  transforms: [async (result, context) => {
    context.header("x-result", "transformed");
    return { message: result.message.toUpperCase() };
  }],
  serialize: (result) => JSON.stringify({ data: result }),
}));
```

执行顺序为：现有中间件进入 → 处理器返回结果 → transforms 按数组顺序执行 → serialize → 发送 JSON → 中间件返回。转换保持结果类型；需要包装为不同响应结构时在 serialize 中完成。serialize 必须返回有效 JSON 文本，框架不再次解析验证内容，也不自动反射业务对象。

status 必须显式指定，接受 200–599，排除 204、205、304；非法值在创建适配器时抛错。无内容和流式响应继续使用原有处理器。HEAD 需要显式注册，执行完整处理和序列化，但不发送正文。

配置字段与转换数组在创建适配器时复制，回调闭包的外部状态仍由应用管理。每次请求的结果独立保存；同一适配器可用于多个路由或路由组。现有中间件短路时不会执行结果处理器。

处理器和转换可以读取请求、设置响应头，但不得直接发送响应。若误用已经发送，适配器报告错误并停止后续阶段，不会撤销已发送的内容或再次响应。处理、转换、序列化异常交给现有中间件 catch 或应用错误边界；不会自动回滚业务副作用。发送前设置的响应头遵循现有错误处理契约，不会自动回滚。

这不是全局拦截器或取消机制。响应完成统计继续使用 onRequestComplete，不能使用中间件返回时间代替。

scriptc 0.0.36 兼容限制：仅抛错的异步回调应显式标注 `Promise<结果类型>`，不要依赖推断出的 `Promise<never>`。本轮原生验证中，后者在转换异常路径触发了未处理拒绝并导致进程退出，显式返回类型的相同场景通过。此限制不是取消错误传播；已标注回调的错误仍由原有边界处理。
