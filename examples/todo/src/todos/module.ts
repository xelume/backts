import { RouteGroup, resultHandler } from "@backts/core";
import { TodoController } from "./todoController";
import { TodoService } from "./todoService";
import type { TodoRepository } from "./todoRepository";
import { todoErrorBoundary } from "./errorBoundary";

/** 挂载 Todo 的依赖与 HTTP 边界；调用方拥有前缀、仓储及其资源生命周期。
 * 每次创建独立 Service/Controller；数据隔离取决于传入的仓储实例。
 * 必须在应用启动前调用，同一路径重复挂载遵循 Router 的重复注册错误。
 */
export function registerTodoModule(parent: RouteGroup, repository: TodoRepository): void {
  const controller = new TodoController(new TodoService(repository));
  const routes = parent.group("/", [todoErrorBoundary]);
  routes.get("", (context) => controller.list(context));
  routes.get("/:id", resultHandler((context) => controller.get(context), {
    status: 200,
    serialize: (todo) => JSON.stringify(todo),
  }));
  routes.post("", (context) => controller.create(context));
  routes.patch("/:id", (context) => controller.update(context));
  routes.delete("/:id", (context) => controller.remove(context));
}
