import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Command, Option } from "commander";
import { cancel, intro, select, text } from "@clack/prompts";
import { basicTemplateDirectory, cliVersion } from "../runtime/packageInfo";
import { run } from "../runtime/processes";

interface CreateOptions {
  directory?: string;
  pm?: string;
  skipInstall?: boolean;
  yes?: boolean;
}

export function registerCreateCommand(program: Command, complete: (code: number) => void): void {
  program.command("create")
    .description("Create a basic BackTS application")
    .argument("[directory]", "project directory (prompted in an interactive terminal)")
    .addOption(new Option("--pm <manager>", "package manager (detected from the environment)").choices(["npm", "pnpm"]))
    .option("--skip-install", "generate files without installing dependencies")
    .option("-y, --yes", "skip prompts; requires a project directory")
    .action(async (directory: string | undefined, options: CreateOptions) => {
      complete(await createApplication({ ...(directory ? { directory } : {}), ...options }));
    });
}

async function createApplication(options: CreateOptions): Promise<number> {
  const project = await resolveProject(options);
  if (project === null) return 1;
  const { target, pm } = project;
  writeTemplate(target, pm);
  console.log(`Created ${target}`);
  if (!options.skipInstall) {
    const status = await installDependencies(target, pm);
    if (status !== 0) return status;
  }
  console.log(`\nNext steps:\n  cd ${JSON.stringify(target)}${options.skipInstall ? `\n  ${pm} install --ignore-scripts` : ""}\n  ${pm} run dev\n\nRequires Node 24+, clang and the platform SDK. Run ${pm} exec backts doctor to check.`);
  return 0;
}

function directoryIssue(directory: string): string | undefined {
  const target = resolve(directory);
  const name = basename(target);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || name.length > 214 || ["node_modules", "favicon.ico"].includes(name)) {
    return "Project name must be a lowercase npm name (letters, digits, dots, hyphens or underscores).";
  }
  if (existsSync(target) && (lstatSync(target).isSymbolicLink() || !lstatSync(target).isDirectory() || readdirSync(target).length > 0)) {
    return `Target must be an empty directory: ${target}`;
  }
  return undefined;
}

async function resolveProject(options: CreateOptions): Promise<{ target: string; pm: string } | null> {
  let directory = options.directory;
  let pm = options.pm ?? (process.env["npm_config_user_agent"]?.startsWith("pnpm/") ? "pnpm" : "npm");
  if (pm !== "npm" && pm !== "pnpm") throw new Error("Package manager must be npm or pnpm");
  if (directory) {
    const issue = directoryIssue(directory);
    if (issue) throw new Error(issue);
  }
  if (process.stdin.isTTY && process.stdout.isTTY && !process.env["CI"] && !options.yes) {
    intro("Create a BackTS application");
    if (!directory) {
      const answer = await text({
        message: "Project directory",
        placeholder: "my-backts-app",
        defaultValue: "my-backts-app",
        validate: (value) => directoryIssue(value?.trim() || "my-backts-app"),
      });
      if (typeof answer === "symbol") {
        cancel("Project creation cancelled.");
        return null;
      }
      directory = answer.trim() || "my-backts-app";
    }
    if (!options.pm) {
      const answer = await select({
        message: "Package manager",
        initialValue: pm,
        options: [{ value: "npm", label: "npm" }, { value: "pnpm", label: "pnpm" }],
      });
      if (typeof answer === "symbol") {
        cancel("Project creation cancelled.");
        return null;
      }
      pm = answer;
    }
  }
  if (!directory) throw new Error("Provide a project directory: backts create my-api --pm npm");
  const issue = directoryIssue(directory);
  if (issue) throw new Error(issue);
  return { target: resolve(directory), pm };
}

function writeTemplate(target: string, pm: string): void {
  const name = basename(target);
  mkdirSync(target, { recursive: true });
  function copy(source: string, destination: string): void {
    for (const item of readdirSync(source, { withFileTypes: true })) {
      const from = join(source, item.name);
      const to = join(destination, item.name === "gitignore" ? ".gitignore" : item.name === "package.json.template" ? "package.json" : item.name);
      if (item.isDirectory()) {
        mkdirSync(to);
        copy(from, to);
      } else {
        const content = readFileSync(from, "utf8")
          .replaceAll("__PROJECT_NAME__", name)
          .replaceAll("__CLI_VERSION__", cliVersion)
          .replaceAll("__PM__", pm);
        writeFileSync(to, content, { flag: "wx" });
      }
    }
  }
  copy(basicTemplateDirectory, target);
}

async function installDependencies(target: string, pm: string): Promise<number> {
  console.log(`Installing dependencies with ${pm}…`);
  let status: number;
  try {
    status = await run(pm, ["install", "--ignore-scripts"], target);
  } catch (error) {
    console.error(`Installation failed: ${(error as Error).message}`);
    status = 1;
  }
  if (status !== 0) {
    console.error(`Project files are ready. Retry: cd ${JSON.stringify(target)} then ${pm} install --ignore-scripts`);
  }
  return status;
}
