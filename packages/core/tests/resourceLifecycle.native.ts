import { createHttpApp, type ApplicationResource } from "@backts/core";

const mode = process.argv[3] ?? "sequence";
const app = createHttpApp({ logger: false });
let ready = false;
let working = false;
function event(value: string): void { console.log(value); }
async function delay(ms: number): Promise<void> { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); }
async function close(): Promise<void> {
  const pending = app.close();
  if (pending !== app.close()) throw new Error("Close promise changed");
  try { await pending; event("closed"); }
  catch { event("close-error"); }
}
await app.close();
const first: ApplicationResource = {
  name: "first",
  start: async (): Promise<void> => {
    event("start:first");
    if (mode === "during-start") setTimeout(() => { void close(); }, 10);
    if (mode === "during-start" || mode === "startup-signal") await delay(250);
    ready = true;
    event("ready:first");
  },
  close: async (): Promise<void> => {
    if (working) throw new Error("Resource released while handler active");
    event("close:first");
    ready = false;
  },
};
app.manage(first);
first.start = async (): Promise<void> => { throw new Error("Changed callback used"); };
let duplicate = false;
try { app.manage(first); } catch { duplicate = true; }
if (!duplicate) throw new Error("Duplicate resource accepted");
let invalidName = false;
try { app.manage({ name: "  ", start: async (): Promise<void> => {}, close: async (): Promise<void> => {} }); }
catch { invalidName = true; }
if (!invalidName) throw new Error("Empty resource name accepted");
app.manage({
  name: "second",
  start: async (): Promise<void> => {
    if (!ready) throw new Error("Resource start order violated");
    event("start:second");
    if (mode === "rollback" || mode === "rollback-close-error" || mode === "managed-start-error") throw new Error("Initialization failed");
  },
  close: async (): Promise<void> => {
    event("close:second");
    if (mode === "close-error" || mode === "rollback-close-error" || mode === "managed-close-error") throw new Error("Cleanup failed");
    if (mode === "cleanup-hang" || mode === "second-signal") await delay(20000);
  },
});
app.manage({ name: "third", start: async (): Promise<void> => { event("start:third"); }, close: async (): Promise<void> => { event("close:third"); } });
app.get("/health", async (context) => { context.json(200, JSON.stringify({ ready })); });
app.get("/work", async (context) => {
  working = true;
  context.json(200, "{}");
  event("handler:sent");
  await delay(250);
  if (!ready) throw new Error("Resource closed too soon");
  working = false;
  event("handler:finished");
});
app.get("/disconnect", async (context) => {
  working = true;
  event("handler:started");
  await delay(250);
  if (!ready) throw new Error("Resource closed too soon");
  working = false;
  event("handler:finished");
  context.noContent();
});
if (mode === "managed" || mode === "startup-signal" || mode === "cleanup-hang" || mode === "second-signal" || mode === "managed-close-error" || mode === "managed-start-error") {
  await app.run(Number(process.argv[2]!));
  event("run:returned");
} else {
  try {
    await app.listen(Number(process.argv[2]!));
    event("listening");
    let frozen = false;
    try { app.manage({ name: "late", start: async (): Promise<void> => {}, close: async (): Promise<void> => {} }); } catch { frozen = true; }
    if (!frozen) throw new Error("Resources must freeze");
  } catch (error) {
    if (mode.startsWith("rollback") && (!(error instanceof Error) || error.message !== "Initialization failed")) {
      throw new Error("Original startup error was lost");
    }
    event("start-error");
  }
  await close();
}
