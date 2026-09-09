import { HttpError, type Middleware } from "@backts/core";
import { TodoInputError } from "./todoService";

/** 将 Todo 领域错误在业务 HTTP 边界映射，core 无需识别领域类型。 */
export const todoErrorBoundary: Middleware = async (context, next) => {
  try { await next(); }
  catch (error) {
    if (error instanceof TodoInputError) throw new HttpError(400, error.message);
    throw error;
  }
};
