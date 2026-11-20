import { expect, test } from "bun:test";
import type { Exchange } from "#shared/contract/index.ts";
import { segmentCodex } from "./segment.ts";

const WORK = "/run/work";

const SKILL = "Output:\n---\nname: refunds\ndescription: Refunds\n---\nCall refund().";

const request = (cmd: string, output = SKILL): Exchange => ({
  seq: 0,
  session: "s",
  protocol: "responses",
  path: "/v1/responses",
  retries: 0,
  headers: {},
  body: {
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Refund order 123." }] },
      { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd }) },
      { type: "function_call_output", call_id: "c1", output },
    ],
  },
});

// Codex loads a skill by reading its SKILL.md through the shell: that output is the skill's body.
test.each<[string, string, string[], string?]>([
  ["cat by absolute path", `cat '${WORK}/.agents/skills/refunds/SKILL.md'`, ["loaded:.agents/skills/refunds"]],
  ["sed by relative path", "sed -n '1,200p' .agents/skills/refunds/SKILL.md", ["loaded:.agents/skills/refunds"]],
  ["a read of something else", "cat src/refunds/refund.ts", [], SKILL],
  ["a search that names the file", "find . -path '*/refunds/SKILL.md'", [], "./.agents/skills/refunds/SKILL.md"],
  ["a read that failed", "sed -n '1,200p' .codex/skills/refunds/SKILL.md", [], "sed: No such file or directory"],
  ["a patch of the file", "apply_patch <<'PATCH'\n*** Update File: .agents/skills/refunds/SKILL.md", [], "Success."],
])("%s", (_, cmd, loaded, output = SKILL) => {
  const skills = segmentCodex(request(cmd, output), WORK).filter((segment) => segment.component === "skills");
  expect(skills.map((segment) => segment.id)).toEqual(loaded);
});
