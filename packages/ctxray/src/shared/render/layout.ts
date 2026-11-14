import { type Line, type Span, span, type View } from "./view.ts";

// Display width, not string length: «тестов» takes 6 columns, 工具 takes 4, 🚀 takes 2.
export const widthOf = (text: string): number => Bun.stringWidth(text);

export type ColumnsOptions = { indent?: number; gap?: number };

// Lays rows of cells out in columns. Every cell but the last in a row is padded to its column's width.
export const columns = (rows: readonly (readonly Span[])[], { indent = 0, gap = 2 }: ColumnsOptions = {}): View => {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, widthOf(cell.text));
    });
  }
  return rows.map((row): Line => {
    const cells = row.flatMap((cell, i) => {
      if (i === row.length - 1) return [cell];
      return [cell, span(" ".repeat((widths[i] ?? 0) - widthOf(cell.text) + gap))];
    });
    return indent > 0 ? [span(" ".repeat(indent)), ...cells] : cells;
  });
};
