import {defineModule, factoryProvider, provideController} from '@backts/framework';
import {createInMemoryTodoRepository} from './repository';
import {TodoController, todoController} from './controller';
import {TodoService} from './service';

export const todoRepository = factoryProvider('TodoRepository', (_resolve) => createInMemoryTodoRepository());
const todoService = factoryProvider('TodoService', (resolve) => new TodoService(resolve.get(todoRepository)));

/** 模块声明依赖和接口，实例创建、复用及隔离由 framework 执行。 */
export const TodoModule = defineModule({
  name: 'TodoModule',
  prefix: '/api/todos',
  providers: [todoRepository, todoService],
  controllers: [provideController((resolve) => new TodoController(resolve.get(todoService)), todoController)],
});
