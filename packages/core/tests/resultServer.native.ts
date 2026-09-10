import { createHttpApp, resultHandler, type ResultTransform } from "@backts/core";

interface Value { value: string; }
const events: string[] = [];
const app = createHttpApp({ onError: async (_error, context) => { events.push(`error:${context.path}`); } });
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/events", async (context) => { context.json(200, JSON.stringify(events)); });
app.use(async (context, next) => {
  if (context.path === "/api/value/a") events.push("before");
  await next();
  if (context.path === "/api/value/a") events.push("after");
});
const transforms: ResultTransform<Value>[] = [async (value, context) => {
  if (context.responded) throw new Error("Already sent");
  if (context.path === "/api/value/a") events.push("transform1");
  context.header("x-transformed", "yes");
  return { value: `${value.value}1` };
}, async (value, context) => {
  if (context.path === "/api/value/a") events.push("transform2");
  return { value: `${value.value}2` };
}];
const options = { status: 201, serialize: (value: Value): string => JSON.stringify(value), transforms };
const handler = resultHandler(async (context): Promise<Value> => {
  if (context.path === "/api/value/a") events.push("handle");
  await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
  return { value: context.param("id") };
}, options);
options.status = 202;
options.serialize = () => { throw new Error("Mutated serializer"); };
transforms.splice(0, transforms.length);
const group = app.group("/api");
group.get("/value/:id", handler);
group.head("/value/:id", handler);
app.get("/short", handler, [async (context) => { context.json(401, "{}"); }]);
app.get("/handle-error", resultHandler(async (): Promise<Value> => { throw new Error("private"); }, {
  status: 200, serialize: (value) => JSON.stringify(value),
}));
app.get("/transform-error", resultHandler(async (): Promise<Value> => ({ value: "original" }), {
  status: 200, serialize: (value) => JSON.stringify(value),
  transforms: [async (): Promise<Value> => { throw new Error("private"); }],
}));
app.get("/serialize-error", resultHandler(async (): Promise<Value> => ({ value: "original" }), {
  status: 200, serialize: () => { throw new Error("private"); },
}));
app.get("/recover", resultHandler(async (): Promise<Value> => ({ value: "original" }), {
  status: 200, serialize: () => { throw new Error("private"); },
}), [async (context, next) => { try { await next(); } catch { context.json(422, '{"recovered":true}'); } }]);
app.get("/double", resultHandler(async (context): Promise<Value> => {
  context.json(202, '{"first":true}');
  return { value: "second" };
}, { status: 200, serialize: () => { events.push("unexpected serialize"); return "{}"; } }));
app.get("/transform-double", resultHandler(async (): Promise<Value> => ({ value: "original" }), {
  status: 200, serialize: () => { events.push("unexpected serialize"); return "{}"; },
  transforms: [async (value, context) => { context.noContent(); return value; }],
}));
for (const status of [199, 204, 205, 304, 600, 200.5, NaN]) {
  let rejected = false;
  try { resultHandler(async (): Promise<Value> => ({ value: "invalid" }), { status, serialize: (value) => JSON.stringify(value) }); }
  catch { rejected = true; }
  if (!rejected) throw new Error("Invalid result status accepted");
}
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
