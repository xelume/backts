#!/usr/bin/env node
import { runCli } from "@backts/cli";

const args = process.argv.slice(2);
try {
  process.exitCode = await runCli(args[0] === "--version" ? args : ["create", ...args]);
} catch (error) {
  console.error(`[backts] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
