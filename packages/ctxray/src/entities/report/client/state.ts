// What the reader picked: kept in the browser between visits. Storage can be off, so every access may fail.
const KEY = "ctxray.report";

export type Prefs = { lang?: string; theme?: "light" | "dark"; tab?: string; harness?: string };

export const loadPrefs = (): Prefs => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
};

export const savePrefs = (prefs: Prefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
};
