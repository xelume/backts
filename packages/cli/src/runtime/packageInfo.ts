import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 构建入口与共享 chunk 均输出到 dist 根目录，资源相对于产物定位。
export const cliBin: string = fileURLToPath(new URL("./bin.mjs", import.meta.url));
export const basicTemplateDirectory: string = fileURLToPath(new URL("../templates/basic/", import.meta.url));
export const frameworkTemplateDirectory: string = fileURLToPath(new URL("../templates/framework/", import.meta.url));
export const cliVersion: string = (JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string }).version;
