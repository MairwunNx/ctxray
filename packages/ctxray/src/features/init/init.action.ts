import { join } from "node:path";
import { CONFIG_PATH, CONFIG_TEMPLATE, TEST_PATH, TEST_TEMPLATE } from "./templates.ts";

export type InitOutcome = "created" | "overwritten" | "exists" | "ignoreAdded" | "ignorePresent";
export type InitStep = { readonly path: string; readonly outcome: InitOutcome };
export type InitAction = (options: { force: boolean }) => Promise<readonly InitStep[]>;

const IGNORED = ".ctxray/";

const exists = (path: string) => Bun.file(path).exists();

const writeFile = async (cwd: string, path: string, content: string, force: boolean): Promise<InitStep> => {
  const target = join(cwd, path);
  const existed = await exists(target);
  if (existed && !force) return { path, outcome: "exists" };
  await Bun.write(target, content);
  return { path, outcome: existed ? "overwritten" : "created" };
};

// Reports land in .ctxray/. An existing .gitignore learns to skip it, a missing one stays missing.
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
  async ({ force }) => {
    const [config, test, ignore] = await Promise.all([
      writeFile(cwd, CONFIG_PATH, CONFIG_TEMPLATE, force),
      writeFile(cwd, TEST_PATH, TEST_TEMPLATE, force),
      ignoreTraces(cwd),
    ]);
    return [config, test, ...ignore];
  };
createInitAction.inject = ["cwd"] as const;
