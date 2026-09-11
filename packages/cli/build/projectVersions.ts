import { readFileSync } from "node:fs";
import type { ProjectVersions } from "../src/creation/projectVersions.ts";

/** 仅构建与发布检查使用：读取仓库包元数据，不读取其他包的实现。 */
export function readProjectVersions(root: URL): ProjectVersions {
  const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const cli = read("packages/cli/package.json");
  const core = read("packages/core/package.json");
  const framework = read("packages/framework/package.json");
  const workspace = read("package.json");
  const exact = (name: string, version: unknown): string => {
    if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error(`${name} must declare an exact version, received ${String(version)}`);
    }
    return version;
  };
  if (typeof cli.engines?.node !== "string" || !cli.engines.node.trim()) {
    throw new Error("@backts/cli must declare engines.node");
  }
  return {
    packages: {
      "@backts/core": exact("@backts/core", core.version),
      "@backts/framework": exact("@backts/framework", framework.version),
      "@backts/cli": exact("@backts/cli", cli.version),
    },
    toolchain: {
      typescript: exact("typescript", cli.dependencies?.typescript),
      scriptc: exact("scriptc", cli.dependencies?.scriptc),
      "@types/node": exact("@types/node", workspace.devDependencies?.["@types/node"]),
    },
    engines: { node: cli.engines.node },
  };
}
