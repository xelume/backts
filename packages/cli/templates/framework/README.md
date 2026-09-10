# __PROJECT_NAME__

Framework 模板：模块用 providers/controllers 声明依赖，framework 解析显式工厂并装配 Controller/Service，无反射或基类要求。

运行 `__PM__ run dev`；Node 24+、clang 与平台 SDK 必需。

入口使用 AppModule，imports 引入 HelloModule 和 HealthModule；接口用 defineController/jsonRoute 声明，Controller 返回数据，framework 自动发送 JSON。模块名称唯一，重复导入和循环依赖在工厂执行前失败。
