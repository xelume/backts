import { createHttpApp, HttpError } from "@backts/core";

const app = createHttpApp();
const directory = process.argv[3]!;
app.serveStatic(directory);
app.serveStatic(directory, "/assets");
app.serveStatic({ root: `${directory}/nested`, prefix: "/assets/nested" });
let duplicate = false;
try { app.serveStatic(directory, "/assets/"); } catch { duplicate = true; }
if (!duplicate) throw new Error("Duplicate static mount accepted");
app.get("/health", async (context) => { context.json(200, "{}"); });
app.get("/assets/override.txt", async (context) => { context.json(200, '{"route":true}'); });
app.get("/assets/business.txt", async () => { throw new HttpError(404, "Business missing"); });
await app.run(Number(process.argv[2]!));
let frozen = false;
try { app.serveStatic(directory, "/late"); } catch { frozen = true; }
if (!frozen) throw new Error("Static mount added after startup");
