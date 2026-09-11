import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "./httpError";

/** 每个请求独立创建；响应仅可提交一次，请求体仅可读取一次。 */
export class HttpContext {
  private sent = false;
  private bodyRead = false;
  private parameterNames: string[] = [];
  private parameterValues: string[] = [];

  constructor(
    private request: IncomingMessage,
    private response: ServerResponse,
    public method: string,
    public path: string,
    private maximumBodyBytes: number,
    private onFinished: () => void = () => {},
  ) {}

  get responded(): boolean { return this.sent; }

  /** 原始请求目标，保留 query 和百分号编码。 */
  get url(): string { return this.request.url ?? "/"; }

  /** 按 HTTP 大小写不敏感规则读取请求头，缺失时返回 undefined。 */
  requestHeader(name: string): string | undefined {
    const value = this.request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value.join(", ") : value;
  }

  /** 查询参数首值；缺失返回 undefined，空值返回空字符串。 */
  query(name: string): string | undefined {
    const values = this.queryAll(name);
    return values.length === 0 ? undefined : values[0];
  }

  /** 保留重复参数顺序；遵循 URLSearchParams 的表单解码规则。 */
  queryAll(name: string): string[] {
    const index = this.url.indexOf("?");
    if (index < 0) return [];
    return new URLSearchParams(this.url.slice(index + 1)).getAll(name);
  }

  /** Router 在调用处理器之前设置已解码的路径参数。 */
  setParameters(names: string[], values: string[]): void {
    this.parameterNames = names;
    this.parameterValues = values;
  }

  param(name: string): string {
    const index = this.parameterNames.indexOf(name);
    if (index < 0) throw new Error("Unknown route parameter");
    return this.parameterValues[index]!;
  }

  header(name: string, value: string): void {
    if (this.sent) throw new Error("Response already sent");
    this.response.setHeader(name, value);
  }

  /** 接受已序列化的 JSON 文本，避免把业务对象类型耦合到传输层。 */
  json(status: number, body: string): void {
    if (this.sent) throw new Error("Response already sent");
    this.response.statusCode = status;
    this.response.setHeader("content-type", "application/json; charset=utf-8");
    this.sent = true;
    this.response.end(this.method === "HEAD" ? "" : body, this.onFinished);
  }

  noContent(): void {
    this.empty(204);
  }

  /** 发送无响应体的成功或错误状态；默认 204，不自动添加 Content-Type。 */
  empty(status: number = 204): void {
    if (this.sent) throw new Error("Response already sent");
    if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error("Invalid empty response status");
    this.response.statusCode = status;
    this.sent = true;
    this.response.end(this.onFinished);
  }

  /** 发送原始字节；Content-Length 按 Buffer 字节数设置，HEAD 不发送 body。 */
  bytes(status: number, contentType: string, body: Buffer): void {
    if (this.sent) throw new Error("Response already sent");
    this.response.statusCode = status;
    this.header("content-type", contentType);
    this.header("content-length", String(body.length));
    this.sent = true;
    if (this.method === "HEAD") this.response.end(this.onFinished);
    else this.response.end(body, this.onFinished);
  }

  /** 静态 HEAD 响应无需读取文件内容。 */
  emptyFile(contentType: string, length: number): void {
    if (this.sent) throw new Error("Response already sent");
    this.response.statusCode = 200;
    this.header("content-type", contentType);
    this.header("content-length", String(length));
    this.sent = true;
    this.response.end(this.onFinished);
  }

  /** 静态目录的同站点相对重定向。 */
  redirect(path: string): void {
    if (this.sent) throw new Error("Response already sent");
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("\r") || path.includes("\n")) throw new Error("Invalid redirect path");
    this.response.statusCode = 308;
    this.header("location", path);
    this.sent = true;
    this.response.end(this.onFinished);
  }

  /** JSON 输入仍须由业务显式校验；限制按原始字节计数。 */
  readJson(): Promise<unknown> {
    if (this.bodyRead) throw new Error("Request body already read");
    const contentType = this.request.headers["content-type"] ?? "";
    if (contentType.split(";")[0]!.trim().toLowerCase() !== "application/json") {
      this.bodyRead = true;
      throw new HttpError(415, "Content-Type must be application/json");
    }
    return this.parseJson(this.readBytes());
  }

  private async parseJson(body: Promise<Buffer>): Promise<unknown> {
    const bytes = await body;
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { throw new HttpError(400, "Request body must be valid JSON"); }
  }

  /** UTF-8 解码；与 JSON/字节读取共享一次性读取和大小限制。 */
  async readText(): Promise<string> { return (await this.readBytes()).toString("utf8"); }

  /** 原始请求体字节，不限制媒体类型，适用于签名验证与二进制输入。 */
  readBytes(): Promise<Buffer> {
    if (this.bodyRead) throw new Error("Request body already read");
    this.bodyRead = true;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let length = 0;
      let finished = false;
      this.request.on("data", (chunk: Buffer) => {
        if (finished) return;
        length += chunk.length;
        if (length > this.maximumBodyBytes) {
          finished = true;
          chunks.splice(0, chunks.length);
          // 继续丢弃后续数据，不销毁 socket，确保客户端可接收 413。
          reject(new HttpError(413, "Request body is too large"));
          return;
        }
        chunks.push(chunk);
      });
      this.request.on("end", () => {
        if (finished) return;
        finished = true;
        resolve(Buffer.concat(chunks));
      });
      this.request.on("error", () => {
        if (finished) return;
        finished = true;
        reject(new HttpError(400, "Request stream failed"));
      });
      this.request.on("aborted", () => {
        if (finished) return;
        finished = true;
        reject(new HttpError(400, "Request aborted"));
      });
    });
  }
}
