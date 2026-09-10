# 路由与分组

注册 HTTP 接口，组织 URL 前缀，并理解路径冲突、404 和 405 的处理规则。

本页的 `app` 是[应用入口](createApplication.md)中的 HttpApp 实例；所有注册操作放在启动之前。

## 注册方法

```ts
app.get("/items", async (context) => { context.json(200, "[]"); });
app.post("/items", async (context) => { context.json(201, "{}"); });
app.patch("/items/:id", async (context) => { context.json(200, "{}"); });
app.delete("/items/:id", async (context) => { context.noContent(); });
```

这些示例只演示 HTTP 注册方式，没有实现数据存储。另有 `put`、`head`、`options`，以及 `route(method, path, handler, middleware?)`。方法名称会规范化为大写；处理函数应返回 `Promise<void>`，并提交一次响应。

## 路径规则

- 路径大小写敏感，`/items` 与 `/items/` 不同；query 不参与路由匹配。
- `:id` 匹配一个非空路径段，读取时 URI 解码；错误编码返回 400。
- 不支持通配符、正则路径和可选参数。
- 相同方法与路径形状不能重复注册；`GET /items/:id` 与 `GET /items/:name` 冲突。
- 静态段逐段优先于参数段；先选择路径形状，再匹配方法。
- 路径不存在返回 404；路径存在但方法不匹配返回 405，并带 Allow。

例如同时注册 `GET /items/fixed` 与 `POST /items/:id`，请求 `POST /items/fixed` 会返回 405，不进入参数路由。

HEAD 和 OPTIONS 必须显式注册，框架不把 HEAD 自动映射为 GET，也不自动提供 CORS 预检。

## 路由分组

```ts
const api = app.group("/api");
const items = api.group("/items");

items.get("", async (context) => { context.json(200, "[]"); });
items.get("/:id", async (context) => {
  context.json(200, JSON.stringify({ id: context.param("id") }));
});
```

最终路径为 `/api/items` 与 `/api/items/:id`。组内 `""` 表示前缀本身，`"/"` 表示带尾斜杠的路径。分组共用同一张路由表，所以跨组重复注册同样会报错。

业务通常不需要直接创建 Router。独立使用 Router 时，`describe()` 返回 `{ method, path }[]` 注册快照，不包含处理器；修改快照不会改变路由表。`HttpApp` 不暴露内部 Router 实例；启动时查看清单使用默认日志即可。

## 相关文档

- [处理输入与响应](requestResponse.md)
- [给路由组添加中间件](middleware.md)
- [业务路由与静态文件优先级](staticFiles.md)

