import { mkdirSync, mkdtempSync, renameSync, rmSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { cliBin } from "../runtime/packageInfo";
import { launch, stop, type ManagedProcess } from "../runtime/processes";

export function registerDevCommand(program: Command, complete: (code: number) => void): void {
  program.command("dev")
    .description("Build, watch for changes and restart the native service")
    .argument("[args...]", "application arguments; put application options after --")
    .option("--entry <file>", "application entry", "src/main.ts")
    .option("--out <file>", "native executable output", ".scriptc/app")
    .action(async (args: string[], options: { entry: string; out: string }) => {
      await develop(process.cwd(), options.entry, options.out, args);
      complete(0);
    });
}

async function develop(cwd: string, entry: string, output: string, args: string[]): Promise<void> {
  const executable = resolve(cwd, output);
  mkdirSync(dirname(executable), { recursive: true });
  // 与最终产物处于同一文件系统，避免编译覆盖正在运行的二进制。
  const staging = mkdtempSync(join(dirname(executable), ".backts-dev-"));
  const candidate = join(staging, "app");
  let service: ManagedProcess | undefined;
  let compiler: ManagedProcess | undefined;
  let rebuilding: Promise<void> | undefined;
  let busy = false;
  let pending = false;
  let closing = false;
  let timer: NodeJS.Timeout | undefined;
  const { promise: done, resolve: settle, reject: fail } = Promise.withResolvers<void>();

  async function rebuild(): Promise<void> {
    if (closing) return;
    busy = true;
    try {
      do {
        pending = false;
        console.log("[backts] Building…");
        compiler = launch(process.execPath, [cliBin, "build", "--entry", entry, "--out", candidate], cwd);
        const status = await compiler.exited;
        await stop(compiler, 1000);
        compiler = undefined;
        if (closing) return;
        if (pending) continue;
        if (status !== 0) {
          console.error(service ? "[backts] Build failed. Keeping the current service; waiting for changes." : "[backts] Build failed. Waiting for changes.");
          continue;
        }
        if (service) console.log("[backts] Restarting; allowing up to 1 second for current requests.");
        await stop(service, 1000);
        service = undefined;
        if (closing) return;
        if (pending) continue;
        renameSync(candidate, executable);
        service = launch(executable, args, cwd);
        const current = service;
        void current.exited.then((code) => {
          if (service === current) {
            service = undefined;
            if (!closing && !busy) console.error(`[backts] Application exited (${code}). Waiting for changes.`);
          }
        }, fail);
        console.log("[backts] Watching for changes.");
      } while (pending && !closing);
    } finally {
      busy = false;
    }
  }

  function schedule(): void {
    rebuilding = rebuild();
    void rebuilding.catch(fail);
  }
  const ignored = new Set(["node_modules", ".git", ".scriptc", "dist"]);
  const watcher = watch(cwd, { recursive: true }, (_event, file) => {
    if (!file) return;
    const parts = file.toString().split(/[\\/]/);
    if (parts.some((part) => ignored.has(part) || part.startsWith(".backts-dev-"))) return;
    if (!/\.(ts|json)$/.test(file.toString())) return;
    if (busy) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(schedule, 150);
  });
  watcher.on("error", fail);
  const shutdown = () => { settle(); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  schedule();
  try {
    await done;
  } finally {
    closing = true;
    clearTimeout(timer);
    watcher.close();
    try {
      await Promise.all([stop(compiler, 1000), stop(service)]);
      await rebuilding;
    } finally {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      rmSync(staging, { recursive: true, force: true });
    }
  }
}
