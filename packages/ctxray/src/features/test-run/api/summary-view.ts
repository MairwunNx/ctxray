import type { Layer, TestStatus } from "#shared/contract/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import { type Span, span, type View, widthOf } from "#shared/render/index.ts";
import { LAYERS } from "../lib/selection.ts";
import type { TestRunResult } from "../test-run.action.ts";
import type { Words } from "./words.ts";

const COUNTS: [TestStatus, MessageKey, Span["tone"]][] = [
  ["passed", "test.passed", "success"],
  ["failed", "test.failed", "failure"],
  ["flaky", "test.flakies", "warning"],
  ["inconclusive", "test.inconclusives", "warning"],
  ["skipped", "test.skipped", "muted"],
];

const passes = (status: TestStatus) => status === "passed" || status === "flaky";

// `L3 ✓ 7` when every test that ran passed, `L4 3/4` after a failure, `L6 ~ 1/2` when the rest can't tell yet,
// `L5 ○ 2` when none ran.
const layerSpans = (result: TestRunResult): Span[] =>
  LAYERS.flatMap((layer: Layer) => {
    const cells = result.results.filter((cell) => cell.layer === layer && cell.reason !== "filtered");
    if (cells.length === 0) return [];
    const ran = cells.filter((cell) => cell.status !== "skipped");
    const passed = ran.filter((cell) => passes(cell.status)).length;
    if (ran.length === 0) return [span(`${layer} ○ ${cells.length}   `, "muted")];
    if (passed === ran.length) return [span(`${layer} `), span(`✓ ${passed}   `, "success")];
    // Statistics that can't tell yet aren't a failure.
    const failed = ran.some((cell) => cell.status === "failed");
    return [span(`${layer} `), span(`${failed ? "" : "~ "}${passed}/${ran.length}   `, failed ? "failure" : "warning")];
  });

const totalSpans = (result: TestRunResult, { t }: Words): Span[] => {
  const kept = result.results.filter((cell) => cell.reason !== "filtered");
  const counts = COUNTS.flatMap(([status, key, tone]) => {
    const count = kept.filter((cell) => cell.status === status).length;
    return count === 0 ? [] : [span(t(key, { count }), tone)];
  });
  const broken = result.broken.length > 0 ? [span(t("test.failed", { count: result.broken.length }), "failure")] : [];
  const filtered = result.results.length - kept.length;
  const parts = [
    ...counts,
    ...broken,
    ...(filtered > 0 ? [span(t("test.filteredOut", { count: filtered }), "muted")] : []),
  ];
  // Under a second reads in milliseconds: “0 s” would say nothing.
  const ms = Math.round(result.duration);
  const time = ms < 1000 ? t("test.ms", { ms }) : t("test.seconds", { seconds: Math.round(ms / 100) / 10 });
  return [
    ...parts.flatMap((part, index) => (index === 0 ? [part] : [span(" · ", "muted"), part])),
    span(`  ·  ${time}`, "muted"),
  ];
};

const notes = (result: TestRunResult, words: Words, version: string): string[] => {
  const { t } = words;
  const missing = result.results.some(
    (cell) => cell.failure?.kind === "check" && cell.failure.key === "snapshot.missing",
  );
  return [
    ...(result.files.length === 0 ? [t("test.noFiles")] : []),
    ...(result.installed === undefined ? [] : [t("test.skew", { installed: result.installed, version })]),
    ...(missing ? [t("test.updateHint")] : []),
    ...(result.cassettes > 0 ? [t("test.cassettes", { count: result.cassettes })] : []),
  ];
};

// Labels in one column, like “Layers” and “Total”, and what each says after them.
const labelled = (rows: readonly [string, Span[]][]): View => {
  const width = Math.max(...rows.map(([label]) => widthOf(label)));
  return rows.map(([label, rest]) => [span(` ${label}${" ".repeat(width - widthOf(label) + 3)}`, "strong"), ...rest]);
};

// What the real model cost: dollars for the models with a price, tokens for all of them.
const spendSpans = (result: TestRunResult, { t }: Words): Span[] => {
  if (!result.spend) return [];
  const { usage, cost, unpriced } = result.spend;
  const tokens = usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
  return [
    span(t("test.dollars", { amount: cost.toFixed(2) })),
    span(` · ${t("test.modelTokens", { count: tokens })}`, "muted"),
    ...(unpriced.length > 0 ? [span(` · ${t("test.unpriced", { models: unpriced.join(", ") })}`, "warning")] : []),
  ];
};

export const summaryView = (result: TestRunResult, words: Words, version: string): View => {
  const { t } = words;
  const { written, updated } = result.snapshots;
  const snapshots = [
    ...(written > 0 ? [t("test.written", { count: written })] : []),
    ...(updated > 0 ? [t("test.updated", { count: updated })] : []),
  ];
  const layers = layerSpans(result);
  const rows: [string, Span[]][] = [
    ...(layers.length > 0 ? [[t("test.layers"), layers] as [string, Span[]]] : []),
    [t("test.total"), totalSpans(result, words)],
    ...(result.spend ? [[t("test.cost"), spendSpans(result, words)] as [string, Span[]]] : []),
    ...(snapshots.length > 0 ? [[t("test.snapshots"), [span(snapshots.join(" · "))]] as [string, Span[]]] : []),
  ];
  return [...labelled(rows), ...notes(result, words, version).map((note) => [span(` ${note}`, "muted")])];
};
