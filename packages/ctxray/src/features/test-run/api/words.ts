import { relative } from "node:path";
import type { Layer } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { CellResult } from "../lib/run.ts";

// What the views need to word things: the translator and redaction, both already set for the run.
export type Words = {
  t: Translate; // its output is redacted already
  clean: (text: string) => string; // redacts text that didn't come from the catalog, like an error message
  cwd: string;
};

export const LAYER_WORDS: Record<Layer, string> = {
  L1: "lint",
  L2: "policy",
  L3: "resolve",
  L4: "assemble",
  L5: "wire",
  L6: "activate",
  L7: "scenario",
};

// Relative to where ctxray runs, or whole when it lies elsewhere: a chain of ../ reads worse than the path.
export const shown = (cwd: string, path: string) => {
  const near = relative(cwd, path) || ".";
  return near.startsWith("..") ? path : near;
};

// The group a row belongs to: its suites, or its file for tests outside any suite.
export const headingOf = (cell: CellResult, words: Words) => {
  if (cell.file === undefined) return words.t("test.checks");
  return cell.suites.length > 0 ? cell.suites.join(" › ") : shown(words.cwd, cell.file);
};

export const nameOf = (cell: CellResult, words: Words) => (cell.check === "lint" ? words.t("test.lint") : cell.name);
