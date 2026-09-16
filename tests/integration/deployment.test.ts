import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expect, root, withServer } from "./nativeServer.ts";

test("copied build runs its API and public files without project sources", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "backts-deployment-"));
  const destination = join(temporary, "build");
  try {
    cpSync(join(root, "examples/todo/build"), destination, { recursive: true });
    await withServer(join(destination, "app"), async (port) => {
      const response = await expect(port, "GET", "/", 200);
      assert.deepEqual(response.rawBody, readFileSync(join(destination, "public/index.html")));
      await expect(port, "GET", "/health", 200);
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
