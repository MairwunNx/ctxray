import type { ReportTest } from "#shared/contract/index.ts";
import { type App, titleOf } from "./app.ts";
import { detailsView } from "./details.ts";
import { h } from "./dom.ts";

const MARKS = { passed: "✓", flaky: "✓", failed: "✗", skipped: "○", inconclusive: "~" } as const;
const FILTERS = ["all", "failed", "inconclusive", "skipped"] as const;
type Filter = (typeof FILTERS)[number];

const view = { filter: "all" as Filter, query: "", open: new Set<string>() };

const headingOf = (app: App, test: ReportTest) =>
  test.check ? app.t("test.checks") : (test.suites[0] ?? test.file ?? "");

const matches = (app: App, test: ReportTest) =>
  (view.filter === "all" || test.cells.some((cell) => cell.status === view.filter)) &&
  titleOf(app, test).toLowerCase().includes(view.query.toLowerCase());

// The matrix of test × harness, grouped like the terminal: a row per test, a column per harness, details below.
export const testsView = (app: App, rerender: () => void) => {
  const { report, t } = app;
  const harnesses = report.harnesses.map((harness) => harness.id);
  const tests = report.tests.filter((test) => matches(app, test));
  let heading: string | undefined;
  const rows = tests.flatMap((test) => {
    const group = headingOf(app, test);
    const head =
      group !== heading ? [h("tr", { class: "group" }, h("th", { colspan: harnesses.length + 2 }, group))] : [];
    heading = group;
    const open = view.open.has(test.id);
    const row = h(
      "tr",
      {
        class: open ? "test open" : "test",
        tabindex: 0,
        onclick: () => {
          if (open) view.open.delete(test.id);
          else view.open.add(test.id);
          rerender();
        },
      },
      h("td", { class: "badge-cell" }, h("span", { class: "badge" }, test.layer)),
      h("td", {}, titleOf(app, test)),
      harnesses.map((id) => {
        const cell = test.cells.find((one) => one.harness === id);
        const stat = cell?.stats?.[0];
        return h(
          "td",
          { class: `mark ${cell?.status ?? "none"}`, title: cell ? t(`status.${cell.status}`) : "" },
          cell ? MARKS[cell.status] : "",
          stat && h("span", { class: "rate" }, ` ${stat.rate.toFixed(2)}`),
        );
      }),
    );
    const details = open
      ? [h("tr", { class: "details-row" }, h("td", { colspan: harnesses.length + 2 }, detailsView(app, test)))]
      : [];
    return [...head, row, ...details];
  });
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "filters" },
      FILTERS.map((filter) =>
        h(
          "button",
          {
            class: filter === view.filter ? "chip on" : "chip",
            onclick: () => {
              view.filter = filter;
              rerender();
            },
          },
          filter === "all" ? t("html.all") : t(`status.${filter}`),
        ),
      ),
      h("input", {
        type: "search",
        placeholder: t("html.search"),
        value: view.query,
        oninput: (event) => {
          view.query = (event.target as HTMLInputElement).value;
          rerender();
        },
      }),
    ),
    h(
      "div",
      { class: "scroll" },
      h(
        "table",
        { class: "matrix" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", {}, ""),
            h("th", {}, t("html.test")),
            harnesses.map((id) => h("th", { class: "mark" }, id)),
          ),
        ),
        h(
          "tbody",
          {},
          rows.length > 0
            ? rows
            : h("tr", {}, h("td", { colspan: harnesses.length + 2, class: "muted" }, t("html.nothing"))),
        ),
      ),
    ),
  );
};
