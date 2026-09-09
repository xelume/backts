import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { API } from "typescript/unstable/sync";
import * as ts from "typescript/unstable/ast";

// scriptc 0.0.36 的 bare npm import 不能保留此框架所需的 TS 类型。
// 仅整理静态源码依赖，不转译业务逻辑；裸包名必须经 Node 的公开 exports 解析。
const [operation, entry, output] = process.argv.slice(2);
if ((operation !== "build" && operation !== "coverage") || !entry || (operation === "build" && !output)) {
  throw new Error("Usage: compileNative.ts build|coverage entry.ts [output]");
}
const sourceEntry = realpathSync(resolve(entry));
const key = createHash("sha256").update(sourceEntry).digest("hex").slice(0, 12);
const stage = resolve(".scriptc", "inputs", key);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
writeFileSync(resolve(stage, "package.json"), '{"private":true,"type":"module"}\n');
const configuration = JSON.parse(readFileSync(resolve(dirname(import.meta.filename), "../tsconfig.base.json"), "utf8"));
writeFileSync(resolve(stage, "tsconfig.json"), JSON.stringify(configuration, null, 2));
const copied = new Map<string, string>();
const mappings: Record<string, string> = {};
const parser = new API();

function resolveSource(from: string, specifier: string): string {
  if (isAbsolute(specifier)) throw new Error(`Absolute source imports are not supported: ${specifier}`);
  if (!specifier.startsWith(".")) return realpathSync(createRequire(from).resolve(specifier));
  const path = resolve(dirname(from), specifier);
  // 相对路径只能引用同一包内源码，跨包依赖必须通过 exports。
  let packageRoot = dirname(from);
  while (!existsSync(resolve(packageRoot, "package.json"))) {
    const parent = dirname(packageRoot);
    if (parent === packageRoot) throw new Error(`Missing package scope: ${from}`);
    packageRoot = parent;
  }
  const offset = relative(packageRoot, path);
  if (offset === ".." || offset.startsWith(`..${sep}`)) throw new Error(`Cross-package relative import: ${specifier}`);
  const candidates = [path, `${path}.ts`, resolve(path, "index.ts")];
  const selected = candidates.find((candidate) => extname(candidate) === ".ts" && existsSync(candidate));
  if (!selected) throw new Error(`Cannot resolve TypeScript source: ${specifier} from ${from}`);
  return realpathSync(selected);
}

function copySource(source: string): string {
  const existing = copied.get(source);
  if (existing) return existing;
  if (!source.endsWith(".ts") || source.endsWith(".d.ts")) throw new Error(`Expected TypeScript implementation: ${source}`);
  const name = `module${copied.size}.ts`;
  copied.set(source, name);
  mappings[name] = source;
  const contents = readFileSync(source, "utf8");
  const snapshot = parser.updateSnapshot({ openFiles: [source] });
  try {
    const syntax = snapshot.getDefaultProjectForFile(source)?.program.getSourceFile(source);
    if (!syntax) throw new Error(`Cannot parse TypeScript source: ${source}`);
    const edits: { start: number; end: number; text: string }[] = [];
    function visit(node: ts.Node): void {
      if (ts.isImportEqualsDeclaration(node) || (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
         (ts.isIdentifier(node.expression) && node.expression.text === "require")))) {
        throw new Error(`Dynamic imports and require are not supported: ${source}`);
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const literal = node.moduleSpecifier;
        if (!ts.isStringLiteral(literal)) throw new Error(`Expected static module specifier: ${source}`);
        if (!literal.text.startsWith("node:")) {
          const dependency = copySource(resolveSource(source, literal.text));
          edits.push({ start: literal.getStart(syntax), end: literal.end, text: JSON.stringify(`./${dependency.slice(0, -3)}`) });
        }
      }
      node.forEachChild(visit);
    }
    visit(syntax);
    let rewritten = contents;
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
      rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
    }
    writeFileSync(resolve(stage, name), rewritten);
    return name;
  } finally {
    snapshot.dispose();
  }
}

let stagedEntry: string;
try {
  stagedEntry = resolve(stage, copySource(sourceEntry));
} finally {
  parser.close();
}
writeFileSync(resolve(stage, "sourceMap.json"), JSON.stringify(mappings, null, 2));
const args = [operation, stagedEntry];
if (operation === "build") args.push("-o", resolve(output!));
const result = spawnSync("scriptc", args, { encoding: "utf8" });
// 把诊断路径还原成源码路径；临时映射仅供本地诊断，不属于包产物。
function restorePaths(text: string): string {
  for (const [name, source] of Object.entries(mappings)) text = text.replaceAll(resolve(stage, name), source);
  return text;
}
process.stdout.write(restorePaths(result.stdout ?? ""));
process.stderr.write(restorePaths(result.stderr ?? ""));
if (result.error) throw result.error;
// coverage 的退出码不表示没有 blocker，防止 CI 静默接受动态回退。
if (operation === "coverage" && !(result.stdout ?? "").includes("fully static — this program has no dynamic remainder.")) process.exit(1);
process.exit(result.status ?? 1);
