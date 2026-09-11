import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 与 toolkit 相同的 publish-plan v1 契约；格式不符时禁止继续发布。 */
export function hasPackagesToPublish(value: unknown): boolean {
  const plan = value as { version?: unknown; plan?: unknown } | null;
  assert(plan?.version === 1 && Array.isArray(plan.plan), "Unsupported Changesets publish plan");
  for (const group of plan.plan) {
    assert(Array.isArray(group), "Invalid Changesets publish plan group");
    for (const item of group) assert(item && ["publish", "tag-only"].includes(item.kind), "Invalid Changesets publish plan entry");
  }
  return plan.plan.flat().some((release) => release.kind === "publish");
}

/** 通过命令边界测试发布顺序与失败行为；正式执行仅由 CI 调用。 */
export function releasePackages(run: (args: string[]) => void): void {
  const temporary = mkdtempSync(join(tmpdir(), "backts-release-"));
  const output = join(temporary, "publish-plan.json");
  try {
    run(["changeset", "publish-plan", "--output", output]);
    if (hasPackagesToPublish(JSON.parse(readFileSync(output, "utf8")))) run(["release:check"]);
    else console.log("No unpublished packages; skipping release checks.");
    // 即使无需上传，也让 Changesets 输出 Action 发布结果并补齐 Git tag。
    run(["changeset", "publish"]);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (import.meta.main) {
  assert(process.env["GITHUB_ACTIONS"] === "true" && process.env["GITHUB_REF"] === "refs/heads/main", "Formal releases must run in GitHub Actions on main");
  releasePackages((args) => {
    execFileSync("pnpm", args, { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit" });
  });
}
