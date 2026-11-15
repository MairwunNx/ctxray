import { h } from "../dom.ts";
import { withTip } from "./tooltip.ts";

export type Interval = {
  label: string;
  rate: number;
  low: number;
  high: number;
  threshold: { min: number } | { max: number };
  verdict: "passed" | "failed" | "inconclusive";
  lines: string[];
};

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

// A rate per row with its 95 % interval as a bar and the threshold as a tick: a pass needs the whole bar on
// the threshold's side.
export const forest = (rows: readonly Interval[]) =>
  h(
    "div",
    { class: "forest" },
    h(
      "div",
      { class: "forest-row forest-axis" },
      h("span", {}),
      h(
        "div",
        { class: "forest-ticks" },
        [0, 0.25, 0.5, 0.75, 1].map((tick) => h("span", { style: `left:${pct(tick)}` }, String(tick))),
      ),
      h("span", {}),
    ),
    rows.map((row) => {
      const limit = "min" in row.threshold ? row.threshold.min : row.threshold.max;
      const track = h(
        "div",
        { class: "forest-track" },
        h("span", { class: "forest-limit", style: `left:${pct(limit)}` }),
        h("span", {
          class: `forest-bar ${row.verdict}`,
          style: `left:${pct(row.low)};width:${pct(Math.max(0.004, row.high - row.low))}`,
        }),
        h("span", { class: `forest-dot ${row.verdict}`, style: `left:${pct(row.rate)}` }),
      );
      return h(
        "div",
        { class: "forest-row" },
        h("span", { class: "forest-label" }, row.label),
        withTip(track, () => row.lines),
        h(
          "span",
          { class: `forest-value ${row.verdict}` },
          `${row.rate.toFixed(2)} [${row.low.toFixed(2)}–${row.high.toFixed(2)}]`,
        ),
      );
    }),
  );
