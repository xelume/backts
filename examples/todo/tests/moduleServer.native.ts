import { createApplication } from "@backts/framework";
import { todoModule } from "../src/todos/module";
import { InMemoryTodoRepository } from "../src/todos/inMemoryTodoRepository";
import { TodoInputError } from "../src/todos/todoService";

const first = new InMemoryTodoRepository();
const second = new InMemoryTodoRepository();
first.create("seed");
const app = createApplication({ http: { logger: false }, modules: [{ prefix: "/api", middleware: [async (context, next) => {
  context.header("x-parent", "yes");
  await next();
}], configure: (scope) => {
  scope.mount(todoModule("/first", first.port()));
  scope.mount(todoModule("/second", second.port()));
  scope.mount(todoModule("/shared", first.port()));
} }] });
const parent = app.group("/api");
parent.get("/outside", async () => { throw new TodoInputError("private"); });
app.get("/health", async (context) => { context.json(200, "{}"); });
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
