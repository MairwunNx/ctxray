import { type App, titleOf } from "./app.ts";
import { forest } from "./charts/forest.ts";
import { h } from "./dom.ts";

// Every rate L6 and L7 judged, on one axis: the dot is the rate, the bar its 95 % interval, the tick the threshold.
export const evalsView = (app: App) => {
  const rows = app.report.tests.flatMap((test) =>
    test.cells.flatMap((cell) =>
      (cell.stats ?? []).map((stat) => ({
        label: `${cell.harness} › ${titleOf(app, test)} · ${stat.subject}`,
        rate: stat.rate,
        low: stat.low,
        high: stat.high,
        threshold: stat.threshold,
        verdict: stat.verdict,
        lines: [
          stat.subject,
          app.t("html.runsLoaded", { count: stat.samples, loaded: stat.successes }),
          "min" in stat.threshold ? `min ${stat.threshold.min}` : `max ${stat.threshold.max}`,
          app.t(`status.${stat.verdict}`),
          ...(stat.needed ? [app.t("html.needed", { count: stat.needed })] : []),
        ],
      })),
    ),
  );
  return h(
    "section",
    { class: "card" },
    h("h2", {}, app.t("html.rates")),
    h("p", { class: "muted" }, app.t("html.ratesHint")),
    forest(rows),
  );
};
