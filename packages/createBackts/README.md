# create-backts

BackTS 应用创建入口，复用 @backts/cli，不包含第二套模板或创建逻辑。

src/bin.ts 通过 tsdown 构建为 dist/bin.mjs，调用 CLI 公开 API。prepack 检查类型并构建，发布包安装后即可运行。

发布后使用：

```sh
npm create backts@latest my-api
pnpm create backts my-api --pm pnpm
```

支持 --skip-install、--yes、--pm npm|pnpm、--help、--version。
需要 Node 24+；构建和开发还需要 clang 与平台 SDK。
