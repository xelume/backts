import { HttpContext, HttpError } from "@backts/core";
import type { TodoQuery } from "./todoService";

interface TodoBody { title?: string; completed?: boolean; }

export function parseBody(value: unknown): TodoBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be an object");
  }
  // 原生 checked cast 可能抛错；Node 路径还需下方的显式字段检查。
  let body: TodoBody;
  try { body = value as TodoBody; }
  catch { throw new HttpError(400, "Invalid todo fields"); }
  if (body.title !== undefined && typeof body.title !== "string") throw new HttpError(400, "Title must be a string");
  if (body.completed !== undefined && typeof body.completed !== "boolean") throw new HttpError(400, "Completed must be a boolean");
  return body;
}

export function readId(context: HttpContext): number {
  const raw = context.param("id");
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== raw) throw new HttpError(400, "Invalid todo id");
  return id;
}

function single(context: HttpContext, name: string): string | undefined {
  const values = context.queryAll(name);
  if (values.length > 1) throw new HttpError(400, `Duplicate query parameter: ${name}`);
  return values.length === 0 ? undefined : values[0];
}

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || String(number) !== value || number < minimum || number > maximum) throw new HttpError(400, "Invalid pagination parameter");
  return number;
}

export function readQuery(context: HttpContext): TodoQuery {
  const q = (single(context, "q") ?? "").trim();
  const status = single(context, "status") ?? "all";
  if (q.length > 120) throw new HttpError(400, "Search must not exceed 120 characters");
  if (status !== "all" && status !== "active" && status !== "completed") throw new HttpError(400, "Invalid status filter");
  return { q, status, offset: integer(single(context, "offset"), 0, 0, Number.MAX_SAFE_INTEGER), limit: integer(single(context, "limit"), 0, 1, 100) };
}
