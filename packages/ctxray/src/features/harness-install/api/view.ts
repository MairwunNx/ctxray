import type { Progress } from "#entities/harness-cache/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, span, type View } from "#shared/render/index.ts";
import type { LockChange } from "../add.action.ts";
import type { InstallOutcome, InstallResult } from "../install.action.ts";
import type { ListedHarness } from "../list.action.ts";
import { bytes, lockedText, seconds } from "./format.ts";

export const progressView = (harness: HarnessId, progress: Progress, t: Translate): View => {
  if (progress.phase === "waiting") return [[span(` ${t("harness.waiting", { harness })}`, "muted")]];
  if (progress.phase === "unpack") return [[span(` ${t("harness.unpacking", { harness })}`, "muted")]];
  const { done, total } = progress;
  const part =
    total === undefined
      ? bytes(done, t)
      : `${Math.floor((done / total) * 100)}%  ${bytes(done, t)} / ${bytes(total, t)}`;
  return [[span(` ${t("harness.downloading", { harness })}  `), span(part, "muted")]];
};

export const addView = (lockPath: string, changes: readonly LockChange[], t: Translate): View => [
  ...columns(
    changes.map(({ harness, before, after }) => [
      span("✓", "success"),
      span(harness, "strong"),
      span(lockedText(after, t)),
      span(before === undefined ? t("harness.added") : t("harness.was", { version: lockedText(before, t) }), "muted"),
    ]),
    { indent: 1 },
  ),
  [],
  [span(` ${t("harness.lockWritten", { file: lockPath })}`, "muted")],
];

const outcomeRow = (outcome: InstallOutcome, t: Translate) => {
  const name = span(outcome.harness, "strong");
  switch (outcome.kind) {
    case "cache":
      return [span("✓", "success"), name, span(outcome.installed.version), span(t("harness.fromCache"), "muted")];
    case "install":
      return [
        span("✓", "success"),
        name,
        span(outcome.installed.version),
        span(t("harness.installed", { time: seconds(outcome.duration, t) }), "muted"),
      ];
    case "path":
      return outcome.version === outcome.locked
        ? [span("✓", "success"), name, span(outcome.version), span(t("harness.fromPath"), "muted")]
        : [
            span("!", "warning"),
            name,
            span(outcome.version),
            span(t("harness.pathDiffers", { locked: outcome.locked }), "warning"),
          ];
    case "missing":
      return [span("✗", "failure"), name, span(""), span(t("harness.missingOnPath"), "failure")];
  }
};

export const installView = (result: InstallResult, t: Translate): View => {
  const tone = result.frozen ? "failure" : "warning";
  const problems: View = result.problems.map((problem) => [
    span(result.frozen ? " ✗ " : " ! ", tone),
    span(t(problem.key, problem.params), tone),
  ]);
  if (result.frozen && result.problems.length > 0)
    return [...problems, [], [span(` ${t("harness.frozenFailed")}`, "failure")]];
  const outcomes =
    result.outcomes.length === 0
      ? [[span(` ${t("harness.nothingLocked")}`, "muted")]]
      : columns(
          result.outcomes.map((outcome) => outcomeRow(outcome, t)),
          { indent: 1 },
        );
  return [
    ...problems,
    ...(problems.length > 0 ? [[]] : []),
    ...outcomes,
    [],
    [span(` ${t("harness.platform", { platform: result.platform })}`, "muted")],
  ];
};

export const listView = (lockPath: string, rows: readonly ListedHarness[], t: Translate): View => {
  if (rows.length === 0) return [[span(` ${t("harness.nothingLocked")}`, "muted")]];
  const state = (row: ListedHarness) => {
    if (row.locked === undefined) return span(t("harness.notLocked"), "warning");
    if (row.locked.source === "system") return span(t("harness.fromPath"), "muted");
    return row.installed ? span(t("harness.inCache"), "success") : span(t("harness.notInCache"), "muted");
  };
  return [
    ...columns(
      rows.map((row) => [span(row.harness, "strong"), span(row.locked ? lockedText(row.locked, t) : "—"), state(row)]),
      { indent: 1 },
    ),
    [],
    [span(` ${lockPath}`, "muted")],
  ];
};

export const packView = (output: string, builds: number, size: number, t: Translate): View => [
  [span(" ✓ ", "success"), span(t("harness.packed", { count: builds, file: output, size: bytes(size, t) }))],
];
