import type { ApplicationModule } from "@backts/framework";
import type { HttpContext } from "@backts/core";

class HelloService {
  message(): string { return "Hello BackTS"; }
}

class HelloController {
  constructor(private service: HelloService) {}
  async index(context: HttpContext): Promise<void> {
    context.json(200, JSON.stringify({ message: this.service.message() }));
  }
}

export const helloModule: ApplicationModule = {
  prefix: "/",
  configure: (scope) => {
    scope.controller(() => new HelloController(new HelloService()), (routes, controller) => {
      routes.get("", (context) => controller.index(context));
      routes.get("/health", async (context) => { context.json(200, '{"status":"ok"}'); });
    });
  },
};
