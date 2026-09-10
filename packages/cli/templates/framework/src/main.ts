import { createApplication } from "@backts/framework";
import { AppModule } from "./appModule";

const app = createApplication({ module: AppModule });
const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
