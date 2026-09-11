import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 校验 Changesets 版本计划中的模板消费者，不创建虚假的运行时依赖。 */
export function checkTemplateReleases(plan: { releases: { name: string; type: string }[] }): void {
  assert(Array.isArray(plan.releases), "Invalid Changesets release plan");
  const names = new Set(plan.releases.filter((release) => release.type !== "none").map((release) => release.name));
  const requireRelease = (source: string, consumer: string) => {
    if (names.has(source)) assert(names.has(consumer), `Add ${consumer} to a changeset: it consumes the released ${source}`);
  };
  requireRelease("@backts/core", "@backts/framework");
  requireRelease("@backts/core", "@backts/cli");
  requireRelease("@backts/framework", "@backts/cli");
  requireRelease("@backts/cli", "create-backts");
}

if (import.meta.main) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const pending = readdirSync(join(root, ".changeset")).some((file) => file.endsWith(".md") && file !== "README.md");
  // Release PR 已消费 changeset；其版本与产物由 release:check 验证。
  if (pending) {
    const temporary = mkdtempSync(join(tmpdir(), "backts-changesets-"));
    try {
      const output = join(temporary, "status.json");
      execFileSync("pnpm", ["changeset", "status", "--output", output], { cwd: root, stdio: "inherit" });
      checkTemplateReleases(JSON.parse(readFileSync(output, "utf8")));
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
}
