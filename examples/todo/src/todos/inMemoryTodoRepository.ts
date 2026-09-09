import type { Todo, TodoRepository } from "./todoRepository";

function copy(todo: Todo): Todo {
  return { id: todo.id, title: todo.title, completed: todo.completed };
}

/** 单进程内存存储；每个实例拥有独立数据，重启后清空。 */
export class InMemoryTodoRepository {
  private todos: Todo[] = [];
  private nextId = 1;

  list(): Todo[] { return this.todos.map((todo) => copy(todo)); }

  create(title: string): Todo {
    const todo = { id: this.nextId, title, completed: false };
    this.nextId += 1;
    this.todos.push(todo);
    return copy(todo);
  }

  update(id: number, title: string | null, completed: boolean | null): Todo | null {
    const todo = this.todos.find((item) => item.id === id);
    if (!todo) return null;
    if (title !== null) todo.title = title;
    if (completed !== null) todo.completed = completed;
    return copy(todo);
  }

  remove(id: number): boolean {
    const index = this.todos.findIndex((todo) => todo.id === id);
    if (index < 0) return false;
    this.todos.splice(index, 1);
    return true;
  }

  /** scriptc 0.0.36 不支持类实例到该接口的直接转换，显式委托保留实例绑定。 */
  port(): TodoRepository {
    return {
      list: () => this.list(),
      create: (title: string) => this.create(title),
      update: (id: number, title: string | null, completed: boolean | null) => this.update(id, title, completed),
      remove: (id: number) => this.remove(id),
    };
  }
}
