import type { ReportCell, ReportFailure, ReportTest } from "#shared/contract/index.ts";
import type { App } from "./app.ts";
import { forest } from "./charts/forest.ts";
import { h } from "./dom.ts";

// A failure in the reader's language: from its key when ctxray worded it, else as the report holds it.
export const failureView = (app: App, failure: ReportFailure) => {
  const { t } = app;
  const message = failure.key ? t(failure.key, (failure.params ?? {}) as Record<string, string>) : failure.message;
  return h(
    "div",
    { class: "failure" },
    message && h("p", { class: "failure-message" }, message),
    failure.lines.length > 0 &&
      h(
        "dl",
        { class: "lines" },
        failure.lines.map((line) => [h("dt", {}, t(line.label)), h("dd", {}, h("code", {}, line.value))]),
      ),
    (failure.problems ?? []).length > 0 &&
      h(
        "ul",
        { class: "problems" },
        (failure.problems ?? []).map((problem) =>
          h(
            "li",
            { class: problem.severity },
            problem.path && h("code", {}, problem.line ? `${problem.path}:${problem.line}` : problem.path),
            " ",
            t(problem.key, problem.params as Record<string, string>),
            problem.rule && h("span", { class: "chip" }, problem.rule),
          ),
        ),
      ),
    failure.where && h("p", { class: "muted" }, h("code", {}, failure.where)),
  );
};

const statsView = (app: App, cell: ReportCell) =>
  cell.stats &&
  forest(
    cell.stats.map((stat) => ({
      label: stat.subject,
      rate: stat.rate,
      low: stat.low,
      high: stat.high,
      threshold: stat.threshold,
      verdict: stat.verdict,
      lines: [
        stat.subject,
        app.t("html.runsLoaded", { count: stat.samples, loaded: stat.successes }),
        "min" in stat.threshold ? `min ${stat.threshold.min}` : `max ${stat.threshold.max}`,
        ...(stat.needed ? [app.t("html.needed", { count: stat.needed })] : []),
      ],
    })),
  );

// What each turn of a session brought in, and the context's size after it.
const timelineView = (app: App, cell: ReportCell) =>
  (cell.sessions ?? [])
    .filter((session) => session.timeline.length > 1)
    .map((session) =>
      h(
        "ol",
        { class: "timeline" },
        session.timeline.map((turn) =>
          h(
            "li",
            {},
            h("span", { class: "turn" }, app.t("html.turn", { turn: turn.turn })),
            h("span", { class: "muted" }, app.t("html.tokens", { count: turn.tokens })),
            turn.added.length > 0
              ? turn.added.map((id) => h("code", { class: "added" }, `+ ${id}`))
              : h("span", { class: "muted" }, "—"),
          ),
        ),
      ),
    );

export const detailsView = (app: App, test: ReportTest) =>
  h(
    "div",
    { class: "details" },
    test.cells.map((cell) =>
      h(
        "div",
        { class: `cell-detail ${cell.status}` },
        h(
          "h4",
          {},
          cell.harness,
          h(
            "span",
            { class: "muted" },
            ` · ${app.t(`status.${cell.status}`)} · ${app.t("html.ms", { ms: cell.duration })}`,
          ),
        ),
        cell.reason &&
          h(
            "p",
            { class: "muted" },
            app.t(`html.reason.${cell.reason}`),
            cell.missing ? `: ${cell.missing.join(", ")}` : "",
          ),
        cell.failure && failureView(app, cell.failure),
        statsView(app, cell),
        timelineView(app, cell),
      ),
    ),
  );
