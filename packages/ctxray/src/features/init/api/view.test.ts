import { expect, test } from "bun:test";
import { createTranslator } from "#shared/i18n/index.ts";
import { toPlain, widthOf } from "#shared/render/index.ts";
import type { InitStep } from "../init.action.ts";
import { initView } from "./view.ts";

const steps: InitStep[] = [
  { path: "ctxray.config.ts", outcome: "created" },
  { path: "ctxray/loadout.ctxray.ts", outcome: "exists" },
  { path: ".gitignore", outcome: "ignoreAdded" },
];

test.each([
  ["en", ["✓  created", "·  skipped", "✓  updated"], "Next: describe your agent setup"],
  ["ru", ["✓  создан", "·  пропущен", "✓  обновлён"], "Дальше: опишите настройку агента"],
])("%s: every step on its own line, paths in one column", (lang, labels, next) => {
  const lines = toPlain(initView(steps, createTranslator(lang))).split("\n");
  const rows = lines.filter((line) => /^ [✓·]/.test(line));
  expect(rows).toHaveLength(3);
  rows.forEach((row, i) => {
    expect(row).toStartWith(` ${labels[i]}`);
  });
  const pathStarts = rows.map((row, i) => widthOf(row.slice(0, row.indexOf(steps[i]?.path ?? ""))));
  expect(new Set(pathStarts).size).toBe(1);
  expect(lines.some((line) => line.includes(next))).toBe(true);
});
