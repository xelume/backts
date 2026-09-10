import { resolve } from "node:path";
import { Command } from "commander";
import { run } from "../runtime/processes";

export function registerStartCommand(program: Command, complete: (code: number) => void): void {
  program.command("start")
    .description("Start an existing native executable without building")
    .argument("[args...]", "application arguments; put application options after --")
    .option("--out <file>", "native executable to start", ".scriptc/app")
    .action(async (args: string[], options: { out: string }) => {
      complete(await run(resolve(options.out), args, process.cwd()));
    });
}
