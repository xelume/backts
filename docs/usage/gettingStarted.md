# 环境与运行

先运行已有 Todo 示例，确认本机工具链、HTTP 接口和页面可以正常工作。

需要已经取得本仓库，并准备 Node、pnpm 与本机编译环境。

## 环境要求

仓库锁定的工具链如下，升级时应同时验证类型检查与原生编译：

| 项目 | 当前要求或版本 |
| --- | --- |
| Node.js | 24+，运行构建工具和测试 |
| pnpm | 10.33.4 |
| scriptc | 0.0.36 |
| TypeScript | 7.0.2 |
| 本机编译环境 | clang 与平台 SDK |

## 安装与启动

安装、构建、启动已有 Todo 示例：

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

用另一个终端验证接口：

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

