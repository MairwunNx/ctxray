import type { LoadoutSnapshot } from "#shared/contract/index.ts";
import { type App, COMPONENTS, colorOf } from "./app.ts";
import { stackedBar } from "./charts/bars.ts";
import { h } from "./dom.ts";

// Start and peak side by side, by component, and what the session added on the way.
export const growth = (app: App, start: LoadoutSnapshot, peak: LoadoutSnapshot) => {
  const max = Math.max(start.tokens.total, peak.tokens.total);
  const segments = (loadout: LoadoutSnapshot) =>
    COMPONENTS.map((component) => ({
      label: app.t(`html.component.${component}`),
      value: loadout.tokens.byComponent[component] ?? 0,
      color: colorOf(component),
    }));
  const had = new Set([...start.rules.map((rule) => rule.path), ...start.skills.loaded.map((skill) => skill.name)]);
  const added = [...peak.rules.map((rule) => rule.path), ...peak.skills.loaded.map((skill) => skill.name)].filter(
    (id) => !had.has(id),
  );
  return h(
    "div",
    { class: "card" },
    h("h2", {}, app.t("html.startAndPeak")),
    h(
      "div",
      { class: "layer-row" },
      h("span", { class: "badge" }, app.t("html.start")),
      stackedBar(segments(start), max, app.num),
    ),
    h(
      "div",
      { class: "layer-row" },
      h("span", { class: "badge" }, app.t("html.peak")),
      stackedBar(segments(peak), max, app.num),
    ),
    added.length > 0
      ? h(
          "p",
          {},
          app.t("html.added"),
          " ",
          added.map((id) => h("code", { class: "added" }, `+ ${id}`)),
        )
      : h("p", { class: "muted" }, app.t("html.nothingAdded")),
  );
};
