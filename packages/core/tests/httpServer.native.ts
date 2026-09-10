import { createHttpApp } from "@backts/core";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const app = createHttpApp();
app.get("/inspect", async (context) => {
  context.json(200, JSON.stringify({ url: context.url, tags: context.queryAll("tag"), empty: context.query("empty"), missing: context.query("missing") === undefined, type: context.requestHeader("CONTENT-TYPE") }));
});
app.put("/text", async (context) => { context.json(200, JSON.stringify({ text: await context.readText() })); });
app.post("/bytes", async (context) => { context.bytes(200, "application/octet-stream", await context.readBytes()); });
app.post("/mixed-read", async (context) => { await context.readBytes(); await context.readText(); });
app.head("/explicit", async (context) => { context.header("x-head", "yes"); context.noContent(); });
app.options("/explicit", async (context) => { context.header("allow", "HEAD, OPTIONS"); context.noContent(); });
app.route("put", "/custom", async (context) => { context.noContent(); });
// import("not-a-real-dependency") must remain an ordinary comment.
const importExample = 'import { value } from "not-a-real-dependency"';
assert(importExample.length > 0, "Import-like strings are preserved");
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/items/:id", async (context) => { context.json(200, JSON.stringify({ id: context.param("id") })); });
app.get("/items/fixed", async (context) => { context.json(200, JSON.stringify({ fixed: true })); });
app.post("/items/:id", async (context) => { context.noContent(); });
let duplicate = false;
try { app.get("/items/:name", async (context) => { context.noContent(); }); }
catch { duplicate = true; }
assert(duplicate, "Duplicate route shape");
app.get("/error", async () => { throw new Error("secret-internal-detail"); });
app.get("/missing-response", async () => {});
app.get("/double-response", async (context) => {
  context.json(200, "{}");
  context.json(201, "{}");
});
app.post("/double-read", async (context) => {
  await context.readJson();
  await context.readJson();
});
app.get("/request/:id", async (context) => {
  await Promise.resolve();
  context.json(200, JSON.stringify({ id: context.param("id") }));
});
const port = Number(process.argv[2]!);
await app.listen({ host: "127.0.0.1", port });
let frozen = false;
try { app.get("/late", async (context) => { context.noContent(); }); }
catch { frozen = true; }
assert(frozen, "Route registration after listen");
process.on("SIGTERM", () => {
  const closing = app.close();
  assert(closing === app.close(), "Repeated close shares completion");
});
console.log("native contracts ready");
