import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { run } from "../runtime/processes";

export function registerStartCommand(program: Command, complete: (code: number) => void): void {
  program.command("start")
    .description("Start an existing native executable without building")
    .argument("[args...]", "application arguments; put application options after --")
    .option("--out <file>", "native executable to start", "build/app")
    .action(async (args: string[], options: { out: string }) => {
      const executable = resolve(options.out);
      complete(await run(executable, args, dirname(executable)));
    });
}
