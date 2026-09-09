/** 可安全返回客户端的 HTTP 错误；其他异常统一隐藏为 500。 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
