export interface Todo { id: number; title: string; completed: boolean; }

/** 业务拥有的存储契约；读写结果均是快照，更新缺失项返回 null。 */
export interface TodoRepository {
  list: () => Todo[];
  create: (title: string) => Todo;
  update: (id: number, title: string | null, completed: boolean | null) => Todo | null;
  remove: (id: number) => boolean;
}
