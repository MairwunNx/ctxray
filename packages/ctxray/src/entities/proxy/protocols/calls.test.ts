import { expect, test } from "bun:test";
import type { Json, Protocol } from "../model.ts";
import { callsOf } from "./calls.ts";

const READ = { name: "Read", input: { path: "a.kt" } };

test.each<[Protocol, Json]>([
  [
    "anthropic",
    {
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "ok" },
            { type: "tool_use", ...READ },
          ],
        },
      ],
    },
  ],
  [
    "responses",
    { input: [{ type: "message" }, { type: "function_call", name: "Read", arguments: '{"path":"a.kt"}' }] },
  ],
  [
    "chat",
    {
      messages: [{ role: "assistant", tool_calls: [{ function: { name: "Read", arguments: '{"path":"a.kt"}' } }] }],
    },
  ],
  ["gemini", { contents: [{ role: "model", parts: [{ functionCall: { name: "Read", args: { path: "a.kt" } } }] }] }],
])("%s", (protocol, body) => {
  expect(callsOf(protocol, body)).toEqual([READ]);
});
