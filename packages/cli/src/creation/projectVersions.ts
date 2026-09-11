/** CLI 发布时固化的项目依赖组合；只记录直接依赖，不替代应用 lockfile。 */
export interface ProjectVersions {
  packages: {
    "@backts/core": string;
    "@backts/framework": string;
    "@backts/cli": string;
  };
  toolchain: {
    typescript: string;
    scriptc: string;
    "@types/node": string;
  };
  engines: { node: string };
}
