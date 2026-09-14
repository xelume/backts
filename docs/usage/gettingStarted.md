# 环境要求与仓库示例

独立应用使用者准备环境后，直接阅读[创建应用](createApplication.md)，无需取得本仓库。贡献者可继续运行下方的 Todo 示例。

当前已验证 macOS ARM64；Windows 原生开发命令拒绝执行，其他 Unix 平台尚需验证。

## 环境要求

运行本仓库示例需准备以下环境。通过创建器开发独立应用时可选择 npm 或 pnpm，无需统一使用仓库指定的 pnpm 版本：

| 项目 | 要求 |
| --- | --- |
| Node.js | 24+，运行构建工具和测试 |
| pnpm | 10.33.4，运行本仓库时与根 package.json 的 packageManager 保持一致 |
| scriptc | 0.1.1，由 CLI 固定依赖并自动安装，无需单独安装 |
| TypeScript | 7.0.2，由 CLI 和项目依赖安装，无需全局安装 |
| 本机编译环境 | clang 与平台 SDK |

CLI 使用 TypeScript 的不稳定解析接口，并针对上述 scriptc 版本处理原生编译兼容性。保留项目声明的工具链依赖，不要将其视为可任意替换的版本。

## 运行仓库示例

先取得仓库源码并进入 `backts/` 根目录。按 [CLI 私库配置](cli.md#私有-npm-仓库配置)准备所需访问权限，然后安装、构建、启动 Todo：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm start
```

浏览器访问 `http://localhost:3000/`。该页面支持 Todo 创建、更新、删除、过滤和分页；数据保存在进程内存中，重启后清空。

指定端口：

```bash
pnpm start 3100
```

## 验证接口

用另一个终端验证接口。健康检查应返回 200 和 `{"status":"ok"}`；新进程列表为空数组，创建成功返回 201 和包含 id、title、completed 的 Todo：

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/api/todos
curl -i -X POST http://localhost:3000/api/todos \
  -H 'Content-Type: application/json' \
  --data '{"title":"Read the guide"}'
curl -i 'http://localhost:3000/api/todos?status=active&limit=10&offset=0'
```

## 修改代码后重启

`pnpm start` 只运行已构建的二进制。开发时运行 `pnpm --filter @backts/example-todo dev`，修改 TypeScript 后先编译，成功才替换旧服务；失败时旧服务继续运行。开发替换最多等待旧服务 1 秒。Ctrl+C 关闭开发进程及其子进程；详见 [CLI](cli.md)。

## 相关文档

- [创建自己的应用](createApplication.md)
- [启动异常排查](troubleshooting.md)

