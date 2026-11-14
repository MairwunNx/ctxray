import { expect, test } from "bun:test";
import { canariesIn, normalise, withCanary, withoutCanaries } from "./canary.ts";
import { listing, reminders, splitSections } from "./sections.ts";

test("a canary goes in at the end and comes out without a trace", () => {
  const text = "---\npaths: x\n---\nUse data classes.\n";
  const marked = withCanary(text, ".claude/rules/kotlin.md");
  expect(marked).toBe("---\npaths: x\n---\nUse data classes.\n\n⟦ctx:.claude/rules/kotlin.md⟧\n");
  expect(canariesIn(`${marked} and ${withCanary("b", "b.md")}`)).toEqual([".claude/rules/kotlin.md", "b.md"]);
  expect(withoutCanaries(marked)).toBe("---\npaths: x\n---\nUse data classes.");
  expect(normalise(marked)).toBe("--- paths: x --- Use data classes.");
});

test("sections run from one marker line to the next", () => {
  const markers = [
    { kind: "skills" as const, pattern: /^The following skills/ },
    { kind: "file" as const, pattern: /^Contents of (.+):$/ },
  ];
  const sections = splitSections("intro\nThe following skills:\n- a: one\nContents of x.md:\nbody", markers);
  expect(sections.map((section) => [section.kind, section.match?.[1], section.text])).toEqual([
    [undefined, undefined, "intro"],
    ["skills", undefined, "The following skills:\n- a: one"],
    ["file", "x.md", "Contents of x.md:\nbody"],
  ]);
  expect(listing("- a: one\n- b: two: more\nnot one")).toEqual([
    { name: "a", line: "- a: one" },
    { name: "b", line: "- b: two: more" },
  ]);
});

test("system reminders come apart from the text around them", () => {
  expect(reminders("hi <system-reminder>\none\n</system-reminder> there")).toEqual({
    inside: ["one"],
    outside: "hi  there",
  });
});
