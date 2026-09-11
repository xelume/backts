import { controller, get, post, put, patch, del, head, options, type JsonOptions } from "@backts/framework";
// @ts-expect-error 业务空响应使用方法入口，不再公开 noContent。
import { noContent } from "@backts/framework";

// 只由 tsc 检查：异构结果不擦除为 unknown，转换器接收 Promise 解析后的结果。
controller({ routes: [
  get("/sync", () => ({ count: 1 }), {
    transforms: [async (value, _context) => ({ count: value.count + 1 })],
  }),
  post("/async", async (_context) => ({ message: "ok" }), {
    transforms: [async (value, _context) => ({ message: value.message.toUpperCase() })],
  }),
  get("/array", () => [1, 2]),
  put("/replace", () => ({ replaced: true })),
  patch("/patch", () => ({ updated: true })),
  del("/result", () => ({ removed: true }), {
    transforms: [async (value, _context) => ({ removed: value.removed })],
  }),
  del("/empty", () => true, { status: 204 }),
  head("/head", () => "metadata"),
  options("/options", () => "", { status: 204 }),
  del("/sync", () => {}),
  del("/async", async (_context) => {}),
] });

const wrongTransforms: JsonOptions<{ message: string }> = {
  transforms: [async (value, _context) => value],
};
// @ts-expect-error 转换器必须与接口结果类型匹配。
get("/invalid", () => ({ count: 1 }), wrongTransforms);

// @ts-expect-error DELETE 的响应转换器同样必须匹配实际结果类型。
del("/invalid-result", () => ({ removed: true }), wrongTransforms);
