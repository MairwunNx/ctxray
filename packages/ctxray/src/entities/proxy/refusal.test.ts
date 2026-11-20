import { expect, test } from "bun:test";
import { refusalOf, type UpstreamAnswer } from "./refusal.ts";

const INVALID = JSON.stringify({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } });

test.each<[string, UpstreamAnswer[], ReturnType<typeof refusalOf>]>([
  ["no answers", [], undefined],
  ["a turn that went through", [{ position: 0, status: 200, text: "{}" }], undefined],
  ["a refused turn", [{ position: 0, status: 401, text: INVALID }], { status: 401, message: "Invalid API key" }],
  [
    "a retry after a rate limit",
    [
      { position: 0, status: 429, text: INVALID },
      { position: 0, status: 200, text: "{}" },
    ],
    undefined,
  ],
  [
    "a side call that failed after a good turn",
    [
      { position: 0, status: 200, text: "{}" },
      { status: 404, text: "not found" },
    ],
    undefined,
  ],
  [
    "only side calls, the last refused",
    [{ status: 503, text: " upstream\n down " }],
    { status: 503, message: "upstream down" },
  ],
])("%s", (_, answers, expected) => {
  expect(refusalOf(answers)).toEqual(expected);
});
