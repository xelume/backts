import { Application, type ApplicationOptions } from "@backts/core";

const mode = process.argv[3];
let errors = 0;
let completions = 0;
const options: ApplicationOptions = {
  onError: async (_failure, _context) => { errors++; },
  onRequestComplete: async (_result) => { completions++; },
};
if (mode === "routesOff") options.logger = { routes: false };
if (mode === "off") options.logger = false;
if (mode === "json") options.logger = { format: "json", color: false };
if (mode === "custom") options.logger = { write: async (event) => { console.log("CUSTOM " + JSON.stringify(event)); } };
if (mode === "broken") options.logger = { write: async (_event) => { throw new Error("Logger unavailable"); } };
const app = new Application(options);
app.get("/health", async (context) => { context.json(200, JSON.stringify({ errors, completions })); });
app.get("/error", async () => { throw new Error("Private failure"); });
app.group("/api").group("/todos").get("/:id", async (context) => { context.json(200, "{}"); });
app.serveStatic({ root: process.argv[4]!, prefix: "/assets/" });
if (mode === "listen") {
  try { await app.listen({ host: "127.0.0.1", port: Number(process.argv[2]!) }); }
  catch (error) {
    console.error("LISTEN FAILED: " + (error instanceof Error ? error.message : "Unknown failure"));
    process.exit(1);
  }
  process.on("SIGTERM", () => { void app.close(); });
} else await app.run({ host: "127.0.0.1", port: Number(process.argv[2]!) });
