# create-backts

BackTS 应用创建入口，复用 @backts/cli，不包含第二套模板或创建逻辑。

纳入源码管理的 bin.mjs 是安装时的稳定命令入口，加载 dist/bin.mjs。src/bin.ts 通过 tsdown 构建为 dist/bin.mjs，调用 CLI 公开 API。prepack 检查类型并构建，发布包安装后即可运行。

使用（先配置该私库认证；私库需提供或代理创建工具的第三方依赖）：

```sh
npm create backts@latest --registry=https://registry.qlqs.work/ -- my-api --yes
cd my-api
npm run dev
```

`create-backts` 没有 scope，下载时需显式指定 registry；生成项目中的 `@backts/*` 依赖通过 `.npmrc` 定位私库。basic 和 framework 模板均自带该配置，创建时会自动安装依赖。认证使用用户级 npm 配置或 CI secret，不要将真实 token 写入项目。需要 pnpm 时，创建参数增加 `--pm pnpm`，创建器会使用 pnpm 自动安装。

支持 --skip-install、--yes、--pm npm|pnpm、--help、--version。
需要 Node 24+；构建和开发还需要 clang 与平台 SDK。
