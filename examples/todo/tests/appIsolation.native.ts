import { createApplication } from "@backts/framework";
import { AppModule } from "../src/appModule";

const first = createApplication({ module: AppModule, http: { logger: false } });
const second = createApplication({ module: AppModule, http: { logger: false } });
await second.listen(Number(process.argv[3]!));
await first.listen(Number(process.argv[2]!));
process.on("SIGTERM", () => { void close(); });
async function close(): Promise<void> {
  await first.close();
  await second.close();
}
