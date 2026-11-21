import { isAbsolute, relative, resolve } from "node:path";
import { findRoot, openProject, rootPieces, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import { diffPieces } from "#entities/loadout/index.ts";
import { type HarnessId, Report } from "#shared/contract/index.ts";
import type { MessageKey, Params } from "#shared/i18n/index.ts";
import type { DiffResult, HarnessDiff } from "./diff.action.ts";

// A report.json that can't serve as the base, with the message that says why.
export class SavedReportProblem extends Error {
  readonly key: MessageKey;
  readonly params: Params;
  constructor(key: MessageKey, params: Params) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

const readReport = async (path: string, shown: string) => {
  const handle = Bun.file(path);
  if (!(await handle.exists())) throw new SavedReportProblem("diff.noReport", { file: shown });
  const raw = await handle.json().catch(() => undefined);
  const parsed = Report.safeParse(raw);
  if (!parsed.success) throw new SavedReportProblem("diff.badReport", { file: shown });
  return parsed.data;
};

export type DiffFileRequest = { file: string; harnesses?: readonly HarnessId[] | undefined };

// `ctxray diff --file report.json`: the loadout L3 predicts now against the one a past run, here or in CI, kept
// in its report. Harnesses default to the report's own.
export const createDiffFileAction =
  (cwd: string) =>
  async ({ file, harnesses }: DiffFileRequest): Promise<DiffResult> => {
    const path = resolve(cwd, file);
    const near = relative(cwd, path);
    const shown = near === "" || near.startsWith("..") || isAbsolute(near) ? path : near;
    const report = await readReport(path, shown);
    const saved = new Map(report.harnesses.flatMap((one) => (one.loadout ? [[one.id, one.loadout] as const] : [])));
    if (saved.size === 0) throw new SavedReportProblem("diff.noLoadout", { file: shown, version: report.ctxray });
    const { root } = await findRoot(cwd);
    const project = await openProject(root);
    const diffs: HarnessDiff[] = [];
    const missing: HarnessId[] = [];
    for (const harness of harnesses ?? [...saved.keys()]) {
      const before = saved.get(harness);
      const adapter = STATIC_ADAPTERS[harness];
      const now = adapter && rootPieces(harness, await adapter.discover(project));
      if (before && now) diffs.push({ harness, diff: diffPieces(before, now) });
      else missing.push(harness);
    }
    return { base: shown, createdAt: report.createdAt, diffs, missing };
  };
createDiffFileAction.inject = ["cwd"] as const;
export type DiffFileAction = ReturnType<typeof createDiffFileAction>;
