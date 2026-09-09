import { Application } from "@backts/core";

const port = Number(process.argv[2]!);
const survivor = new Application();
// 框架关闭时不得移除其他组件注册的监听器。
process.on("SIGTERM", () => { void survivor.close(); });

const managed = new Application();
await managed.run({ host: "127.0.0.1", port });
const closing = managed.close();
if (closing !== managed.close()) throw new Error("Repeated close changed completion");
await closing;

// 留下一个未托管的服务：SIGINT 应恢复默认退出行为，证明旧 run 监听器已移除。
survivor.get("/health", async (context) => { context.json(200, "{}"); });
await survivor.listen({ host: "127.0.0.1", port });
