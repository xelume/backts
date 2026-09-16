# Todo 示例

通用开发教程见 [使用文档首页](../../docs/index.md)，本文介绍 Todo 示例的业务与接口。

独立的框架消费者，依赖 `@backts/framework` 与 `@backts/core`。所有业务源码、启动入口与领域测试均属于本包，不属于框架。

```text
src/main.ts                 引用 AppModule、注册全局中间件、配置静态目录并启动
src/appModule.ts            根模块，集中组合 TodoModule 和 HealthModule
src/health/module.ts        健康检查路由
src/securityHeaders.ts      全局安全响应头中间件
src/todos/module.ts         声明模块并装配仓储、Service 和 Controller
src/todos/controller.ts     接口声明、HTTP 输入与业务结果转换
src/todos/service.ts        业务规则
src/todos/repository.ts     数据类型、仓储契约与内存实现
tests/domain.native.ts             实例隔离和快照等原生领域测试
```

在工作区根目录执行：

```bash
pnpm --filter @backts/example-todo build
pnpm --filter @backts/example-todo start
```

默认监听 localhost:3000，可向 start 传入端口。入口只调用 await app.run(port)；启动错误、日志和 SIGINT/SIGTERM 关闭由框架处理，不再在示例中编写 try/catch 或 shutdown()。端口参数仍由示例解析。修改代码需重新构建并重启。

Service 只依赖业务拥有的仓储接口。调用 `createInMemoryTodoRepository()` 直接获得 TodoRepository，无需调用适配方法。工厂通过闭包持有独立状态，直接返回仓储对象，不要求存储实现使用类。

2026-09-10 的 scriptc 0.0.36 验证中，把类实例直接传给 TodoService 报 SC2002。2026-09-14 使用 0.1.1 复测最小类方法仓储转函数记录接口，仍报 SC2002（record shapes must match exactly or width-coerce）。保留现有闭包工厂；当前已没有类包装或委托层需要删除。后续只有在真实存储实现需要类、且原生领域、模块隔离和 HTTP 测试通过时才调整工厂内部实现，仓储契约和消费者保持不变。

## Todo 示例契约

| 方法与路径 | 成功响应 |
| --- | --- |
| GET `/health` | 200，`{"status":"ok"}` |
| GET `/api/todos` | 200，Todo 数组 |
| POST `/api/todos` | 201，新增 Todo |
| PATCH `/api/todos/:id` | 200，更新后 Todo |
| DELETE `/api/todos/:id` | 204，无 body |

Todo 为 `{ id: number, title: string, completed: boolean }`。标题去除首尾空白，长度为 1–120 个 JavaScript 字符串码元。创建时 completed 固定为 false；PATCH 至少提供 title 或 completed，字段不能为 null。ID 使用正安全整数的规范十进制形式，拒绝 `01`、`1e0`、`1.0`。

缺失记录返回 404，非法输入返回 400；没有持久化，多进程不共享状态，重启清空数据。原 `scriptc-demo` 未修改。本示例保留 Todo 成功响应的数据约定，但有意强化了错误状态、ID 和媒体类型校验；未迁移原 demo 的静态资源、外部 fetch、version 或 CLI fetch 功能。


## 静态页面

示例使用 `app.serveStatic("./public")`。从示例包目录启动后访问 `/`，可以看到 public/index.html。原 API 路由不变。

build 自动将可执行文件和 public 放入 build 目录。分发时复制整个 build 目录，执行 `cd build && ./app`；相对路径按进程 cwd 解析，不是按二进制位置解析。框架包中不包含这些示例资源。

`AppModule` 通过 imports 引入 `TodoModule` 和 `HealthModule`。TodoModule 通过 providers/controllers 声明仓储、Service 和 Controller，framework 在每次应用装配时创建并复用实例，导入模块文件不会创建仓储实例；main.ts 配置全局中间件、静态目录并启动应用。TodoModule 直接使用 `defineModule` 声明；应用级测试可通过 `overrides: [valueProvider(todoRepository, fakeRepository)]` 替换仓储，无需重写 Controller 装配。URL 和响应契约不变；默认应用的数据隔离，显式复用同一仓储时共享数据。


Controller 的列表、详情、创建和更新方法统一返回业务数据，HTTP 映射与 Controller 放在同一文件，通过 framework 的 `controller` 和 HTTP 方法入口自动注册与响应；删除方法无返回值时自动发送 204，不再手写序列化器。状态码、响应头、输入规则和领域错误映射仍由应用声明。

## 查询与页面

页面地址为 http://localhost:3000/，支持创建、编辑、完成切换、删除、搜索、状态筛选和每页 10 条分页。正在提交时禁用重复操作；写入失败恢复列表快照，刷新失败提供重试。新的列表请求取消旧请求，并校验请求序号，避免过期结果覆盖页面。数据仅保留至服务进程结束，刷新页面不会清空，重启会清空。

GET `/api/todos` 仍返回数组；响应头 `X-Total-Count` 表示筛选后、分页前的总数。

| 参数 | 契约 |
| --- | --- |
| q | 可选，去除首尾空格，最长 120 码元，标题不区分大小写包含匹配 |
| status | all（默认）、active、completed |
| offset | 默认 0，规范十进制非负安全整数 |
| limit | 省略时不限制条数，显式传入范围 1–100 |

重复的已知参数和非法参数值返回 400，未知参数忽略以保留旧行为。越界 offset 返回空数组。GET `/api/todos/:id` 返回单项，缺失返回 404。

```bash
curl 'http://localhost:3000/api/todos?q=study&status=active&limit=10&offset=0' -i
curl 'http://localhost:3000/api/todos/1'
curl 'http://localhost:3000/api/todos' -H 'Content-Type: application/json' -d '{"title":"Study scriptc"}'
```

新增接口的开发流程：先在 TodoService 添加规则与领域测试，再在 controller.ts 内部解析外部输入、转换结果并声明 HTTP 映射。业务通过 Controller 的 mapException 声明领域错误映射，framework 负责捕获并应用映射；框架自动记录请求完成日志。日志不记录 body、query 或凭证。

查询目前在内存快照上扫描，适合示例规模；持久化或大数据量场景需要仓储查询接口。本轮不修改 core API，也不把 Todo 参数规则放进框架。

## 请求日志

默认输出`[BackTS]` 前缀、本地时间（`HH:mm:ss`）、级别、上下文和消息；请求消息按方法、路径、状态、耗时排列，对齐常见长度的字段。正常响应省略 outcome，提前断连显示 CLOSED；不足一毫秒显示 `<1 ms`，这是现有毫秒计时精度，不是更精密的测量。长路径完整保留，不截断。

终端输出按状态码着色：2xx 绿色、3xx 青色、4xx 黄色、5xx 红色；断连使用黄色。输出重定向到文件或管道时不包含 ANSI 颜色；设置 `NO_COLOR=1` 也可关闭颜色。

```bash
pnpm --filter @backts/example-todo start
LOG_FORMAT=json pnpm --filter @backts/example-todo start
NO_COLOR=1 pnpm --filter @backts/example-todo start
```

`LOG_FORMAT=json` 将请求、启动、关闭及内部错误统一输出为结构化事件。请求完成信息位于 `request` 字段。warn/error 输出到 stderr，其他级别输出到 stdout。同一错误请求可能各产生一条错误事件和完成事件。默认不记录 body、query 或原始异常，终端控制字符替换为问号。

日志由 core 默认提供，示例无需注册日志回调。关闭或自定义方式见 [core 文档](../../packages/core/README.md#日志配置)。

pretty 日志示例（终端自动着色）：

```text
[BackTS]  15:42:08  INFO   [Application] Listening on http://localhost:3000
[BackTS]  15:42:09  INFO   [HTTP]        GET     /api/todos                   → 200     1 ms
[BackTS]  15:42:10  WARN   [HTTP]        GET     /missing                     → 404     2 ms
```

框架标识为青色，时间和耗时为暗灰，上下文为黄色；INFO 绿色、WARN 黄色、ERROR 红色。`Application` 表示服务生命周期，`HTTP` 表示请求完成，`Exception` 表示请求错误或内部错误。耗时表示当前请求的耗时；JSON 和自定义出口保留原有事件结构。

启动监听成功后，框架默认列出完整 API 路径（包括 `:id` 参数）及静态资源挂载前缀。main.ts 无需额外装配。使用 `createApplication({ module: AppModule, http: { logger: { routes: false } } })` 只关闭该清单，或通过 `logger.write` 自定义 `routeMapped` / `staticMounted` 事件的输出，详见 [core 日志配置](../../packages/core/README.md#启动路由清单)。
