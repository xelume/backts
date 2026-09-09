import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discoverNativeTests } from "../../scripts/nativeTests.ts";

test("native discovery finds nested entries and rejects empty or conflicting outputs", () => {
  const root = mkdtempSync(join(tmpdir(), "native-discovery-"));
  try {
    const directory = join(root, "tests");
    mkdirSync(join(directory, "nested"), { recursive: true });
    writeFileSync(join(directory, "helper.ts"), "");
    assert.throws(() => discoverNativeTests(root), /No .*test entries/);
    writeFileSync(join(directory, "z.native.ts"), "");
    writeFileSync(join(directory, "nested", "a.native.ts"), "");
    assert.deepEqual(discoverNativeTests(root).map((entry) => entry.name), ["a", "z"]);
    writeFileSync(join(directory, "A.native.ts"), "");
    assert.throws(() => discoverNativeTests(root), /conflicting/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
