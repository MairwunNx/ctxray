import { h } from "../dom.ts";
import { withTip } from "./tooltip.ts";

export type Segment = { label: string; value: number; color: string };

// One horizontal bar of stacked segments, 2px gaps between them, its total as a label.
export const stackedBar = (segments: readonly Segment[], max: number, format: (n: number) => string) => {
  const total = segments.reduce((sum, one) => sum + one.value, 0);
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "stack-track", style: `width:${max === 0 ? 0 : (total / max) * 100}%` },
      segments
        .filter((one) => one.value > 0)
        .map((one) =>
          withTip(h("span", { class: "stack-seg", style: `flex:${one.value};background:${one.color}` }), () => [
            one.label,
            format(one.value),
          ]),
        ),
    ),
    h("span", { class: "stack-total" }, format(total)),
  );
};
