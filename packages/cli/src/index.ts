import { Command, CommanderError } from "commander";
import { registerCreateCommand } from "./commands/create";
import { registerBuildAndAnalyzeCommands } from "./commands/buildAndAnalyze";
import { registerDevCommand } from "./commands/dev";
import { registerStartCommand } from "./commands/start";
import { registerDoctorCommand } from "./commands/doctor";
import { cliVersion } from "./runtime/packageInfo";

/** 命令行公共入口；返回退出码，解析或启动异常抛出，调用者负责设置 process.exitCode。 */
export async function runCli(argv: string[]): Promise<number> {
  const program = new Command()
    .name("backts")
    .description("Create and develop native TypeScript services")
    .version(cliVersion, "-v, --version")
    .addHelpText("after", "\nDevelopment rebuilds and restarts the native service. Node 24+ and clang/SDK required.")
    .exitOverride()
    // 公共入口抛出解析错误，由 bin 统一输出，避免重复打印。
    .configureOutput({ outputError: () => {} });
  let exitCode = 0;
  const complete = (code: number): void => { exitCode = code; };
  registerCreateCommand(program, complete);
  registerDevCommand(program, complete);
  registerBuildAndAnalyzeCommands(program, complete);
  registerStartCommand(program, complete);
  registerDoctorCommand(program, complete);
  program.hook("preAction", (_program, command) => {
    if (argv.includes("--") && command.name() !== "dev" && command.name() !== "start") {
      throw new Error(`Application arguments are not supported for ${command.name()}`);
    }
  });
  try {
    await program.parseAsync(argv.length ? argv : ["--help"], { from: "user" });
  } catch (error) {
    if (!(error instanceof CommanderError) || error.exitCode !== 0) throw error;
  }
  return exitCode;
}
