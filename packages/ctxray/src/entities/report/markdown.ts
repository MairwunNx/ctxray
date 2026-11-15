import type { Component, Report } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { cellsOf, failureText, titleOf } from "./cells.ts";

const COMPONENTS: Component[] = ["system", "tools", "rules", "skills", "mcp", "commands"];
const MARK = { passed: "✓", flaky: "✓", failed: "✗", skipped: "○", inconclusive: "~" } as const;
const SHOWN = 20;

const cellText = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

const statusLine = (report: Report, t: Translate) => {
  const { summary } = report;
  const parts = [
    t("test.passed", { count: summary.passed + summary.flaky }),
    ...(summary.failed > 0 ? [t("test.failed", { count: summary.failed })] : []),
    ...(summary.inconclusive > 0 ? [t("test.inconclusives", { count: summary.inconclusive })] : []),
    ...(summary.skipped > 0 ? [t("test.skipped", { count: summary.skipped })] : []),
  ];
  return parts.join(" · ");
};

const layersTable = (report: Report) => {
  const rows = Object.entries(report.summary.byLayer).map(
    ([layer, counts]) =>
      `| ${layer} | ${counts.passed + counts.flaky} | ${counts.failed} | ${counts.inconclusive} | ${counts.skipped} |`,
  );
  return ["| | ✓ | ✗ | ~ | ○ |", "|---|---:|---:|---:|---:|", ...rows];
};

const contextTable = (report: Report, t: Translate) => {
  const started = report.harnesses.filter((harness) => harness.start);
  if (started.length === 0) return [];
  const header = `| | ${t("report.total")} | ${COMPONENTS.join(" | ")} |`;
  const rows = started.map(({ id, start }) => {
    const tokens = start?.tokens;
    const mark = tokens?.exact ? "" : "≈";
    return `| ${id} | ${mark}${tokens?.total ?? 0} | ${COMPONENTS.map((one) => tokens?.byComponent[one] ?? 0).join(" | ")} |`;
  });
  return [
    `### ${t("report.startingContext")}`,
    "",
    header,
    `|---|${"---:|".repeat(COMPONENTS.length + 1)}`,
    ...rows,
    "",
  ];
};

const baseSection = (report: Report, t: Translate) => {
  if (!report.base) return [];
  const rows = report.base.diffs.map(({ harness, total, changes }) => {
    const shown = changes.slice(0, 5).map((change) => {
      if (change.before === undefined) return `+${change.id}`;
      if (change.after === undefined) return `−${change.id}`;
      return `${change.id} ${signed(change.after - change.before)}`;
    });
    return `| ${harness} | ${total.after} | ${signed(total.after - total.before)} | ${cellText(shown.join(", ")) || "—"} |`;
  });
  return [
    `### ${t("report.against", { ref: report.base.ref })}`,
    "",
    `| | ${t("report.total")} | Δ | ${t("report.changes")} |`,
    "|---|---:|---:|---|",
    ...rows,
    "",
  ];
};

// A short summary for a GitHub job summary or a merge request comment: the counts, what failed, the context
// each harness starts with, and how it moved against the base (TASK §9).
export const toMarkdown = (report: Report, t: Translate, htmlPath: string | undefined): string => {
  const failed = cellsOf(report).filter(({ cell }) => cell.status === "failed");
  const failures = failed.slice(0, SHOWN).flatMap(({ test, cell }) => {
    const lines = cell.failure ? failureText(cell.failure, (key) => t(key as never)) : [];
    return [
      `- **${cell.harness} › ${cellText(titleOf(test) || t(`test.${test.check}` as never))}** \`${test.layer}\``,
      ...lines.slice(0, 4).map((line) => `  ${MARK.failed} ${cellText(line)}`),
    ];
  });
  return [
    `## ctxray ${report.ctxray} · ${statusLine(report, t)}`,
    "",
    ...layersTable(report),
    "",
    ...(failures.length > 0
      ? [
          `### ${t("report.failures")}`,
          "",
          ...failures,
          ...(failed.length > SHOWN ? [`- ${t("test.more", { count: failed.length - SHOWN })}`] : []),
          "",
        ]
      : []),
    ...contextTable(report, t),
    ...baseSection(report, t),
    ...(htmlPath ? [t("report.full", { path: htmlPath }), ""] : []),
  ].join("\n");
};
