# 中间件

在全局、路由组或单个接口上加入公共处理，并正确控制下游执行。

先了解[路由与分组](routing.md)及[请求与响应](requestResponse.md)。示例沿用入口中的 `app`，在启动前装配。

## 全局中间件

中间件签名为 `(context, next) => Promise<void>`，支持全局、路由组及单个路由三层装配。

```ts
app.use(async (context, next) => {
  context.header("x-content-type-options", "nosniff");
  await next();
});
```

## 路由中间件

单路由中间件是第三个参数：

```ts
app.get("/private", async (context) => {
  context.json(200, "{}");
}, [async (context, next) => {
  if (context.requestHeader("authorization") === undefined) {
    context.json(401, '{"error":"Authentication required"}');
    return;
  }
  await next();
}]);
```

上述例子只检查请求头存在，演示短路响应，不是完整认证实现。真正的凭证验证由应用提供。

## 路由组与执行顺序

组中间件放在 `app.group(prefix, middleware)` 的第二个参数。执行顺序为全局 → 父组 → 子组 → 路由 → handler，返回顺序相反。

## 调用约定

遵守以下约定：

- 每层至多调用一次 next，且使用 `await next()` 或 `return next()`。
- 提前响应后直接 return，不继续调用下游。
- 响应头通常在 next 前设置；next 返回后响应可能已提交。
- next 返回表示下游函数完成，不等于响应已发送完成；记录传输结果使用 onRequestComplete。
- 全局中间件覆盖静态文件、404 和 405；组和路由中间件仅在路径与方法匹配后执行。
- 组和路由中间件可读取已匹配参数；全局中间件进入时尚未完成路由匹配。

框架会拒绝重复或过晚调用 next。业务仍须遵守 await 约定，不能依赖遗漏 await 的行为。

## 相关文档

- [观察响应完成](errorHandling.md)
- [组中间件的匹配范围](routing.md)

