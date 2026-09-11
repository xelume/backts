import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleNativeTests } from "../../packages/cli/src/native/testScheduler.ts";

const entries = ["a", "b", "c", "d"].map((name) => ({ name, entry: `${name}.native.ts` }));

test("native scheduler respects its bound and dispatches every entry once", async () => {
  for (const jobs of [1, 2, 8]) {
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    assert.equal(await scheduleNativeTests(entries, jobs, async ({ name }) => {
      seen.push(name);
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return 0;
    }), 0);
    assert.equal(peak, Math.min(jobs, entries.length));
    assert.deepEqual(seen, ["a", "b", "c", "d"]);
    assert.equal(active, 0);
  }
});

for (const kind of ["status", "exception"] as const) {
  test(`native scheduler drains in-flight work and stops dispatch after ${kind}`, async () => {
    const gates: { resolve: (status: number) => void; reject: (error: Error) => void }[] = [];
    let finished = false;
    const pending = scheduleNativeTests(entries, 2, () => new Promise<number>((resolve, reject) => gates.push({ resolve, reject })));
    const outcome = pending.then((status) => { finished = true; return status; }, (error: unknown) => { finished = true; return error; });
    assert.equal(gates.length, 2);
    const error = new Error("compile failed");
    if (kind === "status") gates[1]!.resolve(7);
    else gates[1]!.reject(error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    assert.equal(gates.length, 2);
    gates[0]!.resolve(0);
    assert.equal(await outcome, kind === "status" ? 7 : error);
    assert.equal(gates.length, 2);
  });
}

test("native scheduler rejects invalid concurrency before starting work", async () => {
  for (const jobs of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(scheduleNativeTests(entries, jobs, async () => { assert.fail("must not start"); }), /positive safe integer/);
  }
});
