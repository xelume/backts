---
"@backts/cli": patch
"create-backts": patch
---

为原生测试构建和分析增加受控并发及 --jobs 参数，默认最多两个任务；失败后停止派发并等待在途编译结束。
