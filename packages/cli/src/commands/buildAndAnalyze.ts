import { Command, Option } from "commander";

export function registerBuildAndAnalyzeCommands(program: Command, complete: (code: number) => void): void {
  for (const name of ["build", "analyze"] as const) {
    const command = program.command(name)
      .description(name === "build" ? "Build a native executable" : "Check native compilation support")
      .option("--entry <file>", "application entry", "src/main.ts")
      .addOption(new Option("--tests", "process tests/**/*.native.ts instead of the application").conflicts(["entry", "out"]));
    if (name === "build") command.option("--out <file>", "native executable output", ".scriptc/app");
    else command.alias("coverage");
    command.action(async (options: { entry: string; out?: string; tests?: boolean }) => {
      const operation = name === "build" ? "build" : "coverage";
      if (options.tests) {
        const { prepareNativeTests } = await import("../native/tests");
        complete(await prepareNativeTests(operation, process.cwd()));
      } else {
        const { compileNative } = await import("../native/compiler");
        complete(await compileNative({ operation, entry: options.entry, output: options.out ?? ".scriptc/app", cwd: process.cwd() }));
      }
    });
  }
}
