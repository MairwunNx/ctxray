import type { Component, LoadoutSnapshot, Report, ReportTest } from "#shared/contract/index.ts";
import type { Translate } from "./i18n.ts";
import type { Prefs } from "./state.ts";

export type App = {
  report: Report;
  t: Translate;
  lang: string;
  prefs: Prefs;
  num: (value: number) => string;
  set: (patch: Prefs) => void; // saves and renders again
};

export const COMPONENTS: readonly Component[] = ["system", "tools", "rules", "skills", "mcp", "commands"];
export type Part = Component | "framing" | "messages";
export const colorOf = (component: Part) => `var(--c-${component})`;

// ≈ for a local estimate: ctxray never passes one off as exact (ADR 0012).
export const tokens = (app: App, value: number, exact: boolean) =>
  `${exact ? "" : "≈ "}${app.t("html.tokens", { count: value })}`;

export const titleOf = (app: App, test: ReportTest) => {
  if (test.check === "lint") return app.t("test.lint");
  if (test.check === "context") return app.t("test.context");
  return [...test.suites, test.name].join(" › ");
};

// The largest context any session of the harness reached, and the session's start.
export const peakOf = (
  report: Report,
  harness: string,
): { start: LoadoutSnapshot; peak: LoadoutSnapshot; test: ReportTest } | undefined => {
  let best: { start: LoadoutSnapshot; peak: LoadoutSnapshot; test: ReportTest } | undefined;
  for (const test of report.tests) {
    for (const cell of test.cells.filter((one) => one.harness === harness)) {
      for (const session of cell.sessions ?? []) {
        if (!best || session.peak.tokens.total > best.peak.tokens.total) best = { ...session, test };
      }
    }
  }
  return best;
};
