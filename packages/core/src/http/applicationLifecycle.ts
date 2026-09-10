import { HttpServer } from "./httpServer";
import { ApplicationLogger } from "./logger";
import type { ResolvedListenOptions } from "./listenOptions";

/** 显式交给应用管理的资源；名称在应用内唯一。
 * start 在监听前执行；close 必须能够清理部分初始化失败的资源。
 * 回调不可等待本应用的 listen/run/close，避免生命周期互相等待。
 */
export interface ApplicationResource {
  name: string;
  start: () => Promise<void>;
  close: () => Promise<void>;
}

/** 协调资源与 HTTP，进程信号策略仍由 ManagedRuntime 拥有。 */
export class ApplicationLifecycle {
  private resources: ApplicationResource[] = [];
  private attempted = 0;
  private startup: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private stopping = false;
  private cleanupFailed = false;

  constructor(private server: HttpServer, private logger: ApplicationLogger, private onClosed: () => void) {}

  add(resource: ApplicationResource): void {
    if (resource.name.trim().length === 0) throw new Error("Resource name is required");
    for (const existing of this.resources) {
      if (existing.name === resource.name) throw new Error("Duplicate resource name");
    }
    this.resources.push({ name: resource.name, start: resource.start, close: resource.close });
  }

  start(options: ResolvedListenOptions): Promise<void> {
    const pending = this.initialize(options);
    this.startup = pending;
    return pending;
  }

  private async initialize(options: ResolvedListenOptions): Promise<void> {
    // 先保存 startup Promise，使回调触发的关闭也能等待初始化收尾。
    await Promise.resolve();
    try {
      for (const resource of this.resources) {
        this.assertRunning();
        this.attempted += 1;
        await resource.start();
      }
      this.assertRunning();
      await this.server.listen(options);
      this.assertRunning();
    } catch (error) {
      try { await this.server.close(); }
      catch { this.logger.message("internalError", "error", "HTTP startup cleanup failed"); }
      if (this.resources.length > 0) await this.server.waitForHandlers();
      try { await this.release(); }
      catch { this.logger.message("internalError", "error", "Resource startup cleanup failed"); }
      throw error;
    }
  }

  private assertRunning(): void {
    if (this.stopping) throw new Error("Application is closing");
  }

  close(): Promise<void> {
    const closing = this.closing;
    if (closing !== null) return closing;
    if (this.startup === null) return Promise.resolve();
    this.stopping = true;
    const pending = this.finish();
    this.closing = pending;
    return pending;
  }

  private async finish(): Promise<void> {
    try {
      const startup = this.startup;
      if (startup !== null) {
        try { await startup; } catch { /* 启动调用者收到原始错误，回滚已在初始化路径执行。 */ }
      }
      await this.server.close();
      // 响应结束/断连不等于业务完成；资源不能在处理器仍使用时释放。
      if (this.resources.length > 0) await this.server.waitForHandlers();
      await this.release();
    } finally { this.onClosed(); }
  }

  private async release(): Promise<void> {
    while (this.attempted > 0) {
      this.attempted -= 1;
      const resource = this.resources[this.attempted]!;
      try { await resource.close(); }
      catch {
        this.cleanupFailed = true;
        this.logger.message("internalError", "error", "Application resource cleanup failed");
      }
    }
    if (this.cleanupFailed) throw new Error("Application resource cleanup failed");
  }
}
