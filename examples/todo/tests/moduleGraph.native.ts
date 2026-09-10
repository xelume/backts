import { createApplication, defineModule, type ApplicationModule } from "@backts/framework";

function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }
let configured = 0;
function expectInvalid(module: ApplicationModule, text: string): void {
  const before = configured;
  let message = "";
  try { createApplication({ module }); }
  catch (error) { message = error instanceof Error ? error.message : "unknown"; }
  assert(message.includes(text), `Expected ${text}, got ${message}`);
  assert(configured === before, "Invalid graph executed configure");
}
const root = defineModule({ name: "Root", configure: (_scope) => { configured += 1; } });
root.imports!.push(root);
expectInvalid(root, "Circular module import: Root -> Root");
const left = defineModule({ name: "Left" });
const right = defineModule({ name: "Right", imports: [left] });
left.imports!.push(right);
expectInvalid(left, "Circular module import: Left -> Right -> Left");
const shared = defineModule({ name: "Shared" });
expectInvalid(defineModule({ name: "Root", imports: [shared, shared], configure: (_scope) => { configured += 1; } }), "Duplicate module import: Root -> Shared");
expectInvalid(defineModule({ name: "Root", imports: [
  defineModule({ name: "Left", imports: [shared] }),
  defineModule({ name: "Right", imports: [shared] }),
] }), "Duplicate module import: Root -> Right -> Shared");
expectInvalid(defineModule({ name: "Root", imports: [defineModule({ name: "Same" }), defineModule({ name: "Same" })] }), "Duplicate module name");
expectInvalid(defineModule({ name: "Root", imports: [defineModule({ name: " " })], configure: (_scope) => { configured += 1; } }), "Invalid module name");
expectInvalid(defineModule({ name: "Root", imports: [defineModule({ name: "Bad", prefix: "invalid" })], configure: (_scope) => { configured += 1; } }), "Invalid group prefix");

const order: string[] = [];
const child = defineModule({ name: "Child", configure: (_scope) => { order.push("child"); } });
const children = [child];
const snapshot = defineModule({ name: "AppModule", imports: children, configure: (_scope) => {
  order.push("root");
  child.configure = (_scope) => { throw new Error("Mutated child callback used"); };
  child.imports!.push(defineModule({ name: "Unexpected", configure: (_scope) => { throw new Error("Late import used"); } }));
} });
children.splice(0, children.length);
createApplication({ module: snapshot });
assert(order.join(",") === "root,child", "Module graph not snapshotted before configure");
let count = 0;
const reusable = defineModule({ name: "Reusable", configure: (_scope) => { count += 1; } });
createApplication({ module: reusable });
createApplication({ module: reusable });
assert(count === 2, "Independent applications share module registration state");
const ordered = defineModule({ name: "Ordered", configure: (_scope) => { order.push("ordered"); }, imports: [
  defineModule({ name: "One", configure: (_scope) => { order.push("one"); }, imports: [defineModule({ name: "Inner", configure: (_scope) => { order.push("inner"); } })] }),
  defineModule({ name: "Two", configure: (_scope) => { order.push("two"); } }),
] });
createApplication({ module: ordered });
assert(order.join(",") === "root,child,ordered,one,inner,two", "Import order changed");
console.log("PASS module graph preflight");
