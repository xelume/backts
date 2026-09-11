import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { API, DiagnosticCategory } from "typescript/unstable/sync";
import * as ts from "typescript/unstable/ast";
import { findEmptyRouteCall } from "./routeLowering";
/** 原生编译输入；cwd 是应用包目录，output 相对于 cwd。 */
export interface CompileOptions {
  operation: "build" | "coverage";
  entry: string;
  output?: string;
  cwd?: string;
}

// scriptc 0.0.36 的 bare npm import 不能保留此框架所需的 TS 类型。
// 整理静态源码依赖，并适配框架纯 void 路由；裸包名必须经 Node 的公开 exports 解析。

/** 经公开 exports 整理静态 TS 源码后调用固定版本 scriptc；返回编译退出码。 */
export async function compileNative(options: CompileOptions): Promise<number> {
  const { operation, entry, output } = options;
  const cwd = resolve(options.cwd ?? process.cwd());
  if (operation === "build" && !output) throw new Error("Build output is required");
  const sourceEntry = realpathSync(resolve(cwd, entry));
  const key = createHash("sha256").update(sourceEntry).digest("hex").slice(0, 12);
  const stage = resolve(cwd, ".scriptc", "inputs", key);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  writeFileSync(resolve(stage, "package.json"), '{"private":true,"type":"module"}\n');
  const configuration = { compilerOptions: { target: "ES2022", lib: ["ES2022"], module: "ESNext", moduleResolution: "Bundler", strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, isolatedModules: true, noEmit: true, types: ["node"] } };
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
      const project = snapshot.getDefaultProjectForFile(source);
      const syntax = project?.program.getSourceFile(source);
      if (!syntax || !project) throw new Error(`Cannot parse TypeScript source: ${source}`);
      const edits: { start: number; end: number; text: string }[] = [];
      const nativeImports = new Map<string, string>();
      let nextImport = 0;
      function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
          const route = findEmptyRouteCall(node, syntax!, project!.checker);
          if (route !== undefined) {
            const adapter = realpathSync(createRequire(resolve(route.packageRoot, "package.json")).resolve("@backts/framework/native"));
            const dependency = copySource(adapter);
            let identifier = nativeImports.get(dependency);
            if (identifier === undefined) {
              do { identifier = `__backtsEmptyRoute${nextImport++}`; } while (contents.includes(identifier));
              nativeImports.set(dependency, identifier);
            }
            edits.push({ start: route.start, end: route.end, text: `${identifier}(${JSON.stringify(route.method)}, ` });
          }
        }
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
      if (nativeImports.size > 0) {
        // 适配会替换泛型调用，先检查原始源码，避免掩盖业务的参数/类型错误。
        const errors = project.program.getSemanticDiagnostics(source).filter((item) => item.category === DiagnosticCategory.Error);
        if (errors.length > 0) {
          throw new Error(errors.map((item) => {
            const position = syntax.getLineAndCharacterOfPosition(item.pos);
            return `${source}:${position.line + 1}:${position.character + 1} TS${item.code}: ${item.text}`;
          }).join("\n"));
        }
      }
      let rewritten = contents;
      for (const edit of edits.sort((left, right) => right.start - left.start)) {
        rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
      }
      for (const [dependency, identifier] of nativeImports) {
        rewritten += `\nimport { emptyRoute as ${identifier} } from "./${dependency.slice(0, -3)}";\n`;
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
  if (operation === "build") args.push("-o", resolve(cwd, output!));
  const compilerPackage = createRequire(import.meta.url).resolve("scriptc/package.json");
  const compiler = resolve(dirname(compilerPackage), "dist/bootstrap.js");
  if (operation === "build") mkdirSync(dirname(resolve(cwd, output!)), { recursive: true });
  // 保留完整输出用于静态分析判定，并还原诊断中的临时路径。
  function restorePaths(text: string): string {
    for (const [name, source] of Object.entries(mappings)) text = text.replaceAll(resolve(stage, name), source);
    return text;
  }
  return await new Promise<number>((accept, reject) => {
    const child = spawn(process.execPath, [compiler, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => {
      process.stdout.write(restorePaths(stdout));
      process.stderr.write(restorePaths(stderr));
      if (operation === "coverage" && !stdout.includes("fully static — this program has no dynamic remainder.")) accept(1);
      else accept(status ?? 1);
    });
  });
}
