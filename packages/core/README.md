# @backts/core

首次使用请先阅读 [使用文档首页](../../docs/index.md)。本文作为公开 API 与边界参考。

独立的通用 HTTP 框架源码包。公开 Application、RouteGroup、Router、HttpContext、HttpError 与扩展契约，不依赖示例、不包含业务 main.ts、不启动服务。

所有消费者通过 `@backts/core` 导入；package.json 仅导出根入口 `src/index.ts`，不暴露内部路径。当前 private，不发布 npm。包分发内容限定为 src 与本文档，测试和示例不进入包文件范围。

```ts
import { Application } from "@backts/core";

const app = new Application();
app.get("/health", async (context) => {
  context.json(200, JSON.stringify({ status: "ok" }));
});
await app.run(3000);
```

框架采用组合，不要求业务继承 Controller 或 Service。业务依赖注入、仓储及持久化由消费者自行定义。

## 构建与验证

包以 TypeScript 源码交付，`typecheck` 验证类型，不生成业务二进制。应用入口由消费者交给 scriptc 编译。当前 scriptc 0.0.36 无法直接静态编译此框架的裸包导入；CLI 通过 `@backts/cli/compiler` 整理公开 exports 可达的 TS 源码作为临时输入，不启用动态引擎。详细边界见根 README。独立应用通过 `backts build` 使用此能力；包尚未发布 npm。

`tests/httpServer.native.ts` 仅包含框架契约测试路由，通过公开包入口创建应用；不导入 Todo。`tests/compatibility.native.ts` 为类与生命周期探针。

## 启动参数

run 和 listen 都支持相同的两种形式：

```ts
await app.run(3000);
await app.run(3000, true);
await app.run(3000, "127.0.0.1");
await app.run({ port: 3000 });
await app.run({ port: 3000, host: true });
```

host 类型为可选的 string | boolean。省略或 false 使用 localhost；true 使用 0.0.0.0；字符串按指定地址监听（例如 127.0.0.1、0.0.0.0）。空字符串和带首尾空白的 host 被拒绝。localhost 的解析取决于运行时与系统配置，不保证等价于固定 IPv4 地址；需要固定地址时显式指定。

true / 0.0.0.0 会监听所有 IPv4 网卡，包括可能的局域网或公网接口，应结合防火墙与认证限制访问。未改变端口校验或增加端口自动递增。

对象形式不能再传第二个 host 参数；重载在类型检查时拒绝这种混用，运行时也会拒绝。两种形式共享解析与启动实现，已有显式字符串 host 的对象调用保持兼容。启动日志使用解析后的 host，不输出 true/false/undefined。

## 公开契约

| 能力 | 约定 |
| --- | --- |
| `Application(maximumBodyBytes?)` | 默认 16,384 字节；必须为正整数 |
| `get/post/put/patch/delete/head/options(path, handler)` | 显式注册；handler 返回 `Promise<void>`，必须发送响应 |
| `run({ host, port })` | 独立服务入口；监听成功后完成，统一输出启动日志，失败退出码为 1；托管 SIGINT/SIGTERM |
| `listen({ host, port })` | 成功监听后完成，绑定失败拒绝；port 为 1–65535；应用仅可尝试启动一次 |
| `close()` | 未启动时无操作；重复调用共享关闭 Promise；不支持关闭后重启 |
| `HttpContext.param(name)` | 返回已解码的参数，缺失参数属于编程错误 |
| `readJson()` | 每请求只可调用一次；返回 unknown，消费者必须校验 |
| `json(status, serializedJson)` | 接受已经 JSON.stringify 的字符串，设置 JSON Content-Type |
| `noContent()` | 发送 204，无响应体 |
| `header(name, value)` | 只能在响应提交前设置 |
| `HttpError(status, message)` | message 可公开给客户端，不应包含秘密或内部错误信息 |

`Router.add/dispatch` 也由源码入口公开；一般应用使用 `Application` 即可。`HttpContext.setParameters` 是 Router 的集成接口，不应由业务处理器覆盖。

close() 停止接入新连接，平滑关闭空闲连接，并等待活动响应完成；5 秒后销毁剩余连接。重复调用共享关闭 Promise，整个流程不主动终止进程。响应通过结束回调和连接关闭事件计数，完成后使用 socket.end() 保留发送队列，避免大响应被截断。scriptc 0.0.36 没有提供 closeIdleConnections()/closeAllConnections()，所以连接由框架内部跟踪；server.close 仅支持无参数回调，无法复刻完整 Node 错误回调契约。

只有 run() 托管 SIGINT/SIGTERM，建议每进程仅使用一个。首次信号调用上述 close()；正常关闭不强制退出，其他资源仍由其所有者负责。连接超时销毁后记录超时并以状态码 1 退出；若底层关闭回调仍不完成，第 6 秒执行最终退出兜底。首次信号后的 250ms 内合并重复转发，避免 pnpm 把一次 Ctrl+C 转发多次；窗口后再次收到信号立即销毁连接并以状态码 1 退出，可能中断请求。正常关闭清除定时器，仅移除实例自身的信号回调。listen()/close() 不主动注册信号或接管进程退出。集成测试覆盖空闲连接、大响应完整发送、客户端中断、未完成请求以及 pnpm 进程组残留。

### 路由规则

- 大小写敏感，尾部斜杠有意义，query 不参与路径匹配。
- 支持静态路径和完整段形式的 `:name` 参数，无通配符、正则或可选参数。
- 同一方法下参数名称不同但形状相同的路由视为重复，注册时抛错。
- 静态段逐段优先于参数段，与注册先后无关；先选路径形状，再匹配方法。
- 例如 GET `/items/fixed` 与 POST `/items/:id` 共存时，POST `/items/fixed` 返回 405，不落入参数路由。
- 路径存在但方法不匹配时返回 405 和 Allow；路径不存在返回 404。
- 参数匹配后才进行 URI 解码，参数编码错误返回 400。
- 不自动把 HEAD 转为 GET，也不自动处理 OPTIONS/CORS；HEAD 错误响应不发送 body。
- 开始监听后禁止注册新路由。

### 请求与错误

JSON body 要求 `Content-Type: application/json`，允许 charset 参数。请求体上限按原始字节累计，不依赖 Content-Length。超限后停止存储并丢弃后续数据，返回 413，不立即销毁 socket。空 body 或非法 JSON 返回 400，其他媒体类型返回 415。

JSON 的 TypeScript `as` 不能替代运行时校验。消费者必须显式检查对象形状和字段类型，并按自身 HTTP 契约处理校验失败。本框架没有通用 schema 验证器。

未知异常及处理器未响应返回 `500 {"error":"Internal server error"}`；服务端仅输出固定错误事件，不输出原始异常、请求体或敏感信息。重复响应被拒绝；已发送响应后的错误只记录事件，不再次写入连接。默认不生成请求 ID 或输出堆栈；可通过 logger 自定义输出；onError 和 onRequestComplete 保留为独立观察回调。


## 尚未支持

没有认证、ORM、WebSocket、TLS、限流、跨平台保证。仍是实验性的 HTTP 内核，不代表已经提供完整生产级后端平台。

## 挂载静态资源

```ts
app.serveStatic("./public");
// 或挂载到指定 URL 前缀：
app.serveStatic("./images", "/images");
// 对象形式与位置参数形式等价：
app.serveStatic({ root: "./downloads", prefix: "/downloads" });
```

`root` 必须是现有目录，注册时按 cwd 解析并固定其真实路径；支持绝对路径。`prefix` 默认 `/`，尾部斜杠规范化；重复前缀、无效目录和启动后注册会抛错。文件是外部分发资源，不自动嵌入二进制，业务无需自己实现文件响应。

显式业务路径优先（含参数路由），即使业务返回 404 或方法不匹配，也不会回退到静态文件。未匹配业务路径时，静态目录按最长 URL 段前缀匹配：`/assets` 不匹配 `/assetsx`；最长挂载目录缺失文件时直接返回 404，不尝试更短前缀。

静态挂载仅处理 GET/HEAD，其他方法返回 405 和 `Allow: GET, HEAD`。目录 URL 不带斜杠时返回 308 到带斜杠地址（当前不保留 query）；带斜杠时读取 index.html，不提供目录列表或 SPA 回退。HEAD 返回文件大小和内容类型，不读取响应体。

文件以原始 Buffer 发送，支持图片、字体等二进制内容。常见扩展名映射 Content-Type，未知类型为 application/octet-stream；返回 Content-Length、Cache-Control: no-cache 和 X-Content-Type-Options: nosniff。暂不支持 Range、压缩、ETag/Last-Modified 或 304 协商。

URL 解码失败返回 400；点号开头的路径段（包括 `..`、隐藏文件）、反斜杠、NUL、冒号，以及解析到根目录外或隐藏目标的符号链接返回 404。安全的目录内符号链接可访问。业务应只挂载可信、稳定的公开目录，不能挂载项目根目录或包含机密文件的目录。

**实现边界：** 元数据检查使用同步文件系统调用，GET 将整个文件异步读入内存；尚非大文件流服务。真实路径校验与读取不是文件系统级原子操作，不能抵御有本机写权限的攻击者并发替换目录或符号链接；不要把攻击者可写目录作为静态根。发布时应避免在请求期间修改目录拓扑。大量或大文件服务建议交由专门的静态文件服务器处理。

新增响应方法：`HttpContext.bytes(status, contentType, buffer)` 发送原始字节；`emptyFile(contentType, length)` 用于静态 HEAD；`redirect(path)` 用于同站点绝对路径重定向。它们保留单次响应约束。`Router.tryDispatch(context)` 仅在没有匹配路径时返回 false，原 dispatch 的 404/405 行为保持兼容。

进程组回归测试目前依赖 POSIX 信号语义，与已验证的 macOS 运行环境一致，不代表 Windows 退出行为已验证。

## 请求 API（0.0.36 工具链验证）

- `context.url`：原始请求目标，保留 query 和编码；`path` 继续仅用于路径匹配。
- `requestHeader(name)`：请求头名称大小写不敏感；缺失返回 undefined，多值数组按逗号加空格连接。原 `header(name, value)` 继续设置响应头。
- `query(name)`：返回首值，缺失返回 undefined，空值返回空字符串。
- `queryAll(name)`：保留重复值顺序，采用 URLSearchParams 的表单解码规则（包括加号转空格）。
- `readBytes()`：读取原始 Buffer，不限制媒体类型，适用于 Webhook 验签；保留原始字节。
- `readText()`：读取 UTF-8 文本，不限制媒体类型。
- `readJson/readText/readBytes` 共享一次性读取限制，禁止交叉重复读取；共用字节上限、分块输入、错误和断连处理。JSON 媒体类型要求不变。
- `route(method, path, handler)`：验证 HTTP token 并转为大写注册；提供 `put/head/options` 快捷方法。不隐式添加 HEAD 或 OPTIONS，不自动设置 CORS。

示例：`app.put("/echo", async (context) => { context.bytes(200, "application/octet-stream", await context.readBytes()); });`

## 应用配置与扩展

`new Application()` 和 `new Application(16384)` 保持兼容；也可使用 `ApplicationOptions` 对象。配置在构造时读取，中间件和路由在首次启动尝试时冻结。

```ts
const app = new Application({
  maximumBodyBytes: 16384,
  logger: false, // 本例演示使用观察回调自行输出日志。
  onError: async (failure, context) => {
    console.error(`${context.method} ${context.path}: ${failure.status}`);
  },
  onRequestComplete: async (result) => {
    console.log(`${result.method} ${result.path} ${result.status} ${result.outcome} ${result.durationMs}ms`);
  },
});
app.use(async (context, next) => {
  context.header("x-service", "example");
  await next();
});
const api = app.group("/api", [async (context, next) => {
  // 实际凭证校验由应用提供；这里仅演示短路行为。
  if (context.requestHeader("authorization") === undefined) {
    context.json(401, '{"error":"Authentication required"}');
    return;
  }
  await next();
}]);
api.get("/items", async (context) => { context.json(200, "[]"); });
```

### 中间件

- `app.use(middleware)` 添加全局中间件，覆盖业务路由、静态文件和 404/405。
- `app.get(path, handler, middleware?)` 等所有快捷方法和 `route(method, path, handler, middleware?)` 接受路由中间件数组。
- 中间件类型为 `(context, next) => Promise<void>`。必须 `await next()` 或 `return next()`，每层至多调用一次。也可以短路，自行响应。
- 全局 → 父组 → 子组 → 路由 → handler 顺序进入，逆序返回；路径参数在组/路由中间件执行前可用。
- 重复 next 或在该层结束后调用 next 会抛错。若该层完成时下游仍未完成，框架收拢该工作后报告契约错误，防止并发发送错误响应。运行时无法证明所有代码都使用了 await；消费者必须遵守约定，不能依赖遗漏 await 的行为。
- 未响应且未继续处理，仍产生默认 500。已发送后抛错只进入错误观察，不再生成响应。
- `await next()` 返回表示下游处理函数完成，不代表字节已经发送。完成日志应使用 `onRequestComplete`；响应提交后不得再设置响应头。
- 框架不自动取消下游工作，也未新增处理超时。中间件的异步依赖必须由消费者管理。

### 路由分组

`app.group(prefix, middleware?)` 返回 RouteGroup，支持与 Application 相同的方法快捷入口、`route()` 和嵌套 `group()`。请通过 app/group 创建分组；构造函数的注册回调属于框架装配契约。

- 组中间件数组在创建时复制；路由数组在注册时复制，之后修改原数组不改变已注册行为。
- `group("/api/todos").get("", handler)` 对应 `/api/todos`；`.get("/", handler)` 对应 `/api/todos/`。尾斜杠语义保留。
- 所有分组最终展开到同一个 Router；跨组重复路由同样报错，静态段优先规则不变。
- 组中间件只在路径和方法均匹配后执行，不拦截组前缀下的 404/405。需要覆盖它们的策略应使用全局中间件。
- 保留 RouteGroup 引用也不能在启动后添加路由。组内业务依赖由应用显式传入，不自动扫描目录或实例化 Controller。

### 错误策略与观察

`RequestFailure` 包含默认 HTTP `status`、安全 `message` 和原始 `cause: unknown`。HttpError 保留状态与公开消息，其他异常默认映射为 500 / Internal server error。框架在 catch 边界完成分类，以满足 scriptc 原生异常类型约束。

- `onError(failure, context)`：在默认或自定义错误响应前调用，包括已响应后的错误。仅用于观察，不应修改上下文或失败描述。回调拒绝会被捕获，继续原错误处理。
- `errorHandler(failure, context)`：替换默认错误响应，仅在尚未响应时调用；必须自行响应。若抛错或未响应，回退为隐藏细节的 500；若已经响应，不再发送第二次。
- 回调均返回 Promise；错误观察在处理链内被等待，慢回调会延迟错误响应。
- `cause` 仅供服务端诊断，不应直接序列化给客户端；日志仍需由应用脱敏。
- 自定义领域错误优先由业务 HTTP 层映射为 HttpError；core 不依赖业务异常类型。

`onRequestComplete(result)` 收到独立的 `{ method, path, status, durationMs, outcome }` 快照：

- 每请求至多一次，响应 end 回调先触发时 outcome 为 `completed`，响应完成前 close 时为 `closed`。
- `completed` 表示本地响应写入完成，不表示客户端业务已收到或消费全部数据。
- `closed` 的 status 只是关闭时服务端状态值，不保证该状态已发送给客户端。
- durationMs 使用 Date.now 的差值，不作为精密性能基准。回调异常被隔离，不生成额外响应。
- 此回调不阻塞 HTTP 关闭，也不代表后台任务完成。需要可靠刷新日志/指标时由应用管理对应资源。

HttpServer、ManagedRuntime、RequestPipeline、RequestErrors 均为内部实现，包根入口不导出。现有 Router、HttpContext 集成接口继续保留兼容；业务优先使用 Application。

## 日志配置

框架默认提供可读日志，覆盖请求完成、请求错误、监听、关闭和内部错误。无需在 demo 或业务中重复装配。

```ts
new Application();
new Application({ logger: false });
new Application({ logger: { format: "json", color: false } });
new Application({ logger: { write: async (event) => {
  console.log(JSON.stringify(event));
} } });
```

`logger: false` 关闭所有框架日志，不影响错误响应、退出码及 `onError` / `onRequestComplete` 回调。自定义 `write` 接收公开的 `LogEvent`，替换默认出口，可实现过滤、格式化或接入外部日志系统。也可使用公开的 `Logger` 类型声明对象。write 应返回 Promise，其抛错和拒绝均被隔离，不影响请求；框架不等待后台写入刷新，应用负责可靠投递和资源关闭。

每条事件包含 `event`、`level`、ISO `timestamp`、`message`。`requestCompleted` 另外包含 `request: { method, path, status, durationMs, outcome }` 独立快照。请求错误和请求完成是两个事件；不会把原始异常或请求体传给日志出口。路径可能含业务标识，应用可通过自定义出口进一步脱敏。

内置格式默认 pretty；`LOG_FORMAT=json` 可切换全部事件，显式 `format` 优先。pretty 显示`[BackTS]` 前缀、本地时间（`HH:mm:ss`）、级别、上下文和消息；请求消息按方法、路径、状态、耗时排列，不足 1ms 显示 `<1 ms`，断连标记 CLOSED。仅终端启用颜色，`color: false` 或 `NO_COLOR` 关闭颜色，管道不输出 ANSI。warn/error 写入 stderr，其余写入 stdout；JSON 模式始终不带颜色。

已有日志观察回调仍会运行；迁移到默认日志时请移除重复打印，或通过 `logger: false` 保留原有输出策略。

pretty 日志示例（终端自动着色）：

```text
[BackTS]  15:42:08  INFO   [Application] Listening on http://localhost:3000
[BackTS]  15:42:09  INFO   [HTTP]        GET     /api/todos                   → 200     1 ms
[BackTS]  15:42:10  WARN   [HTTP]        GET     /missing                     → 404     2 ms
```

框架标识为青色，时间和耗时为暗灰，上下文为黄色；INFO 绿色、WARN 黄色、ERROR 红色。`Application` 表示服务生命周期，`HTTP` 表示请求完成，`Exception` 表示请求错误或内部错误。耗时表示当前请求的耗时；JSON 和自定义出口保留原有事件结构。

### 启动路由清单

`run()` 和 `listen()` 成功监听后，默认输出一次已注册的业务路由和静态挂载。先输出业务路由（注册顺序），再输出静态挂载；嵌套路由组显示完整前缀和参数名。不自动推断 HEAD / OPTIONS 路由。静态挂载只列出 URL 前缀及 GET/HEAD，不遍历文件，也不打印本地目录。清单表示注册配置，不保证每个静态 URL 都有文件或中间件一定放行。

```text
[BackTS]  15:42:08  INFO   [Routes]      GET      /api/todos/:id
[BackTS]  15:42:08  INFO   [Static]      GET/HEAD /assets (static mount)
```

```ts
new Application(); // 默认开启
new Application({ logger: { routes: false } }); // 只关闭路由清单
new Application({ logger: false }); // 关闭全部框架日志
new Application({ logger: { write: async (event) => {
  if (event.event === "routeMapped" || event.event === "staticMounted") {
    const route = event.route;
    if (route !== undefined) console.log(`${route.method} ${route.path}`);
    return;
  }
  console.log(JSON.stringify(event));
} } });
```

JSON 和自定义出口新增 `routeMapped` / `staticMounted` 事件，`route` 为独立的 `RouteInfo { method, path }` 快照，其余事件字段不变。`routes: false` 会阻止这两种事件发送到任何出口；`logger: false` 优先关闭所有事件。写入回调仍遵守既有异常隔离和异步刷新契约。启动失败不会输出路由清单。

公开 `Router.describe()` 返回注册顺序的独立快照，修改快照不影响路由匹配；处理器不包含在快照中。
