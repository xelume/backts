# 装饰器原生兼容实验

本目录是手动编译探针，不属于自动通过的原生测试入口。使用当前项目锁定的 CLI/scriptc，不修改编译器或启用动态引擎。

```sh
pnpm exec backts analyze --entry experiments/decorators/classDecorator.ts
pnpm exec backts build --entry experiments/decorators/classDecorator.ts --out .scriptc/classDecorator
./.scriptc/classDecorator
pnpm exec backts analyze --entry experiments/decorators/methodDecorator.ts
```

2026-09-10，scriptc 0.0.36：简单类装饰器静态分析和构建成功，运行输出 PASS class decorator；简单方法装饰器静态分析失败，SC1090 明确指出 method decorators 没有 static lowering。方法探针只验证注册副作用，不依赖 Reflect、参数装饰器、RxJS 或方法替换。

这只证明两个最小场景，不代表完整 NestJS 装饰器/反射兼容。当前 framework 不公开 @Module/@Controller/@Get：只支持类装饰器不能实现一致的路由声明体验。保留 defineModule + imports 和 bindControllerRoutes 作为可直接编译的正式 API。

升级 scriptc 后先运行探针；方法装饰器通过后再验证实例绑定、参数/返回值、执行顺序、异常、继承与多个应用隔离。未来装饰器应产生现有模块/路由描述，复用同一 core。若仍不支持，CLI 编译期转换是另一个工程项目，需要独立评估诊断、源码映射和构建缓存，不在这次变更中实现。
