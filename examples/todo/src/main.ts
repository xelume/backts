import {Application} from '@backts/core';
import {InMemoryTodoRepository} from './todos/inMemoryTodoRepository';
import {registerTodoModule} from './todos/module';

const repository = new InMemoryTodoRepository();
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
registerTodoModule(app.group('/api/todos'), repository.port());

const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
