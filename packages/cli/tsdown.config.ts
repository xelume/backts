import { defineConfig, type UserConfig } from "tsdown";
import { writeFileSync } from "node:fs";
import { readProjectVersions } from "./build/projectVersions.ts";

const config: UserConfig = defineConfig({
  entry: {
    bin: "src/bin.ts",
    index: "src/index.ts",
    compiler: "src/native/compiler.ts",
    testing: "src/native/tests.ts",
  },
  format: "esm",
  platform: "node",
  target: "node24",
  dts: true,
  onSuccess() {
    const versions = readProjectVersions(new URL("../../", import.meta.url));
    writeFileSync(new URL("./dist/projectVersions.json", import.meta.url), JSON.stringify(versions, null, 2) + "\n");
  },
});

export default config;
