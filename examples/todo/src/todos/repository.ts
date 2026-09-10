export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

/** 业务拥有的存储契约；读写结果均是快照，更新缺失项返回 null。 */
export interface TodoRepository {
  list: () => Todo[];
  create: (title: string) => Todo;
  update: (
    id: number,
    title: string | null,
    completed: boolean | null,
  ) => Todo | null;
  remove: (id: number) => boolean;
}

function copy(todo: Todo): Todo {
  return {id: todo.id, title: todo.title, completed: todo.completed};
}

/** 创建独立的内存仓储；状态由闭包持有，返回记录均为快照，重启后清空。 */
export function createInMemoryTodoRepository(): TodoRepository {
  const todos: Todo[] = [];
  let nextId = 1;

  return {
    list: () => todos.map((todo) => copy(todo)),
    create: (title: string) => {
      const todo = {id: nextId, title, completed: false};
      nextId += 1;
      todos.push(todo);
      return copy(todo);
    },
    update: (id: number, title: string | null, completed: boolean | null) => {
      const todo = todos.find((item) => item.id === id);
      if (!todo) return null;
      if (title !== null) todo.title = title;
      if (completed !== null) todo.completed = completed;
      return copy(todo);
    },
    remove: (id: number) => {
      const index = todos.findIndex((todo) => todo.id === id);
      if (index < 0) return false;
      todos.splice(index, 1);
      return true;
    },
  };
}
