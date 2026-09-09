import { Application } from "@backts/core";

// 仅供 tsc 验证公开重载边界，不执行此模块。
function checkRejectedCalls(app: Application): void {
  // @ts-expect-error 对象配置不能混用位置 host。
  void app.run({ port: 3000 }, true);
  // @ts-expect-error listen 与 run 使用相同的重载约束。
  void app.listen({ port: 3000 }, "127.0.0.1");
  // @ts-expect-error host 不接受数字。
  void app.run(3000, 1);
  // @ts-expect-error port 必须提供。
  void app.listen({ host: true });
}
void checkRejectedCalls;
