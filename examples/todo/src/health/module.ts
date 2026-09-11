import { defineModule, controller, get } from "@backts/framework";

/** 进程存活检查，不检查外部依赖的就绪状态。 */
export const HealthModule = defineModule({
  name: "HealthModule",
  prefix: "/health",
  controllers: [
    controller({ routes: [get("", () => ({ status: "ok" }))] }),
  ],
});
