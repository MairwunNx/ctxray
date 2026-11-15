import type { App } from "./app.ts";
import { h } from "./dom.ts";

const signed = (app: App, value: number) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${app.num(Math.abs(value))}`;

// The loadout against another revision: what came, went, or changed size, per harness.
export const diffView = (app: App) => {
  const { base } = app.report;
  if (!base) return h("section", {});
  return h(
    "section",
    {},
    base.diffs.map((diff) =>
      h(
        "div",
        { class: "card" },
        h(
          "h2",
          {},
          `${diff.harness} · ${app.t("report.against", { ref: base.ref })}`,
          h(
            "span",
            { class: diff.total.after > diff.total.before ? "delta up" : "delta down" },
            ` ${signed(app, diff.total.after - diff.total.before)}`,
          ),
        ),
        diff.changes.length === 0
          ? h("p", { class: "muted" }, app.t("html.noChanges"))
          : h(
              "table",
              { class: "grid" },
              h(
                "tbody",
                {},
                diff.changes.map((change) => {
                  const kind =
                    change.before === undefined ? "added" : change.after === undefined ? "removed" : "changed";
                  return h(
                    "tr",
                    { class: kind },
                    h("td", {}, app.t(`html.component.${change.component}`)),
                    h("td", {}, h("code", {}, change.id)),
                    h("td", { class: "num" }, signed(app, (change.after ?? 0) - (change.before ?? 0))),
                    h("td", { class: "muted" }, app.t(`html.change.${kind}`)),
                  );
                }),
              ),
            ),
      ),
    ),
  );
};
