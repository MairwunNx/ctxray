import type { LoadoutSnapshot } from "#shared/contract/index.ts";
import { type App, COMPONENTS, colorOf, type Part, peakOf } from "./app.ts";
import { donut } from "./charts/donut.ts";
import { treemap } from "./charts/treemap.ts";
import { h } from "./dom.ts";
import { type Piece, piecesOf } from "./elements.ts";
import { growth } from "./growth.ts";

const partOf = (loadout: LoadoutSnapshot, part: Part) => {
  if (part === "framing") return loadout.tokens.framing ?? 0;
  if (part === "messages") return piecesOf(loadout).find((piece) => piece.component === "messages")?.tokens ?? 0;
  return loadout.tokens.byComponent[part] ?? 0;
};

const view = { picked: "", which: "start" as "start" | "peak" };

const harnessesWithContext = (app: App) =>
  app.report.harnesses.filter((harness) => harness.start || peakOf(app.report, harness.id));

const pieceRow = (app: App, piece: Piece, total: number) =>
  h(
    "tr",
    { id: `piece-${piece.id}`, class: piece.id === view.picked ? "picked" : "" },
    h(
      "td",
      {},
      h("span", { class: "swatch", style: `background:${colorOf(piece.component)}` }),
      app.t(`html.component.${piece.component}`),
    ),
    h("td", {}, h("code", {}, piece.label)),
    h("td", { class: "num" }, app.num(piece.tokens)),
    h("td", { class: "num muted" }, `${total === 0 ? 0 : ((piece.tokens / total) * 100).toFixed(1)} %`),
    h(
      "td",
      { class: "muted" },
      piece.provenance
        ? [h("code", {}, piece.provenance.source), ` · ${piece.provenance.reason} · ${piece.provenance.evidence}`]
        : "—",
    ),
  );

export const contextView = (app: App, rerender: () => void) => {
  const { t, report } = app;
  const candidates = harnessesWithContext(app);
  if (candidates.length === 0) return h("section", { class: "card muted" }, t("html.noContext"));
  const harness = candidates.find((one) => one.id === app.prefs.harness) ?? candidates[0];
  if (!harness) return h("section", {});
  const session = peakOf(report, harness.id);
  const start = harness.start ?? session?.start;
  const loadout = view.which === "peak" && session ? session.peak : start;
  if (!loadout) return h("section", {});
  const pieces = piecesOf(loadout).toSorted((a, b) => b.tokens - a.tokens);
  const total = loadout.tokens.total;
  const pick = (piece: Piece) => {
    view.picked = piece.id;
    rerender();
    document.getElementById(`piece-${piece.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  return h(
    "section",
    { class: "context" },
    h(
      "div",
      { class: "filters" },
      candidates.map((one) =>
        h(
          "button",
          { class: one.id === harness.id ? "chip on" : "chip", onclick: () => app.set({ harness: one.id }) },
          one.title,
        ),
      ),
      session &&
        (["start", "peak"] as const).map((which) =>
          h(
            "button",
            {
              class: which === view.which ? "chip on" : "chip",
              onclick: () => {
                view.which = which;
                rerender();
              },
            },
            t(`html.${which}`),
          ),
        ),
    ),
    h(
      "div",
      { class: "pair" },
      h(
        "div",
        { class: "card" },
        h("h2", {}, t("html.byComponent")),
        donut(
          [...COMPONENTS, "framing" as const, "messages" as const].map((component) => ({
            key: component,
            label: t(`html.component.${component}`),
            value: partOf(loadout, component),
            color: colorOf(component),
          })),
          app.num(total),
          `${loadout.tokens.exact ? "" : "≈ "}${t("html.tokensUnit", { count: total })}`,
          app.num,
        ),
        h(
          "p",
          { class: "muted" },
          loadout.tokens.exact
            ? t("html.exact", { method: loadout.tokens.method })
            : t("html.approx", { method: loadout.tokens.method }),
        ),
      ),
      session ? growth(app, session.start, session.peak) : h("div", { class: "card muted" }, t("html.noSessions")),
    ),
    h(
      "div",
      { class: "card" },
      h("h2", {}, t("html.everyPiece")),
      treemap(
        pieces.map((piece) => ({
          id: piece.id,
          label: piece.label,
          value: piece.tokens,
          color: colorOf(piece.component),
          group: piece.group ?? piece.component,
          lines: [
            t("html.tokens", { count: piece.tokens }),
            ...(piece.provenance ? [piece.provenance.source, piece.provenance.reason] : []),
          ],
        })),
        (leaf) => {
          const piece = pieces.find((one) => one.id === leaf.id);
          if (piece) pick(piece);
        },
      ),
      h(
        "div",
        { class: "scroll" },
        h(
          "table",
          { class: "grid pieces" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", {}, t("html.component")),
              h("th", {}, t("html.piece")),
              h("th", { class: "num" }, t("html.tokensHead")),
              h("th", { class: "num" }, "%"),
              h("th", {}, t("html.provenance")),
            ),
          ),
          h(
            "tbody",
            {},
            pieces.map((piece) => pieceRow(app, piece, total)),
          ),
        ),
      ),
    ),
  );
};
