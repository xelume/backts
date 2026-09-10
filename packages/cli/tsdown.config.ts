import { defineConfig, type UserConfig } from "tsdown";

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
});

export default config;
