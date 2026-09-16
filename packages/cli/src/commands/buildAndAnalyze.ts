import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";

export function registerBuildAndAnalyzeCommands(program: Command, complete: (code: number) => void): void {
  for (const name of ["build", "analyze"] as const) {
    const command = program.command(name)
      .description(name === "build" ? "Build a native executable" : "Check native compilation support")
      .option("--entry <file>", "application entry", "src/main.ts")
      .addOption(new Option("--tests", "process tests/**/*.native.ts instead of the application").conflicts(["entry", "out"]))
      .addOption(new Option("--jobs <count>", "maximum concurrent test compilations (requires --tests; default: up to 2)").argParser((value) => {
        const jobs = Number(value);
        if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(jobs)) throw new InvalidArgumentError("must be a positive safe integer");
        return jobs;
      }));
    if (name === "build") command.option("--out <file>", "native executable output", "build/app")
      .option("--no-public", "skip copying public assets (used by dev)");
    else command.alias("coverage");
    command.action(async (options: { entry: string; out?: string; tests?: boolean; jobs?: number; public?: boolean }) => {
      if (options.jobs !== undefined && !options.tests) throw new Error("--jobs requires --tests");
      const operation = name === "build" ? "build" : "coverage";
      if (options.tests) {
        const { prepareNativeTests } = await import("../native/tests");
        complete(await prepareNativeTests(operation, process.cwd(), options.jobs));
      } else {
        const { compileNative } = await import("../native/compiler");
        const cwd = process.cwd();
        const output = resolve(cwd, options.out ?? "build/app");
        const source = resolve(cwd, "public");
        const destination = resolve(dirname(output), "public");
        const copyPublic = operation === "build" && options.public !== false;
        if (copyPublic) {
          // 先解析已有父目录，避免自定义输出或目录链接让同步覆盖源资源。
          function physicalPath(path: string): string {
            if (existsSync(path)) return realpathSync(path);
            return resolve(physicalPath(dirname(path)), relative(dirname(path), path));
          }
          const from = physicalPath(source);
          const to = physicalPath(destination);
          const offset = relative(from, to);
          const reverse = relative(to, from);
          if (offset === "" || !offset.startsWith(`..${sep}`) && offset !== ".." ||
              !reverse.startsWith(`..${sep}`) && reverse !== "..") {
            throw new Error("Build public output must not overlap the source public directory; use --no-public to skip copying");
          }
          const executableOffset = relative(to, physicalPath(output));
          if (executableOffset === "" || executableOffset !== ".." && !executableOffset.startsWith(`..${sep}`)) {
            throw new Error("Build executable must not be inside the public output directory");
          }
        }
        const status = await compileNative({ operation, entry: options.entry, output, cwd });
        if (status === 0 && copyPublic) {
          rmSync(destination, { recursive: true, force: true });
          if (existsSync(source)) copyAssets(source, destination, new Set());
        }
        complete(status);
      }
    });
  }
}


// 将链接目标复制成普通文件，部署目录不依赖源码目录中的链接。
function copyAssets(source: string, destination: string, ancestors: Set<string>): void {
  const actual = realpathSync(source);
  if (!statSync(actual).isDirectory()) {
    copyFileSync(actual, destination);
    return;
  }
  if (ancestors.has(actual)) throw new Error(`Circular public directory link: ${source}`);
  ancestors.add(actual);
  try {
    mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(actual)) copyAssets(resolve(actual, name), resolve(destination, name), ancestors);
  } finally { ancestors.delete(actual); }
}
