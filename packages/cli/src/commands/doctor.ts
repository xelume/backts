import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Command } from "commander";

export function registerDoctorCommand(program: Command, complete: (code: number) => void): void {
  program.command("doctor")
    .description("Check Node, compiler dependencies, clang and the platform SDK")
    .action(() => {
      let ok = true;
      function report(label: string, valid: boolean, detail: string): void {
        console.log(`${valid ? "OK" : "FAIL"} ${label}: ${detail}`);
        ok &&= valid;
      }
      report("Node", Number(process.versions.node.split(".")[0]) >= 24, process.version);
      report("Platform", process.platform !== "win32", `${process.platform}/${process.arch}; validated on macOS ARM64`);
      const clang = spawnSync("clang", ["--version"], { encoding: "utf8" });
      report("clang", clang.status === 0, clang.error?.message ?? clang.stdout.split("\n")[0] ?? "missing");
      if (process.platform === "darwin") {
        const sdk = spawnSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" });
        report("macOS SDK", sdk.status === 0, sdk.stdout?.trim() || "Install Xcode Command Line Tools");
      }
      const require = createRequire(import.meta.url);
      for (const name of ["scriptc", "typescript"]) {
        try {
          const pkg = require(`${name}/package.json`) as { version: string };
          report(name, true, pkg.version);
        } catch {
          report(name, false, "Reinstall @backts/cli dependencies");
        }
      }
      complete(ok ? 0 : 1);
    });
}
