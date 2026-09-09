import {Application} from '@backts/core';
import {InMemoryTodoRepository} from './todos/inMemoryTodoRepository';
import {TodoService} from './todos/todoService';
import {TodoController} from './todos/todoController';
import {todoErrorBoundary} from './todos/errorBoundary';
import {registerTodoRoutes} from './todos/registerRoutes';

const repository = new InMemoryTodoRepository();
const service = new TodoService(repository.port());
const controller = new TodoController(service);
const app = new Application();
app.use(async (context, next) => {
  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "same-origin");
  await next();
});
app.serveStatic('./public');

app.get('/health', async (context) => {
  context.json(200, JSON.stringify({status: 'ok'}));
});
registerTodoRoutes(app.group('/api/todos', [todoErrorBoundary]), controller);

const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
