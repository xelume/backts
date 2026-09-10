import { createApplication } from "@backts/framework";
import { helloModule } from "./hello";

const app = createApplication({ modules: [helloModule] });
const port = process.argv.length > 2 ? Number(process.argv[2]!) : 3000;
await app.run(port);
