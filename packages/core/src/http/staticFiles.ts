import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { HttpContext } from "./httpContext";
import { HttpError } from "./httpError";

/** root 为可信的只读发布目录；相对路径在注册时按 cwd 固定，prefix 默认为 /。 */
export interface StaticOptions { root: string; prefix?: string; }

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".woff") return "font/woff";
  if (extension === ".woff2") return "font/woff2";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

class StaticMount {
  constructor(public root: string, public prefix: string) {}
}

/** 仅在没有匹配的业务路径时运行；最长挂载前缀独占该请求。 */
export class StaticFiles {
  private mounts: StaticMount[] = [];

  add(input: string | StaticOptions, prefix?: string): void {
    if (typeof input !== "string" && prefix !== undefined) throw new Error("Do not mix static options");
    const root = typeof input === "string" ? input : input.root;
    let mountPath = (typeof input === "string" ? prefix : input.prefix) ?? "/";
    if (!root.trim() || !mountPath.startsWith("/") || mountPath.includes("//") || mountPath.includes("?") || mountPath.includes("#") || mountPath.includes("%") || mountPath.includes("\\")) throw new Error("Invalid static mount");
    if (mountPath.length > 1 && mountPath.endsWith("/")) mountPath = mountPath.slice(0, -1);
    for (const segment of mountPath.split("/")) {
      if (segment === "." || segment === ".." || segment.startsWith(":")) throw new Error("Invalid static prefix");
    }
    for (const mount of this.mounts) {
      if (mount.prefix === mountPath) throw new Error("Duplicate static prefix");
    }
    const directory = realpathSync(resolve(root));
    if (!statSync(directory).isDirectory()) throw new Error("Static root must be a directory");
    this.mounts.push(new StaticMount(directory, mountPath));
  }

  /** 仅提供挂载 URL 前缀，不暴露本地文件系统路径。 */
  prefixes(): string[] { return this.mounts.map((mount) => mount.prefix); }

  private safePath(mount: StaticMount, file: string): string {
    if (!existsSync(file)) throw new HttpError(404, "Not found");
    const canonical = realpathSync(file);
    const offset = relative(mount.root, canonical);
    if (offset === ".." || offset.startsWith(`..${sep}`) || offset.startsWith(sep) || offset.includes(":")) throw new HttpError(404, "Not found");
    for (const segment of offset.split(sep)) {
      if (segment.startsWith(".")) throw new HttpError(404, "Not found");
    }
    return canonical;
  }

  async serve(context: HttpContext): Promise<boolean> {
    let selected = -1;
    for (let index = 0; index < this.mounts.length; index += 1) {
      const mount = this.mounts[index]!;
      if (mount.prefix !== "/" && context.path !== mount.prefix && !context.path.startsWith(`${mount.prefix}/`)) continue;
      if (selected < 0 || mount.prefix.length > this.mounts[selected]!.prefix.length) selected = index;
    }
    if (selected < 0) return false;
    if (context.path.startsWith("//")) throw new HttpError(400, "Invalid path");
    const mount = this.mounts[selected]!;
    if (context.method !== "GET" && context.method !== "HEAD") {
      context.header("allow", "GET, HEAD");
      throw new HttpError(405, "Method not allowed");
    }
    const suffix = mount.prefix === "/" ? context.path.slice(1) : context.path.slice(mount.prefix.length);
    let decoded: string;
    try { decoded = decodeURIComponent(suffix); }
    catch { throw new HttpError(400, "Invalid path encoding"); }
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.includes(":")) throw new HttpError(404, "Not found");
    for (const segment of decoded.split("/")) {
      if (segment.startsWith(".")) throw new HttpError(404, "Not found");
    }
    // 使用 ./ 前缀，避免解码后的前导 / 改变文件系统根目录。
    let file = this.safePath(mount, resolve(mount.root, `./${decoded}`));
    let stats = statSync(file);
    if (stats.isDirectory()) {
      // 目录 URL 必须带斜杠，保证 index.html 的相对资源地址正确。
      if (!context.path.endsWith("/")) {
        context.redirect(`${context.path}/`);
        return true;
      }
      file = this.safePath(mount, resolve(file, "index.html"));
      stats = statSync(file);
    }
    if (!stats.isFile()) throw new HttpError(404, "Not found");
    const body = context.method === "HEAD" ? null : await readFile(file);
    context.header("cache-control", "no-cache");
    context.header("x-content-type-options", "nosniff");
    if (body === null) context.emptyFile(contentType(file), stats.size);
    else context.bytes(200, contentType(file), body);
    return true;
  }
}
