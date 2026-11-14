import { expect as bunExpect, describe, test } from "bun:test";
import { join } from "node:path";
import { buildLoadout, CAPTURE_ADAPTERS, openProject, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { Exchange } from "#shared/contract/index.ts";
import { type CapturedRequest, toCaptured } from "./captured.ts";
import { expect } from "./expect.ts";
import { CheckFailure } from "./failure.ts";

// Requests Claude Code 2.1.311 sent for the capture fixture, started in `app`, before and after it read Charge.kt.
const FIXTURES = join(import.meta.dir, "../../../../fixtures");
const project = await openProject(join(FIXTURES, "capture/payments"));
const inventory = await STATIC_ADAPTERS["claude-code"]?.discover(project);
const READ = "app/src/main/kotlin/payments/Charge.kt";

const requestOf = async (index: number, files: string[]): Promise<CapturedRequest> => {
  const raw = (await Bun.file(join(FIXTURES, `payloads/claude-code-${index}.json`)).json()) as Exchange;
  const resolve = STATIC_ADAPTERS["claude-code"]?.resolve;
  const segment = CAPTURE_ADAPTERS["claude-code"]?.segment;
  if (!inventory || !resolve || !segment) throw new Error("claude-code adapters");
  const predicted = resolve(inventory, { cwd: "app", files });
  const loadout = buildLoadout({
    harness: { name: "claude-code", version: "2.1.311", model: "claude-sonnet-5-5" },
    segments: segment(raw, "<work>"),
    inventory,
    predicted,
    servers: {},
    work: "<work>",
    first: index === 0,
  });
  const before = index === 0 ? [] : (await requestOf(index - 1, [])).loadout.rules.map((rule) => rule.path);
  const rules = loadout.rules.map((rule) => rule.path).filter((path) => !before.includes(path));
  return { kind: "request", index, loadout: toCaptured(loadout), added: { rules, skills: [] }, predicted, raw };
};

const failureOf = (check: () => void) => {
  try {
    check();
    return undefined;
  } catch (error) {
    if (!(error instanceof CheckFailure)) throw error;
    return [error.key, ...error.lines.map((line) => `${line.label}: ${line.value}`)];
  }
};

describe("toLoadRule", () => {
  test.each<[string, (request: CapturedRequest) => void, string[] | undefined]>([
    ["a rule the read brought in", (request) => expect(request).toLoadRule(".claude/rules/payments.md"), undefined],
    ["a rule from the start, with .not", (request) => expect(request).not.toLoadRule("CLAUDE.md"), undefined],
    [
      "a rule the read brought in, with .not",
      (request) => expect(request).not.toLoadRule(".claude/rules/kotlin.md"),
      ["expect.failed", "expect.unexpected: .claude/rules/kotlin.md", bunExpect.stringContaining("expect.received:")],
    ],
    [
      "a rule that never loaded",
      (request) => expect(request).toLoadRule(".claude/rules/web.md"),
      ["expect.failed", "expect.missing: .claude/rules/web.md", bunExpect.stringContaining("expect.received:")],
    ],
  ])("%s", async (_, check, expected) => {
    const request = await requestOf(1, [READ]);
    bunExpect(failureOf(() => check(request))).toEqual(expected);
  });
});

describe("toAgreeWithResolver", () => {
  test("names what only one side has", async () => {
    // Claude Code 2.1.311 skips the root AGENTS.md that the root CLAUDE.md imports once it starts in `app`.
    const request = await requestOf(0, []);
    bunExpect(failureOf(() => expect(request).toAgreeWithResolver())).toEqual([
      "drift.found",
      "drift.onlyResolver: AGENTS.md",
    ]);
  });

  test("takes only requests", () => {
    bunExpect(failureOf(() => expect({}).toAgreeWithResolver())?.[0]).toBe("expect.notRequest");
  });
});
