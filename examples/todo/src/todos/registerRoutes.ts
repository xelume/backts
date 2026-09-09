import { RouteGroup } from "@backts/core";
import { TodoController } from "./todoController";

/** Todo 拥有自身 HTTP 映射；前缀与依赖实例由应用入口装配。 */
export function registerTodoRoutes(routes: RouteGroup, controller: TodoController): void {
  routes.get("", (context) => controller.list(context));
  routes.get("/:id", (context) => controller.get(context));
  routes.post("", (context) => controller.create(context));
  routes.patch("/:id", (context) => controller.update(context));
  routes.delete("/:id", (context) => controller.remove(context));
}
