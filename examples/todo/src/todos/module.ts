import type { ApplicationModule } from "@backts/framework";
import { resultHandler } from "@backts/core";
import { TodoController } from "./todoController";
import { TodoService } from "./todoService";
import type { TodoRepository } from "./todoRepository";
import { todoErrorBoundary } from "./errorBoundary";

/** Todo 框架模块；仓储由调用方提供，Controller/Service 每次挂载创建。 */
export function todoModule(prefix: string, repository: TodoRepository): ApplicationModule {
  return { prefix, middleware: [todoErrorBoundary], configure: (scope) => {
    scope.controller(() => new TodoController(new TodoService(repository)), (routes, controller) => {
      routes.get("", (context) => controller.list(context));
      routes.get("/:id", resultHandler((context) => controller.get(context), {
        status: 200,
        serialize: (todo) => JSON.stringify(todo),
      }));
      routes.post("", (context) => controller.create(context));
      routes.patch("/:id", (context) => controller.update(context));
      routes.delete("/:id", (context) => controller.remove(context));
    });
  } };
}
