import type { Catalog } from "../../catalog-type.ts";

export const ru: Catalog = {
  "count.harnesses": {
    one: "{count} харнесс",
    few: "{count} харнесса",
    many: "{count} харнессов",
    other: "{count} харнесса",
  },
  "count.tests": { one: "{count} тест", few: "{count} теста", many: "{count} тестов", other: "{count} теста" },
  "count.rules": { one: "{count} правило", few: "{count} правила", many: "{count} правил", other: "{count} правила" },
  "status.passed": "пройден",
  "status.failed": "упал",
  "status.skipped": "пропущен",
  "status.inconclusive": "не определён",
  "status.flaky": "нестабилен",
  "lang.unsupported": "Язык «{lang}» пока не поддерживается, поэтому ctxray говорит по-английски",
};
