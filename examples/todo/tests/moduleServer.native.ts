import { Application } from "@backts/core";
import { registerTodoModule } from "../src/todos/module";
import { InMemoryTodoRepository } from "../src/todos/inMemoryTodoRepository";
import { TodoInputError } from "../src/todos/todoService";

const app = new Application({ logger: false });
const first = new InMemoryTodoRepository();
const second = new InMemoryTodoRepository();
first.create("seed");
const parent = app.group("/api", [async (context, next) => {
  context.header("x-parent", "yes");
  await next();
}]);
registerTodoModule(parent.group("/first"), first.port());
registerTodoModule(parent.group("/second"), second.port());
registerTodoModule(parent.group("/shared"), first.port());
parent.get("/outside", async () => { throw new TodoInputError("private"); });
app.get("/health", async (context) => { context.json(200, "{}"); });
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
