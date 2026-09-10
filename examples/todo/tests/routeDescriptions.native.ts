import { createApplication, defineModule, bindControllerRoutes, type ControllerRoute } from "@backts/framework";
import { HttpError, type HttpContext } from "@backts/core";

class Controller {
  constructor(private label: string) {}
  async get(context: HttpContext): Promise<void> { context.json(200, JSON.stringify({ label: this.label, id: context.param("id") })); }
}
const definitions: ControllerRoute<Controller>[] = [
  { method: "get", path: "/:id", handle: (controller, context) => controller.get(context), middleware: [async (context, next) => { context.header("x-route", "yes"); await next(); }] },
  { method: "HEAD", path: "/:id", handle: (controller, context) => controller.get(context) },
  { method: "GET", path: "/error", handle: async (): Promise<void> => { throw new HttpError(422, "Expected"); } },
  { method: "GET", path: "/short", handle: async (): Promise<void> => { throw new Error("Short circuit failed"); }, middleware: [async (context) => { context.noContent(); }] },
];
const bind = bindControllerRoutes(definitions);
definitions[0]!.path = "/changed";
definitions[0]!.handle = async (): Promise<void> => { throw new Error("Mutated handler used"); };
definitions[0]!.middleware!.splice(0, 1);
definitions.splice(1, definitions.length);
const app = createApplication({ http: { logger: false }, module: defineModule({
  name: "AppModule",
  middleware: [async (context, next) => { context.header("x-root", "yes"); await next(); }],
  imports: [defineModule({ name: "ItemsModule", prefix: "/items", configure: (scope) => {
    scope.controller(() => new Controller("first"), bind);
  } }), defineModule({ name: "OthersModule", prefix: "/others", configure: (scope) => {
    scope.controller(() => new Controller("second"), bind);
  } })],
  configure: (scope) => { scope.routes.get("/health", async (context) => { context.json(200, "{}"); }); },
}) });
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
