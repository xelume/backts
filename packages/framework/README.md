# @backts/framework

可选的应用框架，依赖 @backts/core 公开入口。提供具名模块树、函数式接口和依赖装配；HTTP、结果处理、日志及资源生命周期仍由 core 拥有。

```ts
import { createApplication, defineModule, controller, get } from '@backts/framework';

const HelloModule = defineModule({
  name: 'HelloModule',
  controllers: [controller({
    routes: [get('', () => ({ message: 'Hello BackTS' }))],
  })],
});
const app = createApplication({ module: HelloModule });
await app.run(3000);
```

简单接口直接返回业务结果，不要求 Controller/Service 类、转调 action、async 或未使用的 HttpContext 参数。有独立业务规则时保留 Service，使用控制器装配回调获取依赖：

```ts
const repository = factoryProvider('TodoRepository', () => createRepository());
const service = factoryProvider('TodoService', resolve => new TodoService(resolve.get(repository)));
const TodoModule = defineModule({
  name: 'TodoModule',
  prefix: '/todos',
  providers: [repository, service],
  controllers: [controller((resolve): RoutesOptions => {
    const todos = resolve.get(service);
    return { routes: [get('/:id', context => todos.get(Number(context.param('id'))))] };
  })],
});
```

上例还需从 `@backts/framework` 导入 `factoryProvider` 和类型 `RoutesOptions`，并提供应用自己的仓储和 Service。框架负责依赖解析、实例复用和隔离；业务决定依赖关系与输入校验。完整用法见 examples/todo 和 CLI framework 模板。

## 模块契约

- ApplicationModule 的 name 必填，非空且无首尾空白，应用内区分大小写且唯一；prefix 默认 /，沿 imports 嵌套；同名的两个不同模块也会报错。
- imports 保留嵌套路由作用域，并使被导入模块的 exports 可见。父模块中间件传给子模块，不影响兄弟模块。
- defineModule 复制直接字段和数组；createApplication 在执行任何 configure/工厂之前快照整个图，检查名称、前缀、重复身份和循环引用。
- 同一模块对象在一个应用里重复出现（包括菱形依赖）会报错，不做静默去重。若有意挂载两个实例，创建两个具有不同名称的模块；需要共享仓储时显式传入同一实例。不同应用可复用同一模块定义。
- 预检后先注册并初始化 providers，依赖按需递归解析；随后按父模块优先、imports 顺序装配 controllers，再执行该模块 configure。工厂和 configure 必须同步，外部资源在生命周期 start 获取。
- imports 预检错误包含导入路径；路由冲突和工厂错误沿现有注册路径抛出，不提供路由或任意业务副作用回滚。
- 注册在 core 启动时冻结，保留 ModuleScope 也不能在启动后调用 Controller 工厂。子模块统一通过 imports 声明，移除了命令式 scope.mount。

当前 scriptc 的可选函数记录字段要求回调参数形状匹配：即使不用作用域，也写 configure: (_scope) => { ... }，不要省略参数。纯分组模块可完全省略 configure。

应用级中间件在 main 中通过 `app.use(middleware)` 注册，覆盖静态文件和未匹配路由，按调用顺序执行，启动后禁止注册。AppModule 组合子模块；健康检查路由由独立 HealthModule 拥有。模块声明中的 middleware 仍只作用于该模块及子模块的路由。

## Providers 与模块可见性

factoryProvider(name, create, lifecycle?) 同时返回默认绑定和类型化 token。工厂通过 resolve.get(token) 显式请求依赖；框架负责解析顺序、循环诊断和实例复用，不反射构造参数。

- 同一个模块绑定在每个应用中创建一次，多次注入复用实例；相同 token 在不同模块分别注册时分别创建。不同应用的工厂实例互相隔离。
- token 按声明身份区分，不按名称跨模块查找。同一模块重复 token 或重复名称报错。
- 仅可见本模块 providers 和直接 imports 的 exports，父模块依赖不自动下传。本地注册优先；多个导入来源公开同一 token 时拒绝歧义。
- exports 可以公开本地绑定或再导出可见 token，不能导出未知依赖。
- 缺失依赖、依赖循环和工厂错误在 createApplication 时抛出。依赖由实际 get 调用确定，不承诺在所有工厂执行前发现错误；工厂不得获取外部资源或产生不可回滚副作用。
- resolver 仅在同步装配期间有效，不能保存后在请求或资源 start 中查询。临时类型化缓存无论装配成功失败都会清空，实例由消费者或资源闭包持有。

测试可使用 `createApplication({ module: AppModule, overrides: [valueProvider(token, fake)] })`，无需重新装配 Controller。也可用 `overrideFactory(token, resolve => replacement)`。

valueProvider 与 overrideFactory 可用于模块 providers 或应用 overrides。应用 override 替换该 token 的所有已注册绑定，未知 token 和重复 override 报错。覆盖不会修改原声明，也不继承默认工厂的资源钩子。现成值不会复制，跨应用传同一可变对象代表显式共享。

## 资源与生命周期

factoryProvider 的第三个参数可提供 `{ start: value => Promise<void>, close: value => Promise<void> }`。框架委托 core.manage，按依赖解析顺序启动、逆序释放；启动失败回滚已尝试启动的资源，关闭先排空 HTTP。也可在工厂中使用 resolve.manage。工厂本身只装配对象。

未开始监听时，core 不执行资源 start/close。当前不提供请求级或 transient scope、异步工厂解析及运行期 service locator。

scope.controller(create, bind) 每次调用工厂一次；是否共享实例由工厂闭包决定，没有隐式单例缓存、请求作用域或自动注入。不要在共享 Controller 保存可变请求身份。scope.manage(resource) 委托 core，资源名称在整个应用唯一；按装配注册顺序启动、逆序关闭，详见 core 生命周期文档。

## Controller 声明

默认使用 `controller({ routes })`，声明可直接放进模块的 controllers 数组。需要依赖时使用 `controller(resolve => ({ routes }))`，装配回调每次应用/模块注册执行一次，处理器通过闭包持有解析后的依赖。不要在请求时调用 resolve，也不要在静态声明中捕获需要按应用隔离的可变业务状态。

- `get / post / put / patch / del / head / options` 均使用 `(path, handle, options?)`，直接表达 HTTP 方法；自定义方法仍可使用 `json(method, path, handle, options?)`。处理器接受 HttpContext，可省略未使用的参数，支持同步或异步返回，普通处理器的结果类型自动推导。options 包括 status、transforms 和 middleware；transforms 接收异步结果解析后的类型。
- 方法入口无显式 status 时，有返回数据发送 JSON 200，无返回值或 undefined 发送 204。null、false、0 和空字符串都是数据。同步和异步处理器遵循同一规则。
- 显式 status 优先；204 忽略返回值且禁止 transforms。无返回值也可显式发送 201 等空响应，不添加 JSON Content-Type。205/304 等无正文状态仅适用于空结果适配，不接受 JSON 数据。
- head 显式声明 HEAD 路由，core 抑制响应体；options 不自动设置 Allow 或 CORS 策略。
- controller 支持 mapException 和 interceptors。静态配置在声明时快照，装配回调返回的配置在装配时快照。
- 处理器可以设置响应头，不能自行发送响应。异常或异步拒绝经过相同错误边界。空结果不支持 transforms；已有数据的转换器若返回 undefined，则发送空响应。
- 已删除新增的顶层 noContent 导出；业务统一使用 HTTP 方法入口。底层 HttpContext.noContent() 负责发送 204。

scriptc 0.0.36 的纯 void 泛型限制由 CLI 按框架函数身份与处理器类型适配到 `@backts/framework/native` 子路径，业务无需返回占位值或指定 204。该子路径服务于编译器，不是业务路由入口。内联控制器装配回调仍需标注 `: RoutesOptions`，异步处理器带类型化 transforms 时仍需显式完整返回类型（如 `post<Promise<Message>>`）。

```ts
import { del } from '@backts/framework';

// 无返回值，自动 204。
del('/:id', context => { service.remove(Number(context.param('id'))); });
// 返回业务结果，自动 JSON 200。
del('/:id', context => service.remove(Number(context.param('id'))));
```

### 类控制器声明

需要类实例的应用可使用返回值 Controller，framework 注册路由、绑定实例、发送响应并执行异常映射：

```ts
import { defineController, jsonRoute } from '@backts/framework';

const todoController = defineController<TodoController>({
  routes: [
    jsonRoute({ method: 'GET', path: '/:id', action: (controller: TodoController, context) => controller.get(context) }),
    jsonRoute({ method: 'POST', path: '', status: 201, action: (controller: TodoController, context) => controller.create(context) }),
  ],
  mapException: (error) => error instanceof TodoInputError ? new HttpError(400, error.message) : undefined,
});

// 放入模块的 controllers 数组：
provideController((resolve) => new TodoController(resolve.get(service)), todoController);
```

- jsonRoute 保留每条接口的结果类型并自动 JSON.stringify，默认状态 200，创建接口显式使用 201。返回对象、数组或 JSON 标量；不支持 undefined、函数、循环对象和流。业务无需传入序列化器。
- jsonRoute.transforms 在 action 成功后、序列化前依次转换同一结果类型，可异步，不能发送响应。JSON 状态校验与响应发送复用 core.resultHandler，204/205/304 不能用作 JSON 状态。HEAD 保持 core 的显式路由规则，不自动生成。
- mapException 仅处理 Error 实例，返回 HttpError 或 undefined；undefined 保留原异常，非 Error 抛出值直接传播。未知错误由 core 隐藏为 500，HttpError 保持原状态。映射器自己抛错也交给 core。
- Controller 的 interceptors 复用 core Middleware：顺序进入、await next 后逆序返回，可短路或用 try/finally 清理。异常边界先于 interceptors 和接口 middleware 进入，包围它们及 action；只作用于该 Controller 的接口。没有匹配路由、模块外中间件、404/405 不经过它。
- jsonRoute 复制配置与中间件数组，defineController 快照注册器与映射函数；后续修改原始声明不影响绑定。同一声明可用于多个独立实例，无实例缓存。
- scriptc 0.0.36 不支持按字符串读取实例方法、Function.call 或绑定方法引用。因此 action 使用有类型的直接调用回调；不使用 any、动态引擎或反射。异构结果通过每个 jsonRoute 的泛型实例化保持静态类型。

高级直接响应仍可使用原有 bindControllerRoutes<T>([{ method, path, handle, middleware? }]) 或绑定函数，适用于自定义响应适配。函数式 controller 是框架模板的默认方式。

## 开发约束

当前不承担旧版本兼容要求。API 替换时同步迁移消费者并删除旧入口。

当前提供显式 token 与同步工厂解析，不提供装饰器或反射注入。源码以 TypeScript 分发，通过 CLI 编译为原生程序。
