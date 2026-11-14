import { join } from "node:path";
import { CONFIG_PATH, CONFIG_TEMPLATE, TEST_PATH, testTemplate } from "./templates.ts";

export type InitOutcome = "created" | "overwritten" | "exists" | "ignoreAdded" | "ignorePresent";
export type InitStep = { readonly path: string; readonly outcome: InitOutcome };
export type InitAction = (options: { force: boolean }) => Promise<readonly InitStep[]>;

const IGNORED = ".ctxray/";

const exists = (path: string) => Bun.file(path).exists();

// Prefers AGENTS.md, the file most harnesses read, unless the project only has CLAUDE.md.
const rootRulesFile = async (cwd: string) =>
  (await exists(join(cwd, "CLAUDE.md"))) && !(await exists(join(cwd, "AGENTS.md"))) ? "CLAUDE.md" : "AGENTS.md";

const writeFile = async (cwd: string, path: string, content: string, force: boolean): Promise<InitStep> => {
  const target = join(cwd, path);
  const existed = await exists(target);
  if (existed && !force) return { path, outcome: "exists" };
  await Bun.write(target, content);
  return { path, outcome: existed ? "overwritten" : "created" };
};

// Traces and reports land in .ctxray/. An existing .gitignore learns to skip it, a missing one stays missing.
const ignoreTraces = async (cwd: string): Promise<InitStep[]> => {
  const path = ".gitignore";
  const file = Bun.file(join(cwd, path));
  if (!(await file.exists())) return [];
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => line === IGNORED || line === "/.ctxray/" || line === ".ctxray")) {
    return [{ path, outcome: "ignorePresent" }];
  }
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  await Bun.write(file, `${text}${separator}${IGNORED}\n`);
  return [{ path, outcome: "ignoreAdded" }];
};

export const createInitAction =
  (cwd: string): InitAction =>
  async ({ force }) => [
    await writeFile(cwd, CONFIG_PATH, CONFIG_TEMPLATE, force),
    await writeFile(cwd, TEST_PATH, testTemplate(await rootRulesFile(cwd)), force),
    ...(await ignoreTraces(cwd)),
  ];
createInitAction.inject = ["cwd"] as const;
