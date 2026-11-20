import { type Line, type Span, span, type View, widthOf } from "#shared/render/index.ts";
import type { CellResult } from "../lib/run.ts";
import { headingOf, LAYER_WORDS, nameOf, shown, type Words } from "./words.ts";

type Row = { heading: string; fixture: string | undefined; badge: string; name: string; cells: CellResult[] };

const reasonOf = (cell: CellResult, { t }: Words) => {
  if (cell.reason === "unsupported" && cell.missing?.some((item) => item.startsWith("experimental:")))
    return t("test.experimental", { harness: cell.harness });
  if (cell.reason === "unsupported") return t("test.unsupported", { missing: (cell.missing ?? []).join(", ") });
  if (cell.reason === "filtered") return t("test.filtered");
  if (cell.reason === "backend") return t("test.needsBackend");
  if (cell.reason === "budget") return t("test.budget");
  if (cell.check === "context") return t("test.notInstalled", { binary: (cell.missing ?? []).join(", ") });
  return t("test.unavailable", { layer: cell.layer });
};

const cellSpans = (cell: CellResult, words: Words): Span[] => {
  const { t } = words;
  const harness = span(`${cell.harness} `);
  const [stat] = cell.stats ?? [];
  const rate = stat ? [span(` ${stat.rate.toFixed(2)} [${stat.low.toFixed(2)}–${stat.high.toFixed(2)}]`)] : [];
  const warnings = [
    ...rate,
    ...(cell.tokens !== undefined
      ? [span(` ${t(cell.exact ? "test.exactTokens" : "test.tokens", { count: cell.tokens })}`, "muted")]
      : []),
    ...(cell.warnings ? [span(` ${t("test.warnings", { count: cell.warnings })}`, "warning")] : []),
  ];
  switch (cell.status) {
    case "passed":
      return [harness, span("✓", "success"), ...warnings];
    case "failed":
      return [harness, span("✗", "failure"), ...warnings];
    case "flaky":
      return [harness, span(`✓ ${t("test.flaky")}`, "warning")];
    case "inconclusive":
      return [harness, span(`~ ${t("test.inconclusive")}`, "warning"), ...rate];
    case "skipped":
      return [harness, span(`○ ${reasonOf(cell, words)}`, "muted")];
  }
};

// Rows in the order tests registered, a harness per cell: a `.each` test is one row per item.
const rowsOf = (results: readonly CellResult[], words: Words): Row[] => {
  const rows = new Map<string, Row>();
  for (const cell of results) {
    const id = `${cell.file ?? ""}\0${cell.key}`;
    const row = rows.get(id) ?? {
      heading: headingOf(cell, words),
      fixture: cell.fixture === undefined ? undefined : shown(words.cwd, cell.fixture),
      badge: `${cell.layer} ${LAYER_WORDS[cell.layer]}`,
      name: nameOf(cell, words),
      cells: [],
    };
    row.cells.push(cell);
    rows.set(id, row);
  }
  // A row --layer or --filter left out entirely says nothing.
  return [...rows.values()].filter((row) => row.cells.some((cell) => cell.reason !== "filtered"));
};

const join = (groups: readonly Span[][], gap: string): Line =>
  groups.flatMap((group, index) => (index === 0 ? group : [span(gap), ...group]));

export const matrixView = (results: readonly CellResult[], words: Words): View => {
  const rows = rowsOf(results, words);
  const badgeWidth = Math.max(0, ...rows.map((row) => widthOf(row.badge)));
  const pad = " ".repeat(3 + badgeWidth + 2);
  const view: Line[] = [];
  let heading: string | undefined;
  for (const row of rows) {
    if (row.heading !== heading) {
      if (heading !== undefined) view.push([]);
      heading = row.heading;
      view.push([span(` ${row.heading}`, "strong"), ...(row.fixture ? [span(`  ${row.fixture}`, "muted")] : [])]);
    }
    const badge = row.badge + " ".repeat(badgeWidth - widthOf(row.badge));
    view.push([span(`   ${badge}  `, "accent"), span(row.name)]);
    view.push([
      span(pad),
      ...join(
        row.cells.map((cell) => cellSpans(cell, words)),
        "   ",
      ),
    ]);
  }
  return view.length > 0 ? [...view, []] : [];
};
