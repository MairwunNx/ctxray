import { expect, test } from "bun:test";
import { parseGenerated, questionFor } from "./prompt.ts";

test.each<[string, string, ReturnType<typeof parseGenerated>]>([
  [
    "plain JSON",
    '{"positive":["Refund order 5"],"negative":["Show order 5"]}',
    { positive: ["Refund order 5"], negative: ["Show order 5"] },
  ],
  [
    "fenced, with words around",
    'Sure:\n```json\n{"positive": ["Верни деньги"], "negative": []}\n```',
    { positive: ["Верни деньги"], negative: [] },
  ],
  ["no positives", '{"positive": [], "negative": ["x"]}', undefined],
  ["not JSON", "I can't help with that.", undefined],
])("%s", (_, answer, expected) => {
  expect(parseGenerated(answer)).toEqual(expected);
});

test("the question carries the description and the count", () => {
  const question = questionFor(
    { path: "a/SKILL.md", name: "refunds", kind: "skill", description: "Issue refunds." },
    4,
  );
  expect(question).toContain("Issue refunds.");
  expect(question).toContain("Write 4 requests");
});
