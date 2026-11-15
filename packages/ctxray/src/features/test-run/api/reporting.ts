import type { Config } from "#entities/user-config/index.ts";
import type { Values } from "#shared/cli/index.ts";
import { Reporter } from "#shared/contract/index.ts";
import { CATALOGS } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import type { ReporterName, Reporting } from "../lib/write-reports.ts";
import type { SelectionError } from "./selection.ts";

// CI keeps every file a pipeline can show: JUnit for test reports, Markdown for the job summary, HTML as an
// artifact, JSON for whatever comes next.
const CI_REPORTERS: ReporterName[] = ["console", "json", "junit", "markdown", "html"];

const listOf = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "");

const text = (value: Values[string] | undefined) => (typeof value === "string" && value !== "" ? value : undefined);

// A flag beats CTXRAY_* in the environment, which beats the config. `all` means every language ctxray speaks.
export const chooseReporting = (
  values: Values,
  env: Env,
  config: Config,
  ci: boolean,
  lang: string,
): Reporting | SelectionError => {
  const asked = text(values["reporter"]) ?? text(env["CTXRAY_REPORTER"]);
  const names = asked === undefined ? (config.reporters ?? (ci ? CI_REPORTERS : ["console"])) : listOf(asked);
  const unknown = names.find((name) => !Reporter.safeParse(name).success);
  if (unknown !== undefined) {
    return { key: "test.unknownReporter", params: { name: unknown, known: Reporter.options.join(", ") } };
  }
  const langText = text(values["report-lang"]) ?? text(env["CTXRAY_REPORT_LANG"]);
  const wanted = langText === undefined ? (config.reportLangs ?? [lang]) : listOf(langText);
  const supported = Object.keys(CATALOGS);
  const langs = wanted.includes("all")
    ? [lang, ...supported.filter((one) => one !== lang)]
    : wanted.filter((one) => supported.includes(one));
  const missing = wanted.find((one) => one !== "all" && !supported.includes(one));
  if (missing !== undefined)
    return { key: "test.unknownReportLang", params: { lang: missing, known: supported.join(", ") } };
  return {
    reporters: new Set(names as ReporterName[]),
    langs: langs.length > 0 ? [...new Set(langs)] : [lang],
    dir: text(values["report-dir"]) ?? config.reportDir,
  };
};
