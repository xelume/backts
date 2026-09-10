import { createApplication, type ModuleScope } from "@backts/framework";

let created = 0;
let started = 0;
let closed = 0;
const retained: ModuleScope[] = [];
const app = createApplication({ http: { logger: false }, module: { name: "AppModule", prefix: "/", configure: (scope) => {
  retained.push(scope);
  scope.manage({ name: "resource", start: async (): Promise<void> => { started += 1; }, close: async (): Promise<void> => { closed += 1; } });
  scope.controller(() => { created += 1; return { value: "plain object" }; }, (routes, controller) => {
    routes.get("/health", async (context) => { context.json(200, JSON.stringify(controller)); });
  });
} } });
await app.listen(Number(process.argv[2]!));
let rejected = false;
try { retained[0]!.controller(() => { created += 1; return 1; }, () => {}); } catch { rejected = true; }
if (!rejected || created !== 1 || started !== 1) throw new Error("Framework factory lifecycle violated");
await app.close();
if (closed !== 1) throw new Error("Framework resource cleanup violated");
let failure = false;
try {
  createApplication({ module: { name: "AppModule", prefix: "/", configure: (scope) => {
    scope.controller((): number => { throw new Error("Factory failed"); }, () => { throw new Error("Binding must not run"); });
  } } });
} catch (error) { failure = error instanceof Error && error.message === "Factory failed"; }
if (!failure) throw new Error("Factory error lost");
console.log("PASS framework composition");
