import { HttpContext, HttpError } from "@backts/core";
import { TodoService } from "./todoService";
import { parseBody, readId, readQuery } from "./todoInput";

/** HTTP 输入与业务结果转换；不保存请求状态，领域错误由路由组边界处理。 */
export class TodoController {
  constructor(private service: TodoService) {}

  async list(context: HttpContext): Promise<void> {
    const result = this.service.search(readQuery(context));
    context.header("x-total-count", String(result.total));
    context.json(200, JSON.stringify(result.items));
  }

  async get(context: HttpContext): Promise<void> {
    const todo = this.service.get(readId(context));
    if (todo === null) throw new HttpError(404, "Todo not found");
    context.json(200, JSON.stringify(todo));
  }

  async create(context: HttpContext): Promise<void> {
    const body = parseBody(await context.readJson());
    if (body.title === undefined) throw new HttpError(400, "Title is required");
    context.json(201, JSON.stringify(this.service.create(body.title)));
  }

  async update(context: HttpContext): Promise<void> {
    const body = parseBody(await context.readJson());
    const todo = this.service.update(readId(context), body.title === undefined ? null : body.title, body.completed === undefined ? null : body.completed);
    if (todo === null) throw new HttpError(404, "Todo not found");
    context.json(200, JSON.stringify(todo));
  }

  async remove(context: HttpContext): Promise<void> {
    if (!this.service.remove(readId(context))) throw new HttpError(404, "Todo not found");
    context.noContent();
  }
}
