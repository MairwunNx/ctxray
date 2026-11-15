import { join } from "node:path";
import type { Project } from "#entities/harness/index.ts";
import { registerDeclarative } from "./declarative.ts";
import { type Collector, withCollector } from "./dsl.ts";
import type { TestDefinition } from "./model.ts";

export const TEST_FILE = /(^|\/)[^/]+\.ctxray\.(?:[mc]?[jt]s|jsonc?)$/;
const DECLARATIVE = /\.jsonc?$/;

// Test files under `dir` (relative to the root, "" for all), as the repository holds them: what .gitignore
// hides, node_modules included, stays out.
export const findTestFiles = (project: Project, dir: string): string[] =>
  project.files
    .filter((path) => TEST_FILE.test(path) && (dir === "" || path.startsWith(`${dir}/`)))
    .map((path) => join(project.root, path));

export type Collected = { file: string; tests: TestDefinition[]; error?: unknown };

// Imports one test file and keeps what it registered. The query makes a second run in the same process
// import the file afresh. It has to follow a plain path: Bun drops the query of a file:// URL.
export const collectFile = async (file: string, run: string): Promise<Collected> => {
  const collector: Collector = { file, frames: [], tests: [], pending: [] };
  try {
    await withCollector(collector, async () => {
      if (DECLARATIVE.test(file)) registerDeclarative(await Bun.file(file).text());
      else await import(`${file}?run=${run}`);
      const [error] = (await Promise.all(collector.pending)).filter((settled) => settled !== undefined);
      if (error !== undefined) throw error;
    });
    return { file, tests: collector.tests };
  } catch (error) {
    return { file, tests: [], error };
  }
};

// The project's own copy of the package only gives types: the binary serves its API to the tests (ADR 0001).
// A different version there may type-check code this binary doesn't run, so ctxray says so.
export const installedVersion = async (dir: string): Promise<string | undefined> => {
  for (let at = dir; ; at = join(at, "..")) {
    const file = Bun.file(join(at, "node_modules/@mairwunnx/ctxray/package.json"));
    if (await file.exists()) return ((await file.json()) as { version?: string }).version;
    if (join(at, "..") === at) return undefined;
  }
};
