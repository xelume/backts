import { createHttpApp, type Middleware, type RequestCompletion } from "@backts/core";

const trace: string[] = [];
const errors: string[] = [];
const results: RequestCompletion[] = [];
const app = createHttpApp({
  maximumBodyBytes: 128,
  onError: async (error, context) => {
    errors.push(context.path);
    if (context.path === "/observer-error") throw new Error("Observer failure");
  },
  errorHandler: async (error, context) => {
    if (context.path === "/mapped") { context.json(422, '{"error":"mapped"}'); return; }
    if (context.path === "/broken-mapper") throw new Error("Mapper failure");
    if (context.path === "/empty-mapper") return;
    context.json(error.status, JSON.stringify({ error: error.message }));
  },
  onRequestComplete: async (result) => {
    if (result.path !== "/events" && result.path !== "/health") results.push(result);
    if (result.path === "/completion-error") throw new Error("Completion observer failure");
  },
});
app.use(async (context, next) => {
  context.header("x-global", "yes");
  if (context.path === "/api/nested/order") trace.push("global:before");
  await next();
  if (context.path === "/api/nested/order") trace.push("global:after");
});
const outer: Middleware = async (context, next) => {
  trace.push("group:before");
  context.header("x-group", "yes");
  await next();
  trace.push("group:after");
};
const chain: Middleware[] = [outer];
const group = app.group("/api", chain);
chain.splice(0, chain.length);
const nested = group.group("/nested", [async (context, next) => {
  trace.push("nested:before"); await next(); trace.push("nested:after");
}]);
nested.get("/order", async (context) => { trace.push("handler"); context.noContent(); }, [async (context, next) => {
  trace.push("route:before"); await next(); trace.push("route:after");
}]);
group.get("/items/:id", async (context) => { context.json(200, JSON.stringify({ id: context.param("id") })); });
group.get("/items/fixed", async (context) => { context.noContent(); });
let duplicate = false;
try { app.get("/api/items/:other", async (context) => { context.noContent(); }); }
catch { duplicate = true; }
if (!duplicate) throw new Error("Grouped routes must share duplicate detection");
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/events", async (context) => { context.json(200, JSON.stringify({ trace, errors, results })); });
app.get("/short", async () => { throw new Error("Short circuit reached handler"); }, [async (context) => { context.json(401, "{}"); }]);
app.get("/double", async (context) => { context.noContent(); }, [async (context, next) => { await next(); await next(); }]);
app.get("/not-awaited", async (context) => {
  await new Promise<void>((resolve) => { setTimeout(resolve, 30); });
  context.noContent();
}, [async (context, next) => { void next(); }]);
app.get("/mapped", async () => { throw new Error("private detail"); });
app.get("/observer-error", async () => { throw new Error("private detail"); });
app.get("/broken-mapper", async () => { throw new Error("private detail"); });
app.get("/empty-mapper", async () => { throw new Error("private detail"); });
app.get("/completion-error", async (context) => { context.noContent(); });
app.get("/abort", async (context) => {
  await new Promise<void>((resolve) => { setTimeout(resolve, 100); });
  context.noContent();
});
app.post("/body", async (context) => { context.bytes(200, "application/octet-stream", await context.readBytes()); });
app.serveStatic(process.argv[3]!, "/static");
await app.listen(Number(process.argv[2]!));
let frozen = 0;
try { app.use(async (context, next) => { await next(); }); } catch { frozen += 1; }
try { group.get("/late", async (context) => { context.noContent(); }); } catch { frozen += 1; }
if (frozen !== 2) throw new Error("Extension registration must freeze at startup");
process.on("SIGTERM", () => { void app.close(); });
