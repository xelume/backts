import { Application } from "@backts/core";

const app = new Application();
let active = false;
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/state", async (context) => { context.json(200, JSON.stringify({ active })); });
app.get("/slow", async (context) => {
  active = true;
  await new Promise<void>((resolve) => { setTimeout(resolve, 500); });
  context.json(200, JSON.stringify({ data: "payload".repeat(150_000) }));
});
app.post("/close", async (context) => {
  context.noContent();
  setTimeout(() => {
    const closing = app.close();
    if (closing !== app.close()) throw new Error("Close must share completion");
    void closing;
  }, 20);
});
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
