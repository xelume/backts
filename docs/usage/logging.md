# 日志与启动路由清单

查看服务启动和请求日志，选择终端、JSON 或自定义日志出口。

以下配置应用于[应用创建位置](applicationLifecycle.md)，多个配置示例按需要择一或合并。

## 默认输出

```text
[BackTS]  15:42:08  INFO   [Application] Listening on http://localhost:3000
[BackTS]  15:42:08  INFO   [Routes]      GET      /api/todos/:id
[BackTS]  15:42:08  INFO   [Static]      GET/HEAD /assets (static mount)
[BackTS]  15:42:09  INFO   [HTTP]        GET     /api/todos/1                 → 200     1 ms
```

时间采用本地 HH:mm:ss，不显示 PID。状态码按结果着色，提前断连显示 CLOSED；不足一毫秒显示 `<1 ms`，并不表示计时精度高于毫秒。

成功监听后，run 与 listen 都会输出一次清单：先按注册顺序列业务路由，再列静态挂载。分组显示完整前缀和参数名，不扫描静态文件、不打印本地目录。清单是注册信息，不保证每个静态 URL 有文件或中间件放行。

## 关闭与格式配置

以下是互斥的配置示例：

```ts
createHttpApp({ logger: false });
createHttpApp({ logger: { routes: false } });
createHttpApp({ logger: { color: false } });
createHttpApp({ logger: { format: "json" } });
```

| 选项 | 效果 |
| --- | --- |
| `logger: false` | 关闭全部框架日志，保留 HTTP 行为与观察回调 |
| `logger.routes: false` | 仅关闭启动路由和静态挂载事件 |
| `logger.format` | pretty 或 json，优先于 LOG_FORMAT 环境变量 |
| `logger.color: false` | 关闭终端颜色 |
| `logger.write` | 替换内置输出，优先于格式选项 |

```bash
LOG_FORMAT=json pnpm start
NO_COLOR=1 pnpm start
```

JSON 模式不带颜色。pretty 仅终端启用颜色，管道不输出 ANSI，NO_COLOR 可禁用颜色。warn/error 写入 stderr，其余写入 stdout；采集 JSON 日志时应同时采集两个流。

## 自定义日志出口

```ts
import type { Logger } from "@backts/core";

const logger: Logger = {
  write: async (event) => {
    const route = event.route;
    if (route !== undefined) {
      console.log(`${route.method} ${route.path}`);
      return;
    }
    console.log(JSON.stringify(event));
  },
};
const app = createHttpApp({ logger });
```

write 接收结构化事件，必须返回 Promise。抛错和 Promise 拒绝被隔离，不改变请求响应；框架不等待后台日志刷新。可靠投递、批量写入与关闭刷新由应用管理。若同时配置 routes:false，自定义出口也不会收到清单事件。

每条 LogEvent 都包含 event、level、ISO timestamp、message；按类型可附带 request 或 route：

| event | 附加字段或含义 |
| --- | --- |
| `listening` | message 包含监听地址 |
| `routeMapped` | route: `{ method, path }` |
| `staticMounted` | route: `{ method: "GET/HEAD", path }` |
| `requestCompleted` | request: `{ method, path, status, durationMs, outcome }` |
| `requestError` | 请求错误的安全摘要 |
| `internalError` | 观察器、HTTP 或托管关闭等内部异常摘要 |
| `startupFailed` | 托管启动失败 |
| `closing` / `closed` | HTTP 关闭开始与完成 |
| `shutdownTimeout` | HTTP 连接排空达到期限 |

请求错误与请求完成是两种事件，同一错误请求可能各输出一条。默认日志不包含 body、query 或原始异常；路径仍可能含业务标识，需要进一步脱敏时使用自定义出口。pretty 会替换控制字符；自定义输出要自行处理不可信文本。

## 相关文档

- [请求异常与完成回调](errorHandling.md)
- [日志资源与关闭流程](applicationLifecycle.md)

