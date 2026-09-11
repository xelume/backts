import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { SignatureKind, SymbolFlags, TypeFlags, isTypeReference, type Checker, type Type } from "typescript/unstable/sync";
import * as ts from "typescript/unstable/ast";

/** 一处原生路由调用适配；保留路径、处理器及配置的原始求值顺序。 */
export interface EmptyRouteCall {
  method: string;
  packageRoot: string;
  start: number;
  end: number;
}

const methods = new Map<string, string>([
  ["get", "GET"], ["post", "POST"], ["put", "PUT"], ["patch", "PATCH"],
  ["del", "DELETE"], ["head", "HEAD"], ["options", "OPTIONS"],
]);

/** 只识别框架实际导出的函数与纯 void/undefined 返回类型，不按调用拼写猜测。 */
export function findEmptyRouteCall(node: ts.CallExpression, source: ts.SourceFile, checker: Checker): EmptyRouteCall | undefined {
  if (node.arguments.length < 2 || node.arguments.some(ts.isSpreadElement)) return undefined;
  const symbol = checker.getSymbolAtLocation(node.expression);
  if (symbol === undefined) return undefined;
  const imported = (symbol.flags & SymbolFlags.Alias) !== 0;
  if (!imported) {
    // 只允许 namespace import 的静态成员，不能抹掉普通对象 getter 的求值。
    if (!ts.isPropertyAccessExpression(node.expression) || !ts.isIdentifier(node.expression.expression)) return undefined;
    const namespace = checker.getSymbolAtLocation(node.expression.expression);
    if (!namespace?.declarations.some((item) => item.kind === ts.SyntaxKind.NamespaceImport)) return undefined;
  }
  const target = imported ? checker.getAliasedSymbol(symbol) : symbol;
  const method = methods.get(target.name);
  const declaration = target.valueDeclaration;
  if (method === undefined || declaration === undefined) return undefined;
  const declaredNode = declaration.resolve();
  if (declaredNode === undefined) return undefined;
  const path = realpathSync(declaredNode.getSourceFile().fileName);
  const packageRoot = dirname(dirname(path));
  const manifest = join(packageRoot, "package.json");
  if (relative(packageRoot, path) !== "src/functionalController.ts" || !existsSync(manifest)) return undefined;
  const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
  if (pkg.name !== "@backts/framework") return undefined;
  const handler = checker.getTypeAtLocation(node.arguments[1]!);
  if (handler === undefined) return undefined;
  const signatures = checker.getSignaturesOfType(handler, SignatureKind.Call);
  if (signatures.length !== 1) return undefined;
  const result = checker.getReturnTypeOfSignature(signatures[0]!);
  if (result === undefined || !isEmptyResult(result, checker)) return undefined;
  return { method, packageRoot, start: node.expression.getStart(source), end: node.arguments.pos };
}

function isEmptyResult(type: Type, checker: Checker): boolean {
  if (type.flags & (TypeFlags.Void | TypeFlags.Undefined)) return true;
  if (type.isUnionType()) return type.getTypes()!.every((part) => isEmptyResult(part, checker));
  if (isTypeReference(type) && type.getTarget().getSymbol()?.name === "Promise") {
    const arguments_ = checker.getTypeArguments(type);
    return arguments_.length === 1 && isEmptyResult(arguments_[0]!, checker);
  }
  return false;
}
