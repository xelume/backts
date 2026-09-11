# 版本与发布

BackTS 对照 toolkit 使用 pnpm workspace、Changesets 3 和 GitHub Actions。四个公共包采用独立版本，根工作区和 examples 保持 private。所有包（包括无 scope 的 create-backts）发布到 https://registry.qlqs.work/。

## 开发与提交

修改发布产物后，运行：

```sh
pnpm changeset
pnpm changeset status
pnpm changeset:check
pnpm release:check
```

changeset 随代码提交，摘要描述用户能观察到的变化。patch 用于兼容修复，minor 用于兼容能力增加，major 用于不兼容变更；0.x 阶段同样按影响选择。不要手改 package.json.version 或生成的 CHANGELOG.md。

提交前必须记录所有直接受影响公共包及消费者的版本意图，并通过上述检查。只改不影响产物的文档、测试或 CI 可以省略 changeset，并在交接中说明原因。修改工具链、CLI 构建配置或生成项目的依赖属于发布行为变更，需要为 CLI 与创建入口记录版本意图。

## 模板与发布关联

CLI 构建时从各包 package.json 读取版本，从 CLI 的依赖读取 TypeScript/scriptc，从根依赖读取 @types/node，生成 dist/projectVersions.json。模板只存放源码和配置；CLI 统一生成项目 package.json，应用初始版本固定为 0.1.0。直接依赖固定到随 CLI 发布的组合，完整依赖树由应用 lockfile 固定，创建项目时不查询 latest。

- core 更新：发布计划需要覆盖 framework、CLI 和 create-backts。
- framework 更新：需要覆盖 CLI 和 create-backts。
- CLI 或共享工具链更新：需要覆盖 create-backts。
- create-backts 自身可单独更新。

源码中保留 workspace:*，pnpm 打包时转换为精确版本。Changesets 负责真实依赖的版本联动；changeset:check 另外检查模板消费者是否在有效发布计划中。CLI 不为记录模板版本而依赖 core/framework 的运行时代码。版本计划不要求各包版本号相同，也不自动替开发者选择变更级别。

version-packages 会先检查这些关联，再执行 changeset version；Release PR 使用该命令。Release PR 消费 changeset 后，构建按新版本重新生成清单，release:check 验证清单与当前包声明一致。旧 CLI 的发布清单保持不变。

## 检查与发布命令

| 命令 | 用途 |
| --- | --- |
| pnpm changeset | 创建版本意图 |
| pnpm changeset status | 查看待发布版本计划 |
| pnpm changeset:check | 校验模板消费者，无待处理 changeset 时跳过 |
| pnpm version-packages | 检查计划后生成版本和 changelog，通常仅由 Release PR 执行 |
| pnpm pack:check | 串行检查四个包的发布内容，不上传 |
| pnpm release:check | 构建、类型、静态分析、原生测试、清单一致性和打包检查，不发布 |
| pnpm release | 正式发布，仅允许 main 的 GitHub Actions 执行 |

release:check 中的打包测试会解压真实 tarball，并在仓库外通过 CLI 和创建入口生成、原生编译两个模板。它离线复用已安装的第三方依赖。测试打包时跳过重复构建；正式打包保留 CLI 和创建入口的 prepack 类型检查与构建。

## Release PR 与 GitHub Actions

changeset 合并到 main 后，Release packages 工作流创建或更新 Release PR，生成版本、内部依赖变更和 changelog。维护者检查并合并后，同一工作流运行 pnpm release。

发布脚本先查询 Changesets publish-plan。如果 registry 中存在未发布版本，运行完整 release:check，然后交给 Changesets publish 处理依赖顺序、上传和标签。没有待上传版本时跳过耗时检查，仍调用 publish 以输出 Action 发布结果并补齐标签。查询失败、计划格式异常或检查失败均阻止发布。

工作流使用 Node 24、仓库声明的 pnpm，以及 macos-15 ARM64 runner，匹配当前原生验证环境；依赖安装使用 --frozen-lockfile --ignore-scripts。不额外放开依赖构建脚本。

需要在 GitHub 配置 REGISTRY_TOKEN，授予私库发布权限。发布工作流通过 setup-node 配置 @backts 私库和对应 host 的认证，通过 NODE_AUTH_TOKEN 注入令牌。无 scope 的 create-backts 使用自身 publishConfig.registry 发布到同一私库；第三方依赖仍使用默认公共 registry。GITHUB_TOKEN 用于 Release PR、Git tag 和 GitHub Release；仓库 Actions 设置必须允许创建 PR 和写入内容。不要将真实令牌写入仓库。

CI 配置随代码交付，不代表远端 Secret 或仓库权限已配置。正式发布只经 GitHub Actions，不再使用 BACKTS_RELEASE_BASE 或逐包手工发布。

## 重试与预发布

检查失败时修复问题后重跑工作流。部分包已上传时不改动其版本；Changesets 跳过 registry 中已有版本，继续剩余发布。已发布的错误版本通过新的 changeset 修复，不覆盖或删除旧版本。

日常 main 工作流只用于正式 latest 发布。next/beta 等预发布需要另行制定分支、dist-tag 和进入/退出规则，不在当前流程中临时开启。

## 首次安装与命令入口

CLI 和 create-backts 的 package.json.bin 指向纳入 Git 和发布包的 bin.mjs，由它加载 dist/bin.mjs。安装依赖时即可创建命令链接，后续按依赖顺序构建 CLI 和示例，无需再次安装。不要把命令入口改回尚未生成的 dist 文件。

`pnpm test:bootstrap` 在临时工作区排除 node_modules、dist 和原生产物后，使用已填充的 pnpm store 离线安装、检查所有 backts 命令链接，再构建两个示例。该测试包含安装操作，本地应在获准的宿主环境执行，CI 在正常依赖安装后执行。普通发布检查另行验证 tarball 的稳定命令入口。
