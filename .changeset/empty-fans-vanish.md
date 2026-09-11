---
"@backts/cli": patch
"create-backts": patch
---

修复全新 workspace 安装时命令入口尚未构建导致 backts 链接缺失的问题；CLI 和创建入口改用随源码及发布包提供的稳定启动文件。
