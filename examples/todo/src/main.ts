import { createApplication } from '@backts/framework';
import { AppModule } from './appModule';
import { securityHeaders } from './securityHeaders';

const app = createApplication({ module: AppModule });
app.use(securityHeaders);
app.serveStatic('./public');

const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
