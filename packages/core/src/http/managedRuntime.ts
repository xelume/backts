import { ApplicationLogger } from "./logger";
import { HttpServer } from "./httpServer";
import type { ResolvedListenOptions } from "./listenOptions";

/** 进程托管策略；嵌入式 listen 不创建信号监听。 */
export class ManagedRuntime {
  private signalHandler: (() => void) | null = null;
  private shuttingDown = false;
  private shutdownStartedAt = 0;

  constructor(private server: HttpServer, private logger: ApplicationLogger) {}

  async run(options: ResolvedListenOptions): Promise<void> {
    await this.server.listen(options);
    const handler = (): void => { void this.shutdown(); };
    this.signalHandler = handler;
    process.on("SIGTERM", handler);
    process.on("SIGINT", handler);
  }

  private async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      // pnpm/终端可能把同一次进程组信号重复转发；合并初始 250ms 信号突发。
      if (Date.now() - this.shutdownStartedAt < 250) return;
      this.logger.message("internalError", "error", "Forced shutdown requested");
      this.server.forceClose();
      process.exit(1);
    }
    this.shuttingDown = true;
    this.shutdownStartedAt = Date.now();
    // close() 在 5 秒时销毁剩余连接；仅在底层仍无法完成关闭时才退出进程兜底。
    const deadline = setTimeout(() => {
      this.logger.message("internalError", "error", "Server shutdown timed out");
      process.exit(1);
    }, 6000);
    try {
      await this.server.close();
      if (this.server.forced) {
        process.exit(1);
      }
    }
    catch {
      this.detach();
      this.logger.message("internalError", "error", "Server shutdown failed");
      process.exit(1);
    } finally {
      clearTimeout(deadline);
    }
  }

  detach(): void {
    const handler = this.signalHandler;
    if (handler === null) return;
    process.off("SIGTERM", handler);
    process.off("SIGINT", handler);
    this.signalHandler = null;
  }

}
