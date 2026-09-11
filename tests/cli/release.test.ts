import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { checkTemplateReleases } from "../../scripts/checkChangesets.ts";
import { hasPackagesToPublish, releasePackages } from "../../scripts/releasePackages.ts";

test("version plans require all template consumers without forcing equal versions", () => {
  const plan = (names: string[]) => ({ releases: names.map((name) => ({ name, type: "patch" })) });
  assert.throws(() => checkTemplateReleases(plan(["@backts/core"])), /@backts\/framework/);
  assert.throws(() => checkTemplateReleases(plan(["@backts/framework"])), /@backts\/cli/);
  assert.throws(() => checkTemplateReleases(plan(["@backts/cli"])), /create-backts/);
  assert.throws(() => checkTemplateReleases({ releases: [{ name: "@backts/cli", type: "patch" }, { name: "create-backts", type: "none" }] }), /create-backts/);
  checkTemplateReleases(plan(["@backts/core", "@backts/framework", "@backts/cli", "create-backts"]));
  checkTemplateReleases(plan(["create-backts"]));
  checkTemplateReleases(plan([]));
});

test("publish plan rejects unsupported or malformed output", () => {
  for (const value of [null, {}, { version: 2, plan: [] }, { version: 1, plan: [{}] }, { version: 1, plan: [[{ kind: "unexpected" }]] }]) {
    assert.throws(() => hasPackagesToPublish(value));
  }
});

test("publishing checks new versions, preserves tag-only runs and cleans temporary files", () => {
  for (const kind of ["publish", "tag-only"]) {
    const calls: string[][] = [];
    let output = "";
    releasePackages((args) => {
      calls.push(args);
      if (args[1] === "publish-plan") {
        output = args[3]!;
        writeFileSync(output, JSON.stringify({ version: 1, plan: [[{ kind }]] }));
      }
    });
    assert.deepEqual(calls.slice(1), kind === "publish" ? [["release:check"], ["changeset", "publish"]] : [["changeset", "publish"]]);
    assert.equal(existsSync(output), false);
  }
});

test("failed plan query or verification never reaches publish", () => {
  for (const failure of ["publish-plan", "release:check"]) {
    const calls: string[][] = [];
    assert.throws(() => releasePackages((args) => {
      calls.push(args);
      if (args.includes(failure)) throw new Error("expected failure");
      if (args[1] === "publish-plan") writeFileSync(args[3]!, JSON.stringify({ version: 1, plan: [[{ kind: "publish" }]] }));
    }), /expected failure/);
    assert.equal(calls.some((args) => args[1] === "publish"), false);
  }
});
