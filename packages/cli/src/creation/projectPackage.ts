import type { ProjectVersions } from "./projectVersions";

interface ProjectPackage {
  name: string;
  version: string;
  private: boolean;
  type: string;
  engines: { node: string };
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

/** 两种模板共用项目清单；scriptc 由 CLI 安装，不加入应用直接依赖。 */
export function createProjectPackage(name: string, template: string, versions: ProjectVersions): ProjectPackage {
  if (template !== "basic" && template !== "framework") throw new Error(`Unknown template: ${template}`);
  return {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    engines: { ...versions.engines },
    scripts: {
      dev: "backts dev",
      build: "backts build",
      start: "backts start",
      typecheck: "tsc --noEmit",
      analyze: "backts analyze",
    },
    dependencies: {
      "@backts/core": versions.packages["@backts/core"],
      ...(template === "framework" ? { "@backts/framework": versions.packages["@backts/framework"] } : {}),
    },
    devDependencies: {
      "@backts/cli": versions.packages["@backts/cli"],
      "@types/node": versions.toolchain["@types/node"],
      typescript: versions.toolchain.typescript,
    },
  };
}
