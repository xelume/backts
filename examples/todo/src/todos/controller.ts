import { HttpContext, HttpError } from '@backts/core';
import { defineController, jsonRoute, noContentRoute } from '@backts/framework';
import {TodoService, TodoInputError, type TodoQuery} from './service';
import type {Todo} from './repository';

/** HTTP 输入与业务结果转换；不保存请求状态，领域错误由路由组边界处理。 */
export class TodoController {
  constructor(private service: TodoService) {}

  async list(context: HttpContext): Promise<Todo[]> {
    const result = this.service.search(readQuery(context));
    context.header('x-total-count', String(result.total));
    return result.items;
  }

  async get(context: HttpContext): Promise<Todo> {
    const todo = this.service.get(readId(context));
    if (todo === null) throw new HttpError(404, 'Todo not found');
    return todo;
  }

  async create(context: HttpContext): Promise<Todo> {
    const body = parseBody(await context.readJson());
    if (body.title === undefined) throw new HttpError(400, 'Title is required');
    return this.service.create(body.title);
  }

  async update(context: HttpContext): Promise<Todo> {
    const body = parseBody(await context.readJson());
    const todo = this.service.update(
      readId(context),
      body.title === undefined ? null : body.title,
      body.completed === undefined ? null : body.completed,
    );
    if (todo === null) throw new HttpError(404, 'Todo not found');
    return todo;
  }

  async remove(context: HttpContext): Promise<void> {
    if (!this.service.remove(readId(context)))
      throw new HttpError(404, 'Todo not found');
  }
}

/** 接口声明；注册、响应发送和异常边界由 framework 执行。 */
export const todoController = defineController<TodoController>({
  routes: [
    jsonRoute({ method: 'GET', path: '', action: (controller: TodoController, context) => controller.list(context) }),
    jsonRoute({ method: 'GET', path: '/:id', action: (controller: TodoController, context) => controller.get(context) }),
    jsonRoute({ method: 'POST', path: '', status: 201, action: (controller: TodoController, context) => controller.create(context) }),
    jsonRoute({ method: 'PATCH', path: '/:id', action: (controller: TodoController, context) => controller.update(context) }),
    noContentRoute({ method: 'DELETE', path: '/:id', action: (controller: TodoController, context) => controller.remove(context) }),
  ],
  mapException: (error) => error instanceof TodoInputError ? new HttpError(400, error.message) : undefined,
});

interface TodoBody {
  title?: string;
  completed?: boolean;
}

function parseBody(value: unknown): TodoBody {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be an object');
  }
  // 原生 checked cast 可能抛错；Node 路径还需下方的显式字段检查。
  let body: TodoBody;
  try {
    body = value as TodoBody;
  } catch {
    throw new HttpError(400, 'Invalid todo fields');
  }
  if (body.title !== undefined && typeof body.title !== 'string')
    throw new HttpError(400, 'Title must be a string');
  if (body.completed !== undefined && typeof body.completed !== 'boolean')
    throw new HttpError(400, 'Completed must be a boolean');
  return body;
}

function readId(context: HttpContext): number {
  const raw = context.param('id');
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== raw)
    throw new HttpError(400, 'Invalid todo id');
  return id;
}

function single(context: HttpContext, name: string): string | undefined {
  const values = context.queryAll(name);
  if (values.length > 1)
    throw new HttpError(400, `Duplicate query parameter: ${name}`);
  return values.length === 0 ? undefined : values[0];
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    String(number) !== value ||
    number < minimum ||
    number > maximum
  )
    throw new HttpError(400, 'Invalid pagination parameter');
  return number;
}

function readQuery(context: HttpContext): TodoQuery {
  const q = (single(context, 'q') ?? '').trim();
  const status = single(context, 'status') ?? 'all';
  if (q.length > 120)
    throw new HttpError(400, 'Search must not exceed 120 characters');
  if (status !== 'all' && status !== 'active' && status !== 'completed')
    throw new HttpError(400, 'Invalid status filter');
  return {
    q,
    status,
    offset: integer(single(context, 'offset'), 0, 0, Number.MAX_SAFE_INTEGER),
    limit: integer(single(context, 'limit'), 0, 1, 100),
  };
}
