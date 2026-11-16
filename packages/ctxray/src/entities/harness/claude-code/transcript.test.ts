import { expect, test } from "bun:test";
import { join } from "node:path";
import { filesOfRequest, readTranscript } from "./transcript.ts";

// A session of Claude Code 2.1.311 with ctxray's plugin, against a mock model: it read app/Main.kt, then the
// user ran /ctxray. Only the entries the reader needs are kept, the paths are placeholders.
const FIXTURE = join(import.meta.dir, "../../../../fixtures/transcripts/claude-code-2.1.311.jsonl");
const { requests, version, cwd } = readTranscript(await Bun.file(FIXTURE).text(), "s");

const rolesOf = (index: number) =>
  ((requests[index]?.body["messages"] ?? []) as { role: string }[]).map(({ role }) => role);

test("each request comes back from the shapes, blobs, and the model's own answers", () => {
  expect([version, cwd, requests.length]).toEqual(["2.1.311", "<work>", 3]);
  expect(rolesOf(0)).toEqual(["user", "system"]);
  // The answer that called Read has no blob: it comes from the transcript's assistant entry.
  expect(rolesOf(1)).toEqual(["user", "system", "assistant", "user", "system"]);
  // --resume lists the history again from the start: the answer that called Read is the same one.
  const history = (index: number) =>
    JSON.stringify(((requests[index]?.body["messages"] ?? []) as unknown[]).slice(0, 5));
  expect(history(2)).toBe(history(1));
  const tools = requests[2]?.body["tools"] as { name: string }[];
  expect(tools.map(({ name }) => name)).toContain("Read");
  expect(JSON.stringify(requests[2]?.body["messages"])).toContain(
    "Base directory for this skill: <plugin>/skills/ctxray",
  );
});

test("the files a request's tool calls touched", () => {
  const [first, second] = requests;
  if (!first || !second) throw new Error("requests");
  expect(filesOfRequest(first)).toEqual([]);
  expect(filesOfRequest(second)).toEqual(["<work>/app/Main.kt"]);
});

test("a transcript without requests, or with broken lines, gives none", () => {
  expect(readTranscript('{"type":"user","cwd":"/a"}\nnot json\n', "s")).toEqual({
    requests: [],
    version: undefined,
    cwd: "/a",
  });
});
