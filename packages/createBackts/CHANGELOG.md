# create-backts

## 0.0.5

### Patch Changes

- a4ad987: Upgrade scriptc to 0.1.1 and preserve native build inputs for compiler cache reuse. Keep generic controller snapshots statically compilable and preserve mapped HTTP errors, including their status and object identity, across the compiler's optional-value throw boundary.
- Updated dependencies [a4ad987]
  - @backts/cli@0.0.5

## 0.0.4

### Patch Changes

- 61042a4: 修复全新 workspace 安装时命令入口尚未构建导致 backts 链接缺失的问题；CLI 和创建入口改用随源码及发布包提供的稳定启动文件。
- 697bb2f: 为原生测试构建和分析增加受控并发及 --jobs 参数，默认最多两个任务；失败后停止派发并等待在途编译结束。
- f4253d7: 统一由 CLI 构建生成项目依赖版本清单，移除模板中的手动版本维护；接入 Changesets Release PR 和经过原生构建验证的自动发布流程。
- Updated dependencies [61042a4]
- Updated dependencies [697bb2f]
- Updated dependencies [f4253d7]
  - @backts/cli@0.0.4
