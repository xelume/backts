import type { Todo, TodoRepository } from "./todoRepository";

/** limit 为 0 表示不分页，保留旧列表行为；offset 从 0 开始。 */
export interface TodoQuery { q: string; status: string; offset: number; limit: number; }
export interface TodoPage { items: Todo[]; total: number; }

export class TodoInputError extends Error {}

/** Todo 业务规则；不依赖 HTTP、Node 或 scriptc API。 */
export class TodoService {
  constructor(private repository: TodoRepository) {}

  private normalizeTitle(title: string): string {
    const value = title.trim();
    if (value.length < 1 || value.length > 120) {
      throw new TodoInputError("Title must contain between 1 and 120 characters");
    }
    return value;
  }

  list(): Todo[] { return this.repository.list(); }
  get(id: number): Todo | null { return this.repository.list().find((todo) => todo.id === id) ?? null; }
  search(query: TodoQuery): TodoPage {
    const keyword = query.q.toLowerCase();
    const items = this.repository.list().filter((todo) =>
      todo.title.toLowerCase().includes(keyword) &&
      (query.status === "all" || (query.status === "completed" ? todo.completed : !todo.completed)));
    return { total: items.length, items: query.limit === 0 ? items.slice(query.offset) : items.slice(query.offset, query.offset + query.limit) };
  }
  create(title: string): Todo { return this.repository.create(this.normalizeTitle(title)); }
  update(id: number, title: string | null, completed: boolean | null): Todo | null {
    if (title === null && completed === null) throw new TodoInputError("Provide title, completed, or both");
    return this.repository.update(id, title === null ? null : this.normalizeTitle(title), completed);
  }
  remove(id: number): boolean { return this.repository.remove(id); }
}
