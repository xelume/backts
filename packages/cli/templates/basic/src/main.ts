import { Application } from "@backts/core";

const app = new Application();
app.get("/", async (context) => {
  context.json(200, JSON.stringify({ message: "Hello BackTS" }));
});
app.get("/health", async (context) => {
  context.json(200, JSON.stringify({ status: "ok" }));
});

const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
