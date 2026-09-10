import { createApplication, defineModule, factoryProvider, valueProvider, overrideFactory, provideController, type ApplicationModule, type ProviderResolver, type Provider } from "@backts/framework";

function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }
function fails(module: ApplicationModule, text: string): void {
  let message = "";
  try { createApplication({ module }); }
  catch (error) { message = error instanceof Error ? error.message : "unknown"; }
  assert(message.includes(text), `Expected ${text}, got ${message}`);
}
let created = 0;
class Service { constructor(public id: number) {} }
const retained: ProviderResolver[] = [];
const service = factoryProvider("Service", (resolve) => { retained.push(resolve); return new Service(++created); });
const values: number[] = [];
const module = defineModule({ name: "AppModule", providers: [service], controllers: [
  provideController((resolve) => resolve.get(service), (_routes, value) => { values.push(value.id); }),
  provideController((resolve) => resolve.get(service), (_routes, value) => { values.push(value.id); }),
] });
createApplication({ module });
createApplication({ module });
assert(values.join(",") === "1,1,2,2", "Provider application scope or reuse failed");
let late = false;
try { retained[0]!.get(service); } catch { late = true; }
assert(late, "Resolver survived assembly");
createApplication({ module, overrides: [valueProvider(service, new Service(99))] });
createApplication({ module, overrides: [overrideFactory(service, (_resolve) => new Service(100))] });
assert(values.join(",") === "1,1,2,2,99,99,100,100", "Provider overrides failed");
createApplication({ module });
assert(created === 3, "Overrides changed original declaration");
const absent = factoryProvider("Absent", (_resolve) => 1);
fails(defineModule({ name: "Missing", controllers: [provideController((resolve) => resolve.get(absent), (_routes, _value) => {})] }), "Missing provider: Missing -> Absent");
fails(defineModule({ name: "Duplicate", providers: [service, service] }), "Duplicate provider");
const sameName = factoryProvider("Service", (_resolve) => new Service(5));
fails(defineModule({ name: "Names", providers: [service, sameName] }), "Duplicate provider");
const left: Provider<number> = factoryProvider<number>("Left", (resolve): number => resolve.get(right));
const right: Provider<number> = factoryProvider<number>("Right", (resolve): number => resolve.get(left));
fails(defineModule({ name: "Cycle", providers: [left, right] }), "Circular provider dependency: Cycle.Left -> Cycle.Right -> Cycle.Left");
const source = defineModule({ name: "Source", providers: [service], exports: [service] });
const relay = defineModule({ name: "Relay", imports: [source], exports: [service] });
createApplication({ module: defineModule({ name: "Consumer", imports: [relay], controllers: [provideController((resolve) => resolve.get(service), (_routes, value) => { assert(value.id === 4, "Export reuse failed"); })] }) });
fails(defineModule({ name: "PrivateConsumer", imports: [defineModule({ name: "Private", providers: [service] })], controllers: [provideController((resolve) => resolve.get(service), (_routes, _value) => {})] }), "Missing provider");
fails(defineModule({ name: "BadExport", exports: [service] }), "Missing provider");
fails(defineModule({ name: "DuplicateExport", providers: [service], exports: [service, service] }), "Duplicate provider export");
fails(defineModule({ name: "Ambiguous", imports: [
  defineModule({ name: "One", providers: [service], exports: [service] }),
  defineModule({ name: "Two", providers: [service], exports: [service] }),
], controllers: [provideController((resolve) => resolve.get(service), (_routes, _value) => {})] }), "Ambiguous provider");
for (const overrides of [[valueProvider(absent, 3)], [valueProvider(service, new Service(1)), valueProvider(service, new Service(2))]]) {
  let rejected = false;
  try { createApplication({ module, overrides }); } catch { rejected = true; }
  assert(rejected, "Invalid overrides accepted");
}
let failing = true;
const retry = factoryProvider("Retry", (_resolve) => { if (failing) throw new Error("factory failed"); return 7; });
fails(defineModule({ name: "Failure", providers: [retry] }), "factory failed");
failing = false;
createApplication({ module: defineModule({ name: "Retry", providers: [retry], controllers: [provideController((resolve) => resolve.get(retry), (_routes, value) => { assert(value === 7, "Failed assembly poisoned cache"); })] }) });
const events: string[] = [];
const base = factoryProvider("Base", (_resolve) => "base", {
  start: async (value): Promise<void> => { events.push(`start:${value}`); },
  close: async (value): Promise<void> => { events.push(`close:${value}`); },
});
const dependent = factoryProvider("Dependent", (resolve) => `${resolve.get(base)}:dependent`, {
  start: async (value): Promise<void> => { events.push(`start:${value}`); },
  close: async (value): Promise<void> => { events.push(`close:${value}`); },
});
const app = createApplication({ http: { logger: false }, module: defineModule({ name: "Resources", providers: [dependent, base] }) });
await app.listen(Number(process.argv[2]!));
await app.close();
assert(events.join(",") === "start:base,start:base:dependent,close:base:dependent,close:base", "Provider lifecycle ordering failed");
const rollbackEvents: string[] = [];
const failingResource = factoryProvider("FailingResource", (_resolve) => 1, {
  start: async (_value): Promise<void> => { rollbackEvents.push("start"); throw new Error("resource failed"); },
  close: async (_value): Promise<void> => { rollbackEvents.push("close"); },
});
const rollbackApp = createApplication({ http: { logger: false }, module: defineModule({ name: "Rollback", providers: [failingResource] }) });
let startupFailed = false;
try { await rollbackApp.listen(Number(process.argv[2]!)); } catch { startupFailed = true; }
await rollbackApp.close();
assert(startupFailed && rollbackEvents.join(",") === "start,close", "Provider startup rollback failed");
console.log("PASS provider contracts");
