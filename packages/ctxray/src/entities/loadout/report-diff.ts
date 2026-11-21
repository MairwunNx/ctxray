import type { HarnessId, Report } from "#shared/contract/index.ts";
import type { LoadoutDiff } from "./diff.ts";

type ReportDiff = NonNullable<Report["base"]>["diffs"][number];

// A loadout diff as a report holds it: a piece that wasn't there or is gone has no number on that side.
export const toReportDiff = (harness: HarnessId, diff: LoadoutDiff): ReportDiff => ({
  harness,
  total: diff.total,
  byComponent: diff.byComponent,
  changes: diff.changes.map((change) => ({
    component: change.component,
    id: change.id,
    ...(change.before !== undefined && { before: change.before }),
    ...(change.after !== undefined && { after: change.after }),
  })),
});
