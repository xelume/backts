import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readProjectVersions } from "../packages/cli/build/projectVersions.ts";

/** 检查打包使用的清单与当前版本声明一致；版本递增由 Changesets 负责。 */
export function checkProjectVersions(root: URL): void {
  const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  assert.deepEqual(read("packages/cli/dist/projectVersions.json"), readProjectVersions(root), "Project versions are stale; rebuild CLI after versioning");
  assert.equal(read("packages/framework/package.json").dependencies["@backts/core"], "workspace:*", "framework must publish an exact core dependency through workspace:*");
  assert.equal(read("packages/createBackts/package.json").dependencies["@backts/cli"], "workspace:*", "create-backts must publish an exact CLI dependency through workspace:*");
}

if (import.meta.main) checkProjectVersions(new URL("../", import.meta.url));
