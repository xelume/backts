---
"@backts/core": patch
"@backts/framework": patch
"@backts/cli": patch
"create-backts": patch
---

统一由 CLI 构建生成项目依赖版本清单，移除模板中的手动版本维护；接入 Changesets Release PR 和经过原生构建验证的自动发布流程。
