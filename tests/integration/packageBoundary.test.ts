import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { root } from "./nativeServer.ts";

function imports(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return imports(path);
    if (!path.endsWith(".ts")) return [];
    // 检查当前源码使用的静态 import/export-from，不引入额外解析器依赖。
    return Array.from(readFileSync(path, "utf8").matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
  });
}

test("framework owns no application imports and exposes only its public entry", () => {
  for (const specifier of imports(`${root}packages/core/src`)) {
    assert(specifier.startsWith("./") || specifier.startsWith("node:"), `Unexpected framework dependency: ${specifier}`);
  }
  const requireFromExample = createRequire(`${root}examples/todo/package.json`);
  assert.equal(requireFromExample.resolve("@backts/core"), `${root}packages/core/src/index.ts`);
  assert.throws(() => requireFromExample.resolve("@backts/core/src/http/application"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  const exampleImports = imports(`${root}examples/todo/src`);
  assert(exampleImports.includes("@backts/core"));
  for (const specifier of exampleImports) {
    assert(!specifier.includes("packages/core") && !specifier.startsWith("@backts/core/"), `Private framework import: ${specifier}`);
  }
});
