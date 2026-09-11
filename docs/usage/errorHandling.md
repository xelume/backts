# 错误处理与观察

将公开错误映射为 HTTP 响应，并观察请求异常与传输结果。

先准备[应用入口](createApplication.md)。路由示例在启动前注册，createHttpApp 配置示例替换入口中的构造配置。

Framework 应用将相同 HTTP 选项放在 `createApplication({ module: AppModule, http: options })` 的 `http` 字段，见[配置对照](framework.md#与-core-共用-http-能力)。

## 公开业务错误

```ts
import { HttpError } from "@backts/core";

app.get("/unavailable", async (_context) => {
  throw new HttpError(404, "Item not found");
});
```

默认响应为 `404 {"error":"Item not found"}`。HttpError 的 message 会直接给客户端，应用应选择安全的公开文案。未知异常返回 `500 {"error":"Internal server error"}`；原始异常不会自动输出到默认日志。

## 自定义错误响应

下例替换应用构造位置的配置：

```ts
const app = createHttpApp({
  errorHandler: async (failure, context) => {
    context.json(failure.status, JSON.stringify({
      success: false,
      error: failure.message,
    }));
  },
});
```

`failure` 包含 status、message、cause。errorHandler 仅在尚未响应时调用，必须自行响应；抛错或未响应会回退到 500，已经响应时不会再发第二次。

## 观察回调

```ts
const app = createHttpApp({
  onError: async (failure, context) => {
    // 可在此接入应用指标；不要修改 failure 或 context。
  },
  onRequestComplete: async (result) => {
    // result: method, path, status, durationMs, outcome。
  },
});
```

onError 在错误响应前被等待，慢回调会延迟响应；回调失败被隔离。cause 仅供服务端诊断，不应直接序列化给客户端。

onRequestComplete 每请求至多一次。outcome 为 completed 时表示本地响应写入完成，为 closed 时表示响应完成前连接关闭；后者的 status 不保证已经发送给客户端。回调不阻塞 HTTP 关闭，也不代表后台工作已完成。

观察回调与内置日志独立。若回调里再打印请求，会出现业务日志和框架日志各一条；可以选择自定义 logger，或关闭内置日志来保留原有策略。

## 相关文档

- [日志与观察回调的分工](logging.md)
- [在 HTTP 边界映射领域错误](businessCode.md)

