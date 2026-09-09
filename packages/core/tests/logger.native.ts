import { formatEvent, ApplicationLogger } from "../src/http/logger";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const result = { method: "GET", path: "/api/todos", status: 200, durationMs: 0, outcome: "completed" };
const event = { event: "requestCompleted", level: "info", timestamp: "2026-09-09T15:42:08.120Z", message: "", request: result };
function formatRequest(value: typeof result, color: boolean): string {
  event.request = value;
  event.level = value.status >= 500 ? "error" : value.status >= 400 || value.outcome === "closed" ? "warn" : "info";
  return formatEvent(event, color);
}
const line = formatRequest(result, false);
assert(line.includes("[BackTS]  15:42:08  INFO "), "Time and level: " + line);
assert(line.includes("<1 ms") && !line.includes("completed") && !line.includes("\x1b"), "Plain completion");
assert(formatRequest(result, true).includes("\x1b[32m200\x1b[0m"), "Success color");
result.status = 404;
assert(formatRequest(result, true).includes("\x1b[33m404"), "Warning color");
result.status = 500;
result.durationMs = 12;
assert(formatRequest(result, true).includes("\x1b[31m500"), "Error color");
assert(formatRequest(result, false).includes("12 ms"), "Duration");
result.status = 200;
result.outcome = "closed";
result.path = "/bad\x1b[31m\npath";
const closed = formatRequest(result, false);
assert(closed.includes("WARN") && closed.endsWith("CLOSED"), "Early close");
assert(!closed.includes("\x1b") && !closed.includes("\n"), "Control characters sanitized");
assert(line.includes("[HTTP]") && line.indexOf("/api/todos") < line.indexOf("→ 200"), "Request layout");
const lifecycle = { event: "listening", level: "info", timestamp: event.timestamp, message: "Listening on http://localhost:3000" };
assert(formatEvent(lifecycle, false).includes("[Application] Listening on"), "Lifecycle context");
lifecycle.event = "internalError";
lifecycle.level = "error";
lifecycle.message = "bad\nmessage\x1b";
const failure = formatEvent(lifecycle, false);
assert(failure.includes("[Exception]") && failure.includes("bad?message?"), "Error context and sanitization");
const colored = formatEvent(lifecycle, true);
assert(colored.includes("\x1b[36m[BackTS]") && colored.includes("\x1b[31mERROR") && colored.includes("\x1b[33m[Exception]"), "Visual hierarchy");
result.path = "/" + "long".repeat(30);
assert(formatRequest(result, false).includes(result.path), "Long paths remain complete");
const logger = new ApplicationLogger();
await logger.complete({ method: "GET", path: "/probe", status: 200, durationMs: 0, outcome: "completed" });
logger.message("requestError", "warn", "POST /probe: Request error (400)");
