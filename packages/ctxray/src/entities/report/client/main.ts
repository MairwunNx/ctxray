import type { Report } from "#shared/contract/index.ts";
import type { App } from "./app.ts";
import { contextView } from "./context.ts";
import { coverageView } from "./coverage.ts";
import { diffView } from "./diff.ts";
import { clear, h } from "./dom.ts";
import { evalsView } from "./evals.ts";
import { header, type Tab, tabsOf } from "./header.ts";
import { type Catalogs, translator } from "./i18n.ts";
import { overview } from "./overview.ts";
import { loadPrefs, type Prefs, savePrefs } from "./state.ts";
import { testsView } from "./tests.ts";

const read = <T>(id: string): T => JSON.parse(document.getElementById(id)?.textContent ?? "null") as T;

const report = read<Report>("ctxray-report");
const catalogs = read<Catalogs>("ctxray-messages");
// A link can open a tab: `index.html#context`.
let prefs: Prefs = { ...loadPrefs(), ...(location.hash.length > 1 && { tab: location.hash.slice(1) }) };
const root = document.getElementById("app") as HTMLElement;

const applyTheme = () => {
  const dark = prefs.theme ? prefs.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset["theme"] = dark ? "dark" : "light";
};

const render = () => {
  const lang = prefs.lang && report.langs.includes(prefs.lang) ? prefs.lang : (report.langs[0] ?? "en");
  document.documentElement.lang = lang;
  applyTheme();
  const numbers = new Intl.NumberFormat(lang);
  const app: App = {
    report,
    t: translator(catalogs, lang),
    lang,
    prefs,
    num: (value) => numbers.format(value),
    set: (patch) => {
      prefs = { ...prefs, ...patch };
      savePrefs(prefs);
      if (patch.tab) history.replaceState(null, "", `#${patch.tab}`);
      render();
    },
  };
  const tabs = tabsOf(app);
  const tab: Tab = tabs.find((one) => one === prefs.tab) ?? tabs[0] ?? "overview";
  // A search box keeps its focus and caret across renders.
  const focused = document.activeElement instanceof HTMLInputElement ? document.activeElement : undefined;
  const caret = focused?.selectionStart ?? null;
  const views: Record<Tab, () => HTMLElement> = {
    overview: () => overview(app),
    tests: () => testsView(app, render),
    context: () => contextView(app, render),
    evals: () => evalsView(app),
    coverage: () => coverageView(app),
    diff: () => diffView(app),
  };
  clear(root);
  root.append(header(app, tab), h("main", { id: "main" }, views[tab]()));
  document.title = `ctxray · ${report.project.name}`;
  if (focused?.type === "search") {
    const box = root.querySelector<HTMLInputElement>("input[type=search]");
    box?.focus();
    if (caret !== null) box?.setSelectionRange(caret, caret);
  }
};

render();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => prefs.theme === undefined && render());

// Served by `ctxray show-report`: a new run sends an event, and the page reloads with it.
if (location.protocol.startsWith("http")) {
  try {
    new EventSource("events").addEventListener("reload", () => location.reload());
  } catch {}
}
