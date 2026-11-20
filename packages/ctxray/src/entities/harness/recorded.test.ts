import { expect, test } from "bun:test";
import { join } from "node:path";
import { readRollout } from "./codex/rollout.ts";
import { readChat } from "./gemini-cli/chat.ts";
import { type HistoryRows, readHistory } from "./opencode/history.ts";
import type { Recorded } from "./recorded.ts";

// Sessions of the three harnesses on the mock: a read of src/payments/charge.ts, then the refunds skill, then “done”.
const FIXTURES = join(import.meta.dir, "../../../fixtures/transcripts");
const read = (name: string) => Bun.file(join(FIXTURES, name)).text();

const records: [string, () => Promise<Recorded>, string][] = [
  ["codex", async () => readRollout(await read("codex-0.171.0.jsonl"), "c"), "function_call_output"],
  ["gemini-cli", async () => readChat(await read("gemini-cli-0.70.0.jsonl"), "g"), "activated_skill"],
  [
    "opencode",
    async () => readHistory(JSON.parse(await read("opencode-1.19.6.json")) as HistoryRows, "o"),
    "skill_content",
  ],
];

test.each(records)(
  "%s: a request per model turn, the latest one holding what the tools brought",
  async (_, load, last) => {
    const recorded = await load();
    expect(recorded.requests).toHaveLength(3);
    expect(JSON.stringify(recorded.requests.at(-1)?.body)).toContain(last);
    expect(JSON.stringify(recorded.requests[0]?.body)).not.toContain(last);
    expect(recorded.reported).toBeGreaterThan(0);
    expect(recorded.unseen).toContain("tools");
  },
);

test("codex: the base prompt opens the input, the rollout's own bookkeeping stays out", async () => {
  const recorded = await records[0]?.[1]();
  const input = recorded?.requests.at(-1)?.body["input"] as Record<string, unknown>[];
  expect(JSON.stringify(input[0])).toContain("You are Codex");
  expect(JSON.stringify(input)).not.toContain("internal_chat_message_metadata_passthrough");
  expect([recorded?.version, recorded?.model, recorded?.cwd]).toEqual(["0.171.0", "gpt-5.5", "<work>"]);
});

test.each([
  ["gemini-cli", 1],
  ["opencode", 2],
])("%s: the files read before the latest request", async (harness, index) => {
  const recorded = await records[index]?.[1]();
  expect(recorded?.files).toEqual(["<work>/src/payments/charge.ts"]);
  expect(recorded?.model).toBe(harness === "opencode" ? "claude-sonnet-5-5" : "gemini-2.5-flash");
});

test("a half-written or broken file gives no requests, not an error", () => {
  expect(readRollout('{"type":"session_meta"\n', "x").requests).toEqual([]);
  expect(readChat("not json\n", "x").requests).toEqual([]);
});
