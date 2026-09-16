# 静态资源

把公开资源目录挂载到 URL，并随应用一起运行和分发。

先准备[应用入口](createApplication.md)和实际存在的公开目录。`app.serveStatic()` 必须在启动前调用。

## 挂载目录

```ts
app.serveStatic({ root: "./public", prefix: "/assets" });
```

root 必须为现有目录，相对路径以进程 cwd 解析，在注册时固定。上述配置让 `public/app.js` 对应 `/assets/app.js`。省略 prefix 或调用 `app.serveStatic("./public")` 会挂载到 `/`。

## 请求匹配

- 静态文件独立于二进制，需要一起分发；不会自动嵌入。
- 显式业务路径优先，包括参数路由；业务抛错或返回 404 时不回退到静态目录。
- 多挂载时最长 URL 段前缀独占匹配，缺失文件不会再尝试更短挂载。
- 仅支持 GET/HEAD；其他方法返回 405，Allow 为 GET, HEAD。
- 目录 URL 缺少尾斜杠时 308 跳转，当前不保留 query；目录内读取 index.html。
- 不提供目录列表或 SPA fallback。

## 缓存与文件限制

当前返回 Cache-Control: no-cache；没有 ETag、304、Range、压缩。GET 会把整个文件读入内存，不是大文件流式服务。根目录必须是可信且稳定的公开目录；隐藏路径、越界路径与不安全符号链接被拒绝。详细安全与性能边界见 [静态文件契约](../../packages/core/README.md#挂载静态资源)。

## 相关文档

- [分发资源与工作目录](distribution.md)
- [业务路由的匹配优先级](routing.md)


应用构建自动同步 public 到 build/public，backts start 在可执行文件目录运行。部署时复制整个 build 目录并执行 `cd build && ./app`。dev 继续读取项目中的 public。
