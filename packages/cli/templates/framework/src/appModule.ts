import { defineModule } from "@backts/framework";
import { HelloModule } from "./hello";
import { HealthModule } from "./health/module";

/** 应用根模块，集中组合功能模块。 */
export const AppModule = defineModule({
  name: "AppModule",
  imports: [HelloModule, HealthModule],
});
