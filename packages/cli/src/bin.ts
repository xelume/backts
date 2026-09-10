#!/usr/bin/env node
import { runCli } from "./index";
try { process.exitCode = await runCli(process.argv.slice(2)); }
catch (error) { console.error(`[backts] ${(error as Error).message}`); process.exitCode = 1; }
