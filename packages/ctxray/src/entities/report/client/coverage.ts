import type { App } from "./app.ts";
import { h } from "./dom.ts";

const list = (app: App, key: string, items: readonly string[]) =>
  items.length > 0 &&
  h(
    "div",
    {},
    h("h3", {}, app.t(key, { count: items.length })),
    h(
      "ul",
      { class: "paths" },
      items.map((item) => h("li", {}, h("code", {}, item))),
    ),
  );

// How much of the project's rules and skills the run looked at, by how each loads.
export const coverageView = (app: App) =>
  h(
    "section",
    { class: "coverage" },
    app.report.coverage.map((one) =>
      h(
        "div",
        { class: "card" },
        h("h2", {}, app.report.harnesses.find((harness) => harness.id === one.harness)?.title ?? one.harness),
        one.kinds.map((kind) =>
          h(
            "div",
            { class: "layer-row" },
            h("span", { class: "badge" }, kind.activation),
            h(
              "div",
              {
                class: "meter",
                role: "meter",
                "aria-valuemin": 0,
                "aria-valuemax": kind.total,
                "aria-valuenow": kind.tested,
              },
              h("span", { style: `width:${kind.total === 0 ? 0 : (kind.tested / kind.total) * 100}%` }),
            ),
            h("span", { class: "stack-total" }, `${kind.tested}/${kind.total}`),
          ),
        ),
        list(app, "html.untested", one.untested),
        list(app, "html.dead", one.dead),
        list(app, "html.noPrompts", one.noPrompts),
      ),
    ),
  );
