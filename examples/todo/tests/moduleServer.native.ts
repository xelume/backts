import { createApplication, defineModule, valueProvider } from "@backts/framework";
import { TodoModule, todoRepository } from "../src/todos/module";
import { createInMemoryTodoRepository, type TodoRepository } from "../src/todos/repository";
import { TodoInputError } from "../src/todos/service";

// 定制装配仅服务于测试，复用生产路由和模块错误边界。
function createTestTodoModule(repository: TodoRepository, prefix: string, name: string) {
  return defineModule({
    name, prefix,
    providers: (TodoModule.providers ?? []).map((binding) => binding.key.id === todoRepository.key.id ? valueProvider(todoRepository, repository) : binding),
    controllers: TodoModule.controllers ?? [],
  });
}

const first = createInMemoryTodoRepository();
const second = createInMemoryTodoRepository();
first.create("seed");
const app = createApplication({ http: { logger: false }, module: defineModule({ name: "AppModule", prefix: "/api", middleware: [async (context, next) => {
  context.header("x-parent", "yes");
  await next();
}], imports: [
  createTestTodoModule(first, "/first", "FirstTodoModule"),
  createTestTodoModule(second, "/second", "SecondTodoModule"),
  createTestTodoModule(first, "/shared", "SharedTodoModule"),
] }) });
const parent = app.group("/api");
parent.get("/outside", async () => { throw new TodoInputError("private"); });
app.get("/health", async (context) => { context.json(200, "{}"); });
await app.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void app.close(); });
