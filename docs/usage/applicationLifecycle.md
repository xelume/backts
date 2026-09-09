# 应用配置与生命周期

配置请求体上限与监听地址，根据进程所有权选择启动和关闭方式。

先按[创建自己的应用](createApplication.md)准备入口；本页构造和启动示例是替换方案，不应在同一实例上连续启动。

## 应用选项

```ts
const app = new Application({
  maximumBodyBytes: 64 * 1024,
  logger: { format: "pretty", routes: true },
});
```

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `maximumBodyBytes` | 16384 | 读取请求体的累计原始字节上限，必须为正整数 |
| `logger` | 内置 pretty 日志 | `false` 静默，或传日志选项与自定义出口 |
| `errorHandler` | 内置错误 JSON | 自定义错误响应 |
| `onError` | 无 | 观察请求异常 |
| `onRequestComplete` | 无 | 观察响应完成或连接提前关闭 |

`new Application(16384)` 仍可用；需要多个选项时优先使用对象形式。

## 启动地址

`run` 和 `listen` 接受相同的地址参数：

```ts
await app.run(3000);                         // localhost
await app.run(3000, true);                   // 0.0.0.0
await app.run({ port: 3000, host: false });   // localhost
await app.run({ port: 3000, host: "127.0.0.1" });
```

端口必须为 1–65535 的整数，不支持端口 0 或端口自动递增。`host` 省略或为 false 时使用 localhost；true 时绑定所有 IPv4 网卡。localhost 的实际地址解析由系统决定，需要固定 IPv4 时明确指定 `127.0.0.1`。

## 选择 run 或 listen

| 方法 | 使用场景 | 启动失败 | 信号和退出 |
| --- | --- | --- | --- |
| `run()` | 独立服务进程入口 | 记录启动失败，退出码 1 | 托管 SIGINT/SIGTERM |
| `listen()` | 嵌入其他进程或自己管理生命周期 | 返回拒绝或在参数校验时抛错 | 不接管信号及进程退出 |
| `close()` | 主动停止应用 | 共享关闭结果 | 不主动退出进程 |

一次应用实例只允许一次启动尝试。首次尝试开始时，路由、中间件和静态挂载被冻结；关闭后不能重新启动该实例。

`close()` 停止接受新连接，关闭空闲连接并等待活动响应；5 秒后销毁剩余连接。重复关闭共享同一个 Promise，未启动时调用无操作。

`run()` 收到关闭信号时调用上述流程。超时强制关闭会以状态码 1 退出；底层关闭未能结束时有第 6 秒兜底。首次信号后 250ms 内的重复转发被合并，之后再次收到信号可立即强制退出。建议每进程只用一个托管 `run()` 应用。

数据库、队列和日志后台任务不属于 HTTP 关闭流程。需要协调这些资源时，由应用用 `listen()` 装配自己的关闭流程，并管理超时与错误。

## 相关文档

- [配置日志](logging.md)
- [运行与分发](distribution.md)

