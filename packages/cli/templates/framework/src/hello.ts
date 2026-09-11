import { defineModule, controller, get } from "@backts/framework";

export const HelloModule = defineModule({
  name: "HelloModule",
  controllers: [
    controller({ routes: [get("", () => ({ message: "Hello BackTS" }))] }),
  ],
});
