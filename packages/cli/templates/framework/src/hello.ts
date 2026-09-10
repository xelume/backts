import { defineModule, defineController, jsonRoute, factoryProvider, provideController } from "@backts/framework";
import type { HttpContext } from "@backts/core";

class HelloService {
  message(): string { return "Hello BackTS"; }
}

class HelloController {
  constructor(private service: HelloService) {}
  async index(_context: HttpContext): Promise<{ message: string }> {
    return { message: this.service.message() };
  }
}

const helloController = defineController<HelloController>({
  routes: [jsonRoute({ method: "GET", path: "", action: (controller: HelloController, context) => controller.index(context) })],
});

const helloService = factoryProvider("HelloService", (_resolve) => new HelloService());

export const HelloModule = defineModule({
  name: "HelloModule",
  providers: [helloService],
  controllers: [provideController((resolve) => new HelloController(resolve.get(helloService)), helloController)],
});
