# __PROJECT_NAME__

Framework 模板：模块用 controllers 注册函数式接口，业务处理函数直接返回结果。需要依赖时使用 providers 和 controller 装配回调，无反射或基类要求。

运行 `__PM__ run dev`；Node 24+、clang 与平台 SDK 必需。

入口使用 AppModule，imports 引入 HelloModule 和 HealthModule；接口用 defineController/jsonRoute 声明，Controller 返回数据，framework 自动发送 JSON。模块名称唯一，重复导入和循环依赖在工厂执行前失败。
