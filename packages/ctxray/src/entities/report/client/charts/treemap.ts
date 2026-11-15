import { h } from "../dom.ts";
import { withTip } from "./tooltip.ts";

export type Leaf = { id: string; label: string; value: number; color: string; group: string; lines: string[] };
type Rect = { x: number; y: number; w: number; h: number };

const worst = (row: readonly number[], side: number) => {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
};

// Squarified layout (Bruls, Huizing, van Wijk): rows that keep the cells as square as they can be.
export const squarify = (values: readonly number[], box: Rect): Rect[] => {
  const rects: Rect[] = [];
  let rest = { ...box };
  let queue = [...values];
  const scale =
    (box.w * box.h) /
    Math.max(
      1e-9,
      values.reduce((a, b) => a + b, 0),
    );
  queue = queue.map((value) => value * scale);
  while (queue.length > 0) {
    const side = Math.min(rest.w, rest.h);
    const row: number[] = [];
    while (queue.length > 0) {
      const next = queue[0] as number;
      if (row.length > 0 && worst([...row, next], side) > worst(row, side)) break;
      row.push(next);
      queue.shift();
    }
    const sum = row.reduce((a, b) => a + b, 0);
    const thick = sum / side;
    let at = 0;
    for (const value of row) {
      const along = value / thick;
      rects.push(
        rest.w >= rest.h
          ? { x: rest.x, y: rest.y + at, w: thick, h: along }
          : { x: rest.x + at, y: rest.y, w: along, h: thick },
      );
      at += along;
    }
    rest =
      rest.w >= rest.h
        ? { ...rest, x: rest.x + thick, w: rest.w - thick }
        : { ...rest, y: rest.y + thick, h: rest.h - thick };
  }
  return rects;
};

// Every element of the context as a tile its size, largest first, labelled where the tile has room.
export const treemap = (leaves: readonly Leaf[], onPick: (leaf: Leaf) => void) => {
  const shown = leaves.filter((leaf) => leaf.value > 0).toSorted((a, b) => b.value - a.value);
  const rects = squarify(
    shown.map((leaf) => leaf.value),
    { x: 0, y: 0, w: 100, h: 100 },
  );
  return h(
    "div",
    { class: "treemap", role: "list" },
    shown.map((leaf, index) => {
      const rect = rects[index] as Rect;
      const tile = h(
        "button",
        {
          class: "tile",
          role: "listitem",
          style: `left:${rect.x}%;top:${rect.y}%;width:${rect.w}%;height:${rect.h}%;--tile:${leaf.color}`,
          onclick: () => onPick(leaf),
          "aria-label": `${leaf.label}: ${leaf.lines[0] ?? ""}`,
        },
        rect.w * rect.h > 40 ? h("span", { class: "tile-label" }, leaf.label) : null,
      );
      return withTip(tile, () => [leaf.label, ...leaf.lines]);
    }),
  );
};
