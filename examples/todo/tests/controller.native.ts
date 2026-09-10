import { createApplication, defineModule, defineController, jsonRoute, noContentRoute, type JsonRouteOptions, type ControllerOptions } from "@backts/framework";
import { HttpError, type HttpContext } from "@backts/core";

class InputError extends Error {}
class Controller {
  constructor(private label: string) {}
  async value(context: HttpContext): Promise<{ label: string; id: string }> {
    return { label: this.label, id: context.param("id") };
  }
}
const events: string[] = [];
const routeOptions: JsonRouteOptions<Controller, { label: string; id: string }> = {
  method: "GET", path: "/value/:id", status: 201,
  action: (controller, context) => controller.value(context),
  middleware: [async (context, next) => { context.header("x-route", "yes"); await next(); }],
  transforms: [async (value, _context) => ({ label: value.label, id: `${value.id}!` })],
};
const options: ControllerOptions<Controller> = {
  interceptors: [async (context, next) => { events.push(`before:${context.path}`); await next(); events.push(`after:${context.path}`); }],
  routes: [
    jsonRoute(routeOptions),
    jsonRoute({ method: "HEAD", path: "/value/:id", action: (controller: Controller, context) => controller.value(context) }),
    jsonRoute({ method: "GET", path: "/array", action: async (_controller: Controller, _context): Promise<number[]> => [1, 2] }),
    jsonRoute({ method: "GET", path: "/scalar", action: async (_controller: Controller, _context): Promise<string> => "hello" }),
    jsonRoute({ method: "GET", path: "/mapped", action: async (_controller: Controller, _context): Promise<string> => { throw new InputError("invalid"); } }),
    jsonRoute({ method: "GET", path: "/unknown", action: async (_controller: Controller, _context): Promise<string> => { throw new Error("private"); } }),
    jsonRoute({ method: "GET", path: "/http", action: async (_controller: Controller, _context): Promise<string> => { throw new HttpError(409, "conflict"); } }),
    jsonRoute({ method: "GET", path: "/short", action: async (_controller: Controller, _context): Promise<string> => { throw new Error("Short circuit failed"); }, middleware: [async (context, _next) => { context.noContent(); }] }),
    noContentRoute({ method: "DELETE", path: "/empty", action: async (_controller: Controller, _context): Promise<void> => {} }),
    noContentRoute({ method: "DELETE", path: "/mapped", action: async (_controller: Controller, _context): Promise<void> => { throw new InputError("invalid"); } }),
    noContentRoute({ method: "DELETE", path: "/double", action: async (_controller: Controller, context): Promise<void> => { context.json(202, '{"first":true}'); } }),
  ],
  mapException: (error) => error instanceof InputError ? new HttpError(422, error.message) : undefined,
};
const declaration = defineController(options);
routeOptions.path = "/mutated";
routeOptions.status = 202;
routeOptions.middleware!.splice(0);
routeOptions.transforms!.splice(0);
options.interceptors!.splice(0);
routeOptions.action = async (_controller, _context) => ({ label: "mutated", id: "mutated" });
options.routes.splice(0);
options.mapException = (_error) => new HttpError(418, "mutated");
const app = createApplication({ http: { logger: false, onError: async (_error, context) => { events.push(context.path); } }, module: defineModule({ name: "AppModule", imports: [
  defineModule({ name: "First", prefix: "/first", configure: (scope) => { scope.controller(() => new Controller("first"), declaration); } }),
  defineModule({ name: "Second", prefix: "/second", configure: (scope) => { scope.controller(() => new Controller("second"), declaration); } }),
] }) });
for (const status of [199, 204, 205, 304, 600, 200.5]) {
  let rejected = false;
  try { defineController<Controller>({ routes: [jsonRoute({ method: "GET", path: `/invalid/${status}`, status, action: (controller: Controller, context) => controller.value(context) })] })(app.group("/"), new Controller("invalid")); }
  catch { rejected = true; }
  if (!rejected) throw new Error("Invalid JSON status accepted");
}
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/events", async (context) => { context.json(200, JSON.stringify(events)); });
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
