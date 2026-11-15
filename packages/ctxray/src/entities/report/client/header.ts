import { type App, tokens } from "./app.ts";
import { h } from "./dom.ts";

export const TABS = ["overview", "tests", "context", "evals", "coverage", "diff"] as const;
export type Tab = (typeof TABS)[number];

// The tabs this report has something for: evals need a rate, the diff a base.
export const tabsOf = (app: App): Tab[] =>
  TABS.filter((tab) => {
    if (tab === "evals") return app.report.tests.some((test) => test.cells.some((cell) => cell.stats?.length));
    if (tab === "diff") return app.report.base !== undefined;
    if (tab === "coverage") return app.report.coverage.length > 0;
    return true;
  });

const meta = (app: App) => {
  const { report, t } = app;
  const { run } = report;
  const date = new Intl.DateTimeFormat(app.lang, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(report.createdAt),
  );
  const backend = run.backend.name ? `${run.backend.kind} (${run.backend.name})` : run.backend.kind;
  return [
    `ctxray ${report.ctxray}`,
    date,
    t("test.backend", { backend }),
    t("html.seconds", { seconds: Math.round(run.duration / 100) / 10 }),
    ...(run.spend ? [`$${run.spend.usd.toFixed(2)} · ${tokens(app, run.spend.tokens, true)}`] : []),
  ];
};

export const header = (app: App, tab: Tab) => {
  const { report, t } = app;
  const dark = document.documentElement.dataset["theme"] === "dark";
  return h(
    "header",
    { class: "top" },
    h(
      "div",
      { class: "top-row" },
      h(
        "div",
        { class: "brand" },
        h("span", { class: "logo", "aria-hidden": "true" }, "◎"),
        h("h1", {}, report.project.name),
      ),
      h(
        "div",
        { class: "controls" },
        report.langs.length > 1 &&
          h(
            "select",
            {
              class: "lang",
              "aria-label": t("html.language"),
              onchange: (event) => app.set({ lang: (event.target as HTMLSelectElement).value }),
            },
            report.langs.map((lang) => h("option", { value: lang, selected: lang === app.lang }, lang.toUpperCase())),
          ),
        h(
          "button",
          { class: "theme", "aria-label": t("html.theme"), onclick: () => app.set({ theme: dark ? "light" : "dark" }) },
          dark ? "☀" : "☾",
        ),
      ),
    ),
    h("p", { class: "meta" }, meta(app).join("  ·  ")),
    h(
      "nav",
      { class: "tabs", role: "tablist" },
      tabsOf(app).map((one) =>
        h(
          "button",
          {
            role: "tab",
            "aria-selected": one === tab,
            class: one === tab ? "tab on" : "tab",
            onclick: () => app.set({ tab: one }),
          },
          t(`html.tab.${one}`),
        ),
      ),
    ),
  );
};
