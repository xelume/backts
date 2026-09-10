import type { HttpContext, Next } from "@backts/core";

/** 为所有 HTTP 响应设置基础安全头，通过 app.use 注册。 */
export async function securityHeaders(context: HttpContext, next: Next): Promise<void> {
  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "same-origin");
  await next();
}
