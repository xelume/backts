import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compileNative } from "@backts/cli/compiler";
import { root } from "../integration/nativeServer.ts";

test("void route lowering follows exports, preserves argument evaluation and leaves unrelated functions alone", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "backts-void-routes-"));
  try {
    writeFileSync(join(cwd, "package.json"), '{"private":true,"type":"module"}');
    writeFileSync(join(cwd, "tsconfig.json"), readFileSync(`${root}packages/cli/templates/framework/tsconfig.json`));
    mkdirSync(join(cwd, "node_modules/@backts"), { recursive: true });
    symlinkSync(`${root}node_modules/@types`, join(cwd, "node_modules/@types"));
    for (const name of ["core", "framework"]) symlinkSync(`${root}packages/${name}`, join(cwd, "node_modules/@backts", name));
    writeFileSync(join(cwd, "routes.ts"), 'export { del as remove } from "@backts/framework";');
    const source = `import { remove } from "./routes";
import * as http from "@backts/framework";
import { controller, createApplication, defineModule, type RouteOptions } from "@backts/framework";
import type { HttpContext } from "@backts/core";
const events: string[] = [];
function path(): string { events.push("path"); return "/item"; }
function handler(): (context: HttpContext) => void { events.push("handler"); return (_context) => { events.push("request"); }; }
function options(): RouteOptions<void> { events.push("options"); return {}; }
const route = remove(path(), handler(), options());
const namespaceRoute = http.del("/namespace", async (_context) => {});
function del(path: string, action: () => void): number { action(); return path.length; }
const length = del("local", () => { events.push("local"); });
createApplication({ module: defineModule({ name: "Test", controllers: [controller({ routes: [route, namespaceRoute] })] }) });
if (length !== 5 || events.join(",") !== "path,handler,options,local") throw new Error("Evaluation changed");
console.log("PASS route lowering");
`;
    const entry = join(cwd, "main.ts");
    writeFileSync(entry, source);
    assert.equal(await compileNative({ operation: "build", entry, output: ".scriptc/app", cwd }), 0);
    const result = spawnSync(join(cwd, ".scriptc/app"), [], { encoding: "utf8", timeout: 8000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS route lowering/);
    assert.equal(readFileSync(entry, "utf8"), source, "never modify business sources");
    const stage = join(cwd, ".scriptc/inputs", readdirSync(join(cwd, ".scriptc/inputs"))[0]!);
    const staged = readFileSync(join(stage, "module0.ts"), "utf8");
    assert.match(staged, /del\("local"/);
    assert.match(staged, /emptyRoute as/);
    writeFileSync(entry, 'import { del } from "@backts/framework";\ndel(123, () => {});');
    await assert.rejects(compileNative({ operation: "build", entry, output: ".scriptc/invalid", cwd }), /main\.ts:2:.*TS2345/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
