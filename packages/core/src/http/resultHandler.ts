import type { HttpContext } from "./httpContext";
import type { Handler } from "./router";

/** 发送前按注册顺序转换结果；不得直接发送响应，结果类型保持一致。
 * scriptc 0.0.36 下仅抛错的回调须显式声明 Promise<T>，避免推断为 Promise<never>。 */
export type ResultTransform<T> = (result: T, context: HttpContext) => Promise<T>;

/** JSON 结果适配配置；序列化由消费者提供，避免对任意业务对象进行运行时反射。 */
export interface ResultOptions<T> {
  /** 最终 JSON 状态码，200–599，排除不允许内容的 204、205、304。 */
  status: number;
  /** 返回有效 JSON 文本；可以在这里将结果包装成应用自己的响应结构。 */
  serialize: (result: T) => string;
  transforms?: ResultTransform<T>[];
  /** 设置后允许 undefined 结果，并以此状态发送空响应；省略保持严格 JSON 契约。 */
  emptyStatus?: number;
}

/** 将返回结果的异步处理器适配到现有路由和中间件。
 * 配置在创建时复制；处理、转换、序列化全部成功后才发送 JSON。
 * 回调可设置响应头，但不得发送响应；失败交给现有外层错误边界。
 * 不提供流式响应或取消保证，HEAD 仍执行处理与序列化但不发送正文。
 */
export function resultHandler<T>(handle: (context: HttpContext) => Promise<T>, options: ResultOptions<T>): Handler {
  const status = options.status;
  if (!Number.isInteger(status) || status < 200 || status > 599 || status === 204 || status === 205 || status === 304) {
    throw new Error("Invalid JSON result status");
  }
  const serialize = options.serialize;
  const emptyStatus = options.emptyStatus;
  if (emptyStatus !== undefined && (!Number.isInteger(emptyStatus) || emptyStatus < 200 || emptyStatus > 599)) {
    throw new Error("Invalid empty response status");
  }
  const transforms = options.transforms === undefined ? [] : options.transforms.slice();
  return async (context) => {
    assertUnsent(context);
    let result = await handle(context);
    assertUnsent(context);
    if (emptyStatus !== undefined && result === undefined) {
      if (transforms.length > 0) throw new Error("Empty routes cannot transform a response body");
      context.empty(emptyStatus);
      return;
    }
    for (const transform of transforms) {
      result = await transform(result, context);
      assertUnsent(context);
    }
    if (emptyStatus !== undefined && result === undefined) {
      context.empty(emptyStatus);
      return;
    }
    const body = serialize(result);
    assertUnsent(context);
    if (typeof body !== "string") throw new Error("Result serializer must return JSON text");
    context.json(status, body);
  };
}

function assertUnsent(context: HttpContext): void {
  if (context.responded) throw new Error("Result handler cannot send a response directly");
}
