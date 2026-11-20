import type { CellResult } from "./run.ts";
import type { Selection } from "./selection.ts";

const missingHarness = (cell: CellResult) =>
  cell.failure?.kind === "check" && cell.failure.key === "capture.notInstalled";

// A harness that isn't installed fails the layers the run named and is skipped in a run that named none, so
// `ctxray test` on a fresh machine passes what it can and says what to add.
export const settleMissing = (results: readonly CellResult[], selection: Pick<Selection, "chosen">): CellResult[] =>
  results.map((cell): CellResult => {
    if (selection.chosen && cell.check === "context" && cell.reason === "unavailable") {
      const { reason: _, missing, ...rest } = cell;
      const binary = missing?.[0] ?? cell.harness;
      return {
        ...rest,
        status: "failed",
        attempts: 1,
        failure: { kind: "check", key: "capture.notInstalled", params: { harness: cell.harness, binary }, lines: [] },
      };
    }
    if (selection.chosen || !missingHarness(cell)) return cell;
    const { failure: _, ...rest } = cell;
    const binary = cell.failure?.kind === "check" ? String(cell.failure.params?.["binary"] ?? cell.harness) : "";
    return { ...rest, status: "skipped", reason: "unavailable", missing: [binary], attempts: 0 };
  });
