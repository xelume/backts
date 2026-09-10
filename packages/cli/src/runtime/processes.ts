import { spawn, type ChildProcess } from "node:child_process";

export interface ManagedProcess {
  child: ChildProcess;
  exited: Promise<number>;
}

export function launch(command: string, args: string[], cwd: string): ManagedProcess {
  if (process.platform === "win32") throw new Error("Native development on Windows has not been validated; use a supported Unix environment.");
  const child = spawn(command, args, { cwd, stdio: "inherit", detached: true });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  // 启动失败可能早于调用方开始等待退出。
  void exited.catch(() => {});
  return { child, exited };
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

/** graceMs 仅限制本次停止等待；正常退出保留框架的连接排空期限。 */
export async function stop(running: ManagedProcess | undefined, graceMs = 6500): Promise<void> {
  if (!running) return;
  signalGroup(running.child, "SIGTERM");
  const timeout = setTimeout(() => signalGroup(running.child, "SIGKILL"), graceMs);
  try { await running.exited; }
  finally {
    clearTimeout(timeout);
    // 编译器的子进程也属于此组；主进程退出不能遗留它们。
    signalGroup(running.child, "SIGKILL");
  }
}

export async function run(command: string, args: string[], cwd: string): Promise<number> {
  const running = launch(command, args, cwd);
  let stopping: Promise<void> | undefined;
  const shutdown = () => {
    // 后续 Ctrl+C 也转发给应用，由应用执行强制关闭策略。
    if (stopping) signalGroup(running.child, "SIGTERM");
    else stopping = stop(running);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try { return await running.exited; }
  finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await stopping;
  }
}
