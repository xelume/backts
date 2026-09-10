import { createHttpApp } from "@backts/core";

const app = createHttpApp();
const port = Number(process.argv[2]!);
const api = process.argv[3]!;
const form = process.argv[4]!;
app.get("/health", async (context) => { context.json(200, "{}"); });

if (api === "run") {
  if (form === "number") await app.run(port);
  else if (form === "true") await app.run(port, true);
  else if (form === "false") await app.run(port, false);
  else if (form === "string") await app.run(port, "127.0.0.1");
  else if (form === "object") await app.run({ port });
  else if (form === "objectTrue") await app.run({ port, host: true });
  else if (form === "objectFalse") await app.run({ port, host: false });
  else if (form === "wildcard") await app.run({ port, host: "0.0.0.0" });
  else throw new Error("Unknown form");
} else {
  if (form === "number") await app.listen(port);
  else if (form === "true") await app.listen(port, true);
  else if (form === "false") await app.listen(port, false);
  else if (form === "string") await app.listen(port, "127.0.0.1");
  else if (form === "object") await app.listen({ port });
  else if (form === "objectTrue") await app.listen({ port, host: true });
  else if (form === "objectFalse") await app.listen({ port, host: false });
  else if (form === "wildcard") await app.listen({ port, host: "0.0.0.0" });
  else throw new Error("Unknown form");
  process.on("SIGTERM", () => { void app.close(); });
}
