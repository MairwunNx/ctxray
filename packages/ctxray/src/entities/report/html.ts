import { join } from "node:path";
import type { Report } from "#shared/contract/index.ts";
import { CATALOGS, createTranslator } from "#shared/i18n/index.ts";
import styles from "./client/styles.css" with { type: "text" };

// scripts/build.ts bundles the page's script into the release binary under this name. A run from source has
// none and bundles it here, once.
declare const CTXRAY_REPORT_CLIENT: string | undefined;

let bundled: Promise<string> | undefined;

export const clientScript = (): Promise<string> => {
  if (typeof CTXRAY_REPORT_CLIENT === "string") return Promise.resolve(CTXRAY_REPORT_CLIENT);
  bundled ??= (async () => {
    const result = await Bun.build({
      entrypoints: [join(import.meta.dir, "client", "main.ts")],
      target: "browser",
      format: "iife",
      minify: true,
    });
    const [output] = result.outputs;
    if (!result.success || !output) throw new Error(result.logs.map(String).join("\n"));
    return output.text();
  })();
  return bundled;
};

const text = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// JSON inside a script element: `</script>` and `<!--` in a value must not end it.
const embedded = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");

// One self-contained file: the report, the catalogs of its languages, the styles and the script inline. It opens
// offline from disk, from a CI artifact, or from `ctxray show-report`.
export const toHtml = async (report: Report): Promise<string> => {
  const catalogs = Object.fromEntries(report.langs.map((lang) => [lang, CATALOGS[lang] ?? {}]));
  const script = (await clientScript()).replaceAll("</script", "<\\/script");
  return [
    "<!doctype html>",
    `<html lang="${report.langs[0] ?? "en"}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>ctxray · ${text(report.project.name)}</title>`,
    `<style>${styles}</style>`,
    "</head>",
    "<body>",
    `<div id="app"><noscript>${createTranslator(report.langs[0] ?? "en")("html.needsScript")}</noscript></div>`,
    `<script id="ctxray-report" type="application/json">${embedded(report)}</script>`,
    `<script id="ctxray-messages" type="application/json">${embedded(catalogs)}</script>`,
    `<script>${script}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
};
