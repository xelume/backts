import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { compileNative } from "./compiler";
import { availableParallelism } from "node:os";
import { scheduleNativeTests } from "./testScheduler";
/** 原生测试入口与稳定的二进制名称；同名输出禁止覆盖。 */
export interface NativeTest {
  entry: string;
  name: string;
}

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

/** 有限并发分析或构建；jobs 默认最多 2，1 为串行。失败后不派发新任务，等待在途任务结束。 */
export async function prepareNativeTests(operation: "build" | "coverage", packageRoot: string, jobs: number = Math.min(2, availableParallelism())): Promise<number> {
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error("jobs must be a positive safe integer");
  const tests = discoverNativeTests(packageRoot);
  return scheduleNativeTests(tests, jobs, async (test) => {
    console.log(`[native:${operation === "coverage" ? "analyze" : operation}] ${test.name}`);
    return compileNative({ operation, entry: test.entry, output: resolve(packageRoot, ".scriptc", test.name), cwd: packageRoot });
  });
}
