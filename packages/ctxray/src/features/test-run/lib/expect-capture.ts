import { PROFILES } from "#entities/harness/index.ts";
import { type CapturedRequest, isRequest } from "./captured.ts";
import { CheckFailure, type FailureLine, fail, show } from "./failure.ts";
import type { Rule } from "./rules.ts";

const requestOf = (actual: unknown, matcher: string): CapturedRequest =>
  isRequest(actual) ? actual : fail("expect.notRequest", { matcher, received: show(actual) });

type Check = (pass: boolean, matcher: string, lines: () => FailureLine[]) => void;

// L5 matchers on one request of a session.
export const captureMatchers = (actual: unknown, negated: boolean, check: Check) => ({
  // The rule is in context at this request. With `.not`: this request didn't bring it in, so a rule an
  // earlier read loaded doesn't fail a later read of a file it doesn't match.
  toLoadRule: (rule: Rule | string) => {
    const request = requestOf(actual, "toLoadRule()");
    const path = typeof rule === "string" ? rule : rule.path;
    const present = request.loadout.rules.some((entry) => entry.path === path);
    const added = request.added.rules.includes(path);
    check(negated ? added : present, "toLoadRule(rule)", () => [
      { label: negated ? "expect.unexpected" : "expect.missing", value: path },
      { label: "expect.received", value: request.loadout.rules.map((entry) => entry.path).join(", ") || "—" },
    ]);
  },
  // What the harness loaded matches what ctxray's L3 resolver predicts for the same cwd and files read.
  toAgreeWithResolver: () => {
    if (negated) fail("expect.noNot", { matcher: "toAgreeWithResolver()" });
    const { loadout, predicted } = requestOf(actual, "toAgreeWithResolver()");
    const loaded = new Set(loadout.rules.map((rule) => rule.path));
    const expected = new Set(predicted.rules.map((rule) => rule.path));
    const projectSkills = new Set(loadout.skills.listed.filter((skill) => !skill.builtin).map((skill) => skill.name));
    const predictedSkills = new Set(predicted.skills.listed.map((skill) => skill.name));
    const onlyHarness = [...loaded.difference(expected), ...projectSkills.difference(predictedSkills)];
    const onlyResolver = [...expected.difference(loaded), ...predictedSkills.difference(projectSkills)];
    if (onlyHarness.length === 0 && onlyResolver.length === 0) return;
    const harness = PROFILES[loadout.harness].title;
    throw new CheckFailure("drift.found", { harness, version: loadout.version }, [
      ...(onlyHarness.length > 0 ? [{ label: "drift.onlyHarness" as const, value: onlyHarness.join(", ") }] : []),
      ...(onlyResolver.length > 0 ? [{ label: "drift.onlyResolver" as const, value: onlyResolver.join(", ") }] : []),
    ]);
  },
});
