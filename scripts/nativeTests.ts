import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/** 测试入口与稳定的二进制名称；同名入口禁止覆盖输出。 */
export interface NativeTest { entry: string; name: string; }

/** 递归发现当前包 tests 下的原生入口，忽略辅助文件和符号链接。 */
export function discoverNativeTests(packageRoot: string): NativeTest[] {
  const entries: string[] = [];
  function visit(directory: string): void {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.isFile() && item.name.endsWith(".native.ts")) entries.push(path);
    }
  }
  visit(resolve(packageRoot, "tests"));
  entries.sort();
  if (entries.length === 0) throw new Error("No *.native.ts test entries found");
  const names = new Set<string>();
  return entries.map((entry) => {
    const name = basename(entry, ".native.ts");
    // 输出名大小写不敏感地比较，以兼容 macOS 等文件系统。
    if (!name || name.startsWith(".") || names.has(name.toLowerCase())) throw new Error(`Invalid or conflicting native test output: ${entry}`);
    names.add(name.toLowerCase());
    return { entry, name };
  });
}

function main(): void {
  const [operation, ...extra] = process.argv.slice(2);
  if ((operation !== "coverage" && operation !== "build") || extra.length !== 0) throw new Error("Usage: nativeTests.ts coverage|build");
  const packageRoot = process.cwd();
  // 所有入口先校验，再执行，避免冲突发生时留下部分新产物。
  const tests = discoverNativeTests(packageRoot);
  for (const test of tests) {
    console.log(`[native:${operation}] ${test.name}`);
    const args = [join(import.meta.dirname, "compileNative.ts"), operation, test.entry];
    if (operation === "build") args.push(resolve(packageRoot, ".scriptc", test.name));
    const result = spawnSync(process.execPath, args, { cwd: packageRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(`Native ${operation} failed: ${test.name}${result.signal ? ` (${result.signal})` : ""}`);
      process.exit(result.status ?? 1);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main();
