import { defineModule, defineController, jsonRoute, provideController } from "@backts/framework";
import type { HttpContext } from "@backts/core";

class HealthController {
  async check(_context: HttpContext): Promise<{ status: string }> { return { status: "ok" }; }
}
const healthController = defineController<HealthController>({
  routes: [jsonRoute({ method: "GET", path: "", action: (controller: HealthController, context) => controller.check(context) })],
});

/** 进程存活检查，不检查外部依赖的就绪状态。 */
export const HealthModule = defineModule({
  name: "HealthModule",
  prefix: "/health",
  controllers: [provideController((_resolve) => new HealthController(), healthController)],
});
