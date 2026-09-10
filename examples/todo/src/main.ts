import {createApplication} from '@backts/framework';
import {InMemoryTodoRepository} from './todos/inMemoryTodoRepository';
import {todoModule} from './todos/module';

const repository = new InMemoryTodoRepository();
const app = createApplication({ modules: [todoModule('/api/todos', repository.port())] });
app.use(async (context, next) => {
  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "same-origin");
  await next();
});
app.serveStatic('./public');

app.get('/health', async (context) => {
  context.json(200, JSON.stringify({status: 'ok'}));
});

const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
