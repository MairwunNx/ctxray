import { h, s } from "../dom.ts";
import { withTip } from "./tooltip.ts";

export type Slice = { key: string; label: string; value: number; color: string };

const polar = (r: number, angle: number) => [r * Math.sin(angle), -r * Math.cos(angle)] as const;

// A ring of shares with the total in the middle. 2px surface gaps between slices, a legend beside it.
export const donut = (slices: readonly Slice[], center: string, caption: string, format: (n: number) => string) => {
  const shown = slices.filter((slice) => slice.value > 0);
  const total = shown.reduce((sum, slice) => sum + slice.value, 0);
  const outer = 80;
  const inner = 52;
  let angle = 0;
  const arcs = shown.map((slice) => {
    const sweep = total === 0 ? 0 : (slice.value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const end = Math.min(angle, start + Math.PI * 2 - 0.0001);
    const large = end - start > Math.PI ? 1 : 0;
    const [x1, y1] = polar(outer, start);
    const [x2, y2] = polar(outer, end);
    const [x3, y3] = polar(inner, end);
    const [x4, y4] = polar(inner, start);
    const path = `M${x1},${y1} A${outer},${outer} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
    const share = total === 0 ? 0 : slice.value / total;
    return withTip(s("path", { d: path, fill: slice.color, class: "slice", tabindex: 0 }), () => [
      slice.label,
      `${format(slice.value)} · ${(share * 100).toFixed(1)} %`,
    ]);
  });
  return h(
    "figure",
    { class: "donut" },
    s(
      "svg",
      { viewBox: "-90 -90 180 180", role: "img", "aria-label": caption },
      ...arcs,
      s("text", { class: "donut-total", y: 4, "text-anchor": "middle" }, center),
      s("text", { class: "donut-caption", y: 22, "text-anchor": "middle" }, caption),
    ),
    h(
      "ul",
      { class: "legend" },
      shown.map((slice) =>
        h(
          "li",
          {},
          h("span", { class: "swatch", style: `background:${slice.color}` }),
          h("span", { class: "legend-label" }, slice.label),
          h("span", { class: "legend-value" }, format(slice.value)),
          h("span", { class: "legend-share" }, `${total === 0 ? 0 : Math.round((slice.value / total) * 100)} %`),
        ),
      ),
    ),
  );
};
