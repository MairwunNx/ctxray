import { describe, expect, test } from "bun:test";
import { countTokens } from "../count.ts";
import { calibratedCounter, factorsOf } from "./calibration.ts";
import { type ContentClass, classify } from "./classify.ts";
import { CORPUS } from "./index.ts";

describe("classify", () => {
  test.each<[string, ContentClass]>([
    ['{"name":"search","description":"Search issues."}', "json"],
    ["Этот репозиторий содержит лаунчер для модпаков.", "nonLatin"],
    ["本仓库包含一个模组包启动器。", "nonLatin"],
    ["fun charge(order: Order) {\n  val total = order.total()\n  return total\n}", "code"],
    ["- refunds: Issue full or partial refunds.\n- payouts: Schedule merchant payouts.", "metadata"],
    ["## Commits\n\nWrite one logical change per commit, and explain why in the body.", "prose"],
  ])("%s", (text, expected) => {
    expect(classify(text)).toBe(expected);
  });

  test("the corpus pieces fall in the classes they stand for", () => {
    const wrong = CORPUS.filter((piece) => classify(piece.text) !== piece.class).map((piece) =>
      piece.text.slice(0, 40),
    );
    expect(wrong).toEqual([]);
  });
});

describe("factorsOf", () => {
  test("the median ratio per class, the spread around it", () => {
    const classes = factorsOf([
      { class: "prose", local: 100, exact: 110 },
      { class: "prose", local: 100, exact: 120 },
      { class: "prose", local: 100, exact: 130 },
      { class: "json", local: 50, exact: 50 },
    ]);
    expect(classes.prose).toEqual({ factor: 1.2, low: -0.075, high: 0.075, pieces: 3 });
    expect(classes.json.factor).toBe(1);
    expect(classes.code).toEqual({ factor: 1, low: 0, high: 0, pieces: 0 });
  });

  test("a measured calibration scales local counts by class, an unmeasured one does nothing", () => {
    const base = { method: "local:o200k_base", count: countTokens };
    const classes = factorsOf([{ class: "prose", local: 10, exact: 15 }]);
    const measured = { status: "measured" as const, provider: "anthropic", model: "m", date: "", ctxray: "", classes };
    const scaled = calibratedCounter(base, measured);
    const text = "Write one logical change per commit, and explain why.";
    expect(scaled?.count(text)).toBe(Math.round(countTokens(text) * 1.5));
    expect(calibratedCounter(base, { status: "unmeasured" })).toBeUndefined();
  });
});
