import type { RouteInfo } from "./router";
import type { RequestCompletion } from "./httpServer";

/** 结构化日志事件；request 为完成快照，其他事件通过 message 描述，不包含原始异常或请求体。 */
export interface LogEvent {
  event: string;
  level: string;
  timestamp: string;
  message: string;
  request?: RequestCompletion;
  /** routeMapped / staticMounted 的 URL 注册快照。 */
  route?: RouteInfo;
}
/** 自定义日志出口；Promise 拒绝被隔离，框架不等待后台日志刷新。 */
export interface Logger { write: (event: LogEvent) => Promise<void>; }
/** write 优先于内置格式；color 仅在终端且未设置 NO_COLOR 时启用。 */
export interface LoggerOptions {
  /** 默认输出启动路由清单；false 仅关闭 routeMapped / staticMounted 事件。 */
  routes?: boolean;
  format?: "pretty" | "json";
  color?: boolean;
  write?: (event: LogEvent) => Promise<void>;
}

function safe(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, "?");
}

function timestamp(value: string): string {
  const date = new Date(value);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  return time;
}

function paint(value: string, code: string, color: boolean): string {
  return color ? `\x1b[${code}m${value}\x1b[0m` : value;
}

function formatRequest(result: RequestCompletion, color: boolean): string {
  const closed = result.outcome === "closed";
  const code = result.status >= 500 ? "31" : result.status >= 400 || closed ? "33" : result.status >= 300 ? "36" : "32";
  const status = paint(String(result.status), code, color);
  const duration = result.durationMs < 1 ? "<1 ms" : `${result.durationMs} ms`;
  return `${safe(result.method).padEnd(7)} ${safe(result.path).padEnd(28)} → ${status}  ${paint(duration.padStart(7), "90", color)}${closed ? "  " + paint("CLOSED", "33", color) : ""}`;
}

/** 统一 pretty 展示；时间来自事件本身，便于确定性验证。 */
export function formatEvent(event: LogEvent, color: boolean): string {
  const request = event.request;
  const context = event.event === "routeMapped" ? "Routes" : event.event === "staticMounted" ? "Static" : request !== undefined ? "HTTP" : event.event === "requestError" || event.event === "internalError" ? "Exception" : "Application";
  const levelColor = event.level === "error" ? "31" : event.level === "warn" ? "33" : "32";
  const prefix = `${paint("[BackTS]", "36", color)}  ${paint(timestamp(event.timestamp), "90", color)}`;
  const level = paint(safe(event.level.toUpperCase()).padEnd(5), levelColor, color);
  const scope = paint(`[${context}]`.padEnd(13), "33", color);
  const route = event.route;
  const body = route !== undefined
    ? `${safe(route.method).padEnd(8)} ${safe(route.path)}${event.event === "staticMounted" ? " (static mount)" : ""}`
    : request === undefined ? safe(event.message) : formatRequest(request, color);
  return `${prefix}  ${level}  ${scope} ${body}`;
}

/** 实例级日志策略；false 是静默实现，所有出口故障都被隔离且不递归打印。 */
export class ApplicationLogger {
  private enabled: boolean;
  private json: boolean;
  private showRoutes: boolean;
  private color: boolean;
  private writer: ((event: LogEvent) => Promise<void>) | undefined;

  constructor(input: false | LoggerOptions = {}) {
    this.enabled = input !== false;
    const options: LoggerOptions = input === false ? {} : input;
    this.json = (options.format ?? process.env.LOG_FORMAT) === "json";
    this.color = options.color !== false && process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
    this.writer = options.write;
    this.showRoutes = options.routes !== false;
  }

  private async emit(event: LogEvent): Promise<void> {
    if (!this.enabled) return;
    try {
      const writer = this.writer;
      if (writer !== undefined) { await writer(event); return; }
      const line = this.json ? JSON.stringify(event) : formatEvent(event, this.color);
      if (event.level === "error" || event.level === "warn") console.error(line);
      else console.log(line);
    } catch { /* 日志故障不得改变服务行为或递归触发日志。 */ }
  }

  message(event: string, level: string, message: string): void {
    if (!this.enabled) return;
    void this.emit({ event, level, timestamp: new Date().toISOString(), message });
  }

  mapped(method: string, path: string, isStatic: boolean): void {
    if (!this.enabled || !this.showRoutes) return;
    void this.emit({ event: isStatic ? "staticMounted" : "routeMapped", level: "info",
      timestamp: new Date().toISOString(), message: "", route: { method, path } });
  }

  complete(result: RequestCompletion): void {
    if (!this.enabled) return;
    const request = { method: result.method, path: result.path, status: result.status, durationMs: result.durationMs, outcome: result.outcome };
    const level = result.status >= 500 ? "error" : result.status >= 400 || result.outcome === "closed" ? "warn" : "info";
    void this.emit({ event: "requestCompleted", level, timestamp: new Date().toISOString(), message: "", request });
  }
}
