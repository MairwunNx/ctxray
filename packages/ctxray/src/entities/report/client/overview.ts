import type { Layer } from "#shared/contract/index.ts";
import { type App, tokens } from "./app.ts";
import { stackedBar } from "./charts/bars.ts";
import { h } from "./dom.ts";

const STATUS = [
  ["passed", "✓", "good"],
  ["failed", "✗", "critical"],
  ["inconclusive", "~", "warning"],
  ["skipped", "○", "muted"],
] as const;

const TIERS = { static: "T1", capture: "T2", observe: "T3" } as const;
const LAYER_WORDS: Record<Layer, string> = {
  L1: "lint",
  L2: "policy",
  L3: "resolve",
  L4: "assemble",
  L5: "wire",
  L6: "activate",
  L7: "scenario",
};

export const overview = (app: App) => {
  const { report, t, num } = app;
  const { summary } = report;
  const count = (status: (typeof STATUS)[number][0]) =>
    status === "passed" ? summary.passed + summary.flaky : summary[status];
  const layers = Object.entries(summary.byLayer) as [Layer, (typeof summary.byLayer)[Layer]][];
  const widest = Math.max(
    1,
    ...layers.map(([, one]) => (one ? one.passed + one.flaky + one.failed + one.inconclusive + one.skipped : 0)),
  );
  return h(
    "section",
    { class: "overview" },
    h(
      "div",
      { class: "tiles" },
      STATUS.map(([status, mark, tone]) =>
        h(
          "div",
          { class: `tile-stat ${tone}` },
          h("span", { class: "tile-mark" }, mark),
          h("strong", {}, num(count(status))),
          h("span", {}, t(`status.${status}`)),
        ),
      ),
    ),
    h(
      "div",
      { class: "card" },
      h("h2", {}, t("html.layers")),
      layers.map(([layer, one]) =>
        h(
          "div",
          { class: "layer-row" },
          h("span", { class: "badge" }, `${layer} ${LAYER_WORDS[layer]}`),
          stackedBar(
            STATUS.map(([status, , tone]) => ({
              label: t(`status.${status}`),
              value: one ? (status === "passed" ? one.passed + one.flaky : one[status]) : 0,
              color: `var(--s-${tone})`,
            })),
            widest,
            num,
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "card" },
      h("h2", {}, t("html.harnesses")),
      h(
        "table",
        { class: "grid" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", {}, ""),
            h("th", {}, t("html.tiers")),
            h("th", { class: "num" }, t("html.startingContext")),
          ),
        ),
        h(
          "tbody",
          {},
          report.harnesses.map((harness) =>
            h(
              "tr",
              {},
              h("td", {}, h("strong", {}, harness.title), h("span", { class: "muted" }, ` ${harness.id}`)),
              h(
                "td",
                {},
                harness.modes.map((mode) => h("span", { class: "chip", title: mode }, `${TIERS[mode]} ${mode}`)),
              ),
              h(
                "td",
                { class: "num" },
                harness.start ? tokens(app, harness.start.tokens.total, harness.start.tokens.exact) : "—",
              ),
            ),
          ),
        ),
      ),
    ),
    report.broken.length > 0 &&
      h(
        "div",
        { class: "card bad" },
        h("h2", {}, t("test.broken")),
        report.broken.map((one) => h("p", {}, h("code", {}, one.file), ` ${one.failure.message}`)),
      ),
  );
};
