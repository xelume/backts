import * as routeMethods from "@backts/framework";
import { del as removeRoute } from "@backts/framework";
import { HttpError } from "@backts/core";
import { controller, createApplication, defineModule, factoryProvider, get, del, head, options as optionsRoute, post, put, patch, valueProvider, type JsonOptions, type RoutesOptions } from "@backts/framework";

class InputError extends Error {}
const events: string[] = [];
const options: JsonOptions<{ message: string }> = {
  status: 201,
  middleware: [async (context, next) => { context.header("x-route", "yes"); await next(); }],
  transforms: [async (value, _context) => ({ message: `${value.message}!` })],
};
const routes: RoutesOptions = {
  routes: [
    get("/sync", () => ({ message: "hello" }), options),
    post<Promise<{ message: string }>>("/async", async (context) => ({ message: await context.readText() }), options),
    get("/array", () => [1, 2]),
    head("/sync", () => ({ message: "hello" })),
    del("/sync", () => { events.push("sync"); }),
    del("/async", async (_context) => { events.push("async"); }),
    removeRoute("/alias", () => {}),
    routeMethods.del("/namespace", async (_context) => {}),
    del("/created-empty", () => {}, { status: 201 }),
    get("/undefined", () => undefined),
    get("/null", () => null),
    get("/false", () => false),
    get("/zero", () => 0),
    get("/maybe/:id", (context): { value: string } | undefined => context.param("id") === "empty" ? undefined : { value: "present" }),
    del("/rejected", async (_context): Promise<void> => { throw new InputError("invalid"); }),
    del("/result", () => ({ removed: true })),
    del("/accepted", () => ({ queued: true }), { status: 202 }),
    put("/replace", async (context) => ({ title: await context.readText() })),
    patch("/replace", () => ({ updated: true })),
    optionsRoute("/replace", (context) => {
      context.header("allow", "PUT, PATCH, OPTIONS");
    }),
    post("/empty", () => "discarded", { status: 204 }),
    del("/mapped", (): string => { throw new InputError("invalid"); }, { status: 204 }),
    get("/mapped", (): string => { throw new InputError("invalid"); }),
    get("/short", (): string => { throw new Error("Must not run"); }, {
      middleware: [async (context, _next) => { context.noContent(); }],
    }),
    get("/double", (context) => { context.json(202, '{"first":true}'); return "second"; }),
  ],
  mapException: (error) => error instanceof InputError ? new HttpError(422, error.message) : undefined,
  interceptors: [async (context, next) => { events.push(`before:${context.path}`); await next(); events.push(`after:${context.path}`); }],
};
const declaration = controller(routes);
routes.routes[0]!.register = (_routes, _middleware) => { throw new Error("Mutated route"); };
routes.routes.splice(0);
routes.interceptors!.splice(0);
routes.mapException = (_error) => new HttpError(418, "mutated");
options.status = 202;
options.transforms!.splice(0);
options.middleware!.splice(0);

const counter = factoryProvider("Counter", (_resolve) => ({ value: 0 }));
let assemblies = 0;
const dependencyController = controller((resolve): RoutesOptions => {
  assemblies++;
  const state = resolve.get(counter);
  return { routes: [get("", () => { state.value++; return { value: state.value }; })] };
});
const lateRegistrations: (() => void)[] = [];
const app = createApplication({
  http: { logger: false },
  module: defineModule({ name: "AppModule", controllers: [declaration, {
    configure: (resolve, scope) => { lateRegistrations.push(() => dependencyController.configure(resolve, scope)); },
  }], imports: [
    defineModule({ name: "First", prefix: "/first", providers: [counter], controllers: [dependencyController] }),
    defineModule({ name: "Second", prefix: "/second", providers: [valueProvider(counter, { value: 10 })], controllers: [dependencyController] }),
  ] }),
});
if (assemblies !== 2) throw new Error("Controller assembly must run once per module");
let factoryFailed = false;
try {
  createApplication({ module: defineModule({ name: "Broken", controllers: [controller((_resolve): RoutesOptions => { throw new Error("Factory failed"); })] }) });
} catch (error) { factoryFailed = error instanceof Error && error.message === "Factory failed"; }
if (!factoryFailed) throw new Error("Controller factory error lost");
for (const status of [199, 205, 304, 600]) {
  let rejected = false;
  try { createApplication({ module: defineModule({ name: "Invalid", controllers: [controller({ routes: [get("", () => "invalid", { status })] })] }) }); }
  catch { rejected = true; }
  if (!rejected) throw new Error("Invalid JSON status accepted");
}
let rejectedTransform = false;
try {
  del("/invalid-transform", () => "ignored", { status: 204, transforms: [async (value, _context) => value] });
} catch { rejectedTransform = true; }
if (!rejectedTransform) throw new Error("204 route accepted a response transform");
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/events", async (context) => { context.json(200, JSON.stringify(events)); });
await app.listen(Number(process.argv[2]!));
let frozen = false;
try { lateRegistrations[0]!(); } catch { frozen = true; }
if (!frozen || assemblies !== 2) throw new Error("Controller factory ran after startup");
process.on("SIGTERM", () => { void app.close(); });
