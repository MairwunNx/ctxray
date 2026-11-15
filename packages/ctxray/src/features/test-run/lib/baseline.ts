import { join } from "node:path";
import type { Finding, Problem } from "#entities/harness/index.ts";
import type { CellResult } from "./run.ts";

export const BASELINE_FILE = "ctxray.baseline.json";
const VERSION = 1;

type Entry = { harness: string; check: string; key: string; path?: string | undefined; params: string };
type BaselineFile = { schemaVersion: number; findings: Entry[] };

// What identifies a finding across runs: no line number, which moves with every edit above it.
const entryOf = (cell: CellResult, item: Problem | Finding): Entry => ({
  harness: cell.harness,
  check: cell.check ?? "",
  key: item.key,
  ...("path" in item && { path: item.path }),
  params: JSON.stringify(item.params, Object.keys(item.params).sort()),
});
const fingerprint = (entry: Entry) =>
  [entry.harness, entry.check, entry.key, entry.path ?? "", entry.params].join("\u0000");

const itemsOf = (cell: CellResult): readonly (Problem | Finding)[] => {
  if (cell.failure?.kind === "problems") return cell.failure.problems;
  if (cell.failure?.kind === "findings") return cell.failure.findings;
  return [];
};

const isCheck = (cell: CellResult) => cell.check === "lint" || cell.check === "policy";

// `ctxray baseline`: every L1 and L2 finding of now, so the next runs fail only on new ones.
export const writeBaseline = async (root: string, results: readonly CellResult[]): Promise<number> => {
  const findings = results.filter(isCheck).flatMap((cell) => itemsOf(cell).map((item) => entryOf(cell, item)));
  const unique = [...new Map(findings.map((entry) => [fingerprint(entry), entry])).values()].sort((a, b) =>
    fingerprint(a).localeCompare(fingerprint(b)),
  );
  const file: BaselineFile = { schemaVersion: VERSION, findings: unique };
  await Bun.write(join(root, BASELINE_FILE), `${JSON.stringify(file, null, 2)}\n`);
  return unique.length;
};

export const loadBaseline = async (root: string): Promise<ReadonlySet<string> | undefined> => {
  const handle = Bun.file(join(root, BASELINE_FILE));
  if (!(await handle.exists())) return undefined;
  const file = (await handle.json()) as BaselineFile;
  return new Set(file.schemaVersion === VERSION ? file.findings.map(fingerprint) : []);
};

// The cells of L1 and L2 without what the baseline knows. A cell whose errors were all known passes.
export const applyBaseline = (results: CellResult[], known: ReadonlySet<string>): number => {
  let matched = 0;
  for (const [index, cell] of results.entries()) {
    if (!isCheck(cell) || !cell.failure) continue;
    const items = itemsOf(cell);
    const fresh = items.filter((item) => !known.has(fingerprint(entryOf(cell, item))));
    matched += items.length - fresh.length;
    if (fresh.length === items.length) continue;
    const errors = fresh.filter((item) => !("severity" in item) || item.severity === "error");
    const kept =
      fresh.length === 0
        ? {}
        : {
            failure:
              cell.failure.kind === "problems"
                ? { kind: "problems" as const, problems: fresh as Problem[] }
                : { kind: "findings" as const, findings: fresh as Finding[] },
          };
    const warnings = cell.check === "lint" ? fresh.length - errors.length : cell.status === "passed" ? fresh.length : 0;
    const { failure: _, warnings: __, ...rest } = cell;
    results[index] = {
      ...rest,
      ...kept,
      status: cell.check === "policy" && cell.status === "passed" ? "passed" : errors.length > 0 ? "failed" : "passed",
      ...(warnings > 0 && { warnings }),
    };
  }
  return matched;
};
