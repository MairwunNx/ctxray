import { expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "#entities/user-config/index.ts";
import { chooseReporting } from "./reporting.ts";

const pick = (
  values: Record<string, string>,
  env: Record<string, string> = {},
  ci = false,
  config = DEFAULT_CONFIG,
) => {
  const chosen = chooseReporting(values, env, config, ci, "ru");
  return "key" in chosen ? chosen.key : { reporters: [...chosen.reporters], langs: chosen.langs, dir: chosen.dir };
};

test.each<[string, Record<string, string>, Record<string, string>, boolean, unknown]>([
  ["the console alone by default", {}, {}, false, { reporters: ["console"], langs: ["ru"], dir: ".ctxray/report" }],
  [
    "every file in CI",
    {},
    {},
    true,
    { reporters: ["console", "json", "junit", "markdown", "html"], langs: ["ru"], dir: ".ctxray/report" },
  ],
  [
    "the flag over the environment",
    { reporter: "html", "report-lang": "en" },
    { CTXRAY_REPORTER: "junit" },
    false,
    { reporters: ["html"], langs: ["en"], dir: ".ctxray/report" },
  ],
  [
    "the environment over the config",
    {},
    { CTXRAY_REPORTER: "junit,allure", CTXRAY_REPORT_LANG: "all" },
    false,
    { reporters: ["junit", "allure"], langs: ["ru", "en"], dir: ".ctxray/report" },
  ],
  ["a folder of its own", { "report-dir": "out" }, {}, false, { reporters: ["console"], langs: ["ru"], dir: "out" }],
  ["an unknown reporter", { reporter: "pdf" }, {}, false, "test.unknownReporter"],
  ["an unknown language", { "report-lang": "de" }, {}, false, "test.unknownReportLang"],
])("%s", (_, values, env, ci, expected) => {
  expect(pick(values, env, ci) as unknown).toEqual(expected);
});

test("the config's reporters and languages hold outside CI and in it", () => {
  const config = { ...DEFAULT_CONFIG, reporters: ["html"], reportLangs: ["en", "ru"] };
  expect(pick({}, {}, true, config)).toEqual({ reporters: ["html"], langs: ["en", "ru"], dir: ".ctxray/report" });
});
