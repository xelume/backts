import type { NativeTest } from "./tests";

/** 原生测试专用调度：首个失败停止派发，等待在途任务结束后返回或抛错。 */
export async function scheduleNativeTests(tests: NativeTest[], jobs: number, compile: (test: NativeTest) => Promise<number>): Promise<number> {
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error("jobs must be a positive safe integer");
  let next = 0;
  let failure: { status: number } | { error: unknown } | undefined;
  async function worker(): Promise<void> {
    while (failure === undefined && next < tests.length) {
      const test = tests[next++]!;
      try {
        const status = await compile(test);
        if (status !== 0 && failure === undefined) failure = { status };
      } catch (error) {
        if (failure === undefined) failure = { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, tests.length) }, () => worker()));
  if (failure && "error" in failure) throw failure.error;
  return failure?.status ?? 0;
}
