import { type DeclarativeTest, DeclarativeTests } from "#shared/contract/index.ts";
import type { CapturedRequest } from "./captured.ts";
import { corpus } from "./corpus.ts";
import { checkList, checkLoadout } from "./declarative-expect.ts";
import { suite, test } from "./dsl.ts";
import { expect } from "./expect.ts";
import { CheckFailure } from "./failure.ts";
import type { TestOptions } from "./model.ts";
import type { Run, Runs } from "./runs.ts";
import type { Session } from "./session.ts";

const joined = (inline: readonly string[] | undefined, filling: readonly string[] | undefined) => {
  if (!filling) return [...(inline ?? [])];
  (filling as string[]).unshift(...(inline ?? []));
  return filling;
};

const optionsOf = (one: DeclarativeTest): TestOptions => {
  const options: TestOptions = {
    ...(one.requires && { requires: one.requires as NonNullable<TestOptions["requires"]> }),
    ...(one.retries !== undefined && { retries: one.retries }),
  };
  if (one.layer === "L3" || one.layer === "L4" || one.layer === "L5")
    return { ...options, ...(one.cwd && { cwd: one.cwd }) };
  const loaded = one.corpus ? corpus(one.corpus) : undefined;
  return {
    ...options,
    ...(one.cwd && { cwd: one.cwd }),
    ...(one.prompt !== undefined && { prompt: one.prompt }),
    // A corpus fills its lists in while the file loads, before any test runs: the test holds those lists.
    positive: joined(one.positive, loaded?.positive),
    negative: joined(one.negative, loaded?.negative),
    ...(one.samples !== undefined && { samples: one.samples }),
    ...(one.turns !== undefined && { turns: one.turns }),
    ...(one.layer === "L7" && one.min !== undefined && { min: one.min }),
  };
};

const wire = async (session: Session, steps: Extract<DeclarativeTest, { layer: "L5" }>["steps"]) => {
  for (const step of steps) {
    if (step.read !== undefined) await session.model.calls("Read", { path: step.read });
    else if (step.call) await session.model.calls(step.call.tool, step.call.input ?? {});
    else if (step.say !== undefined) await session.model.says(step.say);
    if (!step.expect) continue;
    const next: CapturedRequest = await session.nextRequest();
    checkLoadout(next.loadout, step.expect);
    if (step.expect.agreeWithResolver) expect(next).toAgreeWithResolver();
  }
};

const activate = (runs: Runs, wanted: Extract<DeclarativeTest, { layer: "L6" }>["expect"]) => {
  for (const one of wanted) {
    const group = one.runs === "positive" ? runs.positive : one.runs === "negative" ? runs.negative : runs;
    const matcher = one.skill
      ? expect(group).skill(one.skill)
      : one.rule
        ? expect(group).rule(one.rule)
        : expect(group).anyOf(one.anyOf ?? []);
    if (one.max !== undefined) matcher.not.toActivate({ max: one.max });
    else matcher.toActivate(one.min === undefined ? undefined : { min: one.min });
  }
};

const scenario = (run: Run, wanted: Extract<DeclarativeTest, { layer: "L7" }>["expect"]) => {
  checkList(run.changed, wanted.changed);
  checkList(run.tools, wanted.tools);
  checkList(run.skills, wanted.skills);
  checkList(run.rules, wanted.rules);
};

// Registers the file's tests through the DSL, so they run, skip, and report like any other.
export const registerDeclarative = (text: string) => {
  const parsed = DeclarativeTests.safeParse(Bun.JSONC.parse(text));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CheckFailure("declarative.invalid", { path: issue?.path.join(".") ?? "", message: issue?.message ?? "" });
  }
  for (const one of parsed.data.suites) {
    suite(one.name, one.fixture === undefined ? {} : { fixture: one.fixture }, () => {
      for (const item of one.tests) {
        const options = optionsOf(item);
        if (item.layer === "L3") {
          test.resolve(item.name, options, async ({ resolve }) =>
            checkLoadout(
              await resolve({ ...(item.cwd && { cwd: item.cwd }), ...(item.files && { files: item.files }) }),
              item.expect,
            ),
          );
        } else if (item.layer === "L4") {
          test.assemble(item.name, options, async ({ assemble }) => checkLoadout(await assemble({}), item.expect));
        } else if (item.layer === "L5") {
          test.wire(item.name, options, ({ session }) => wire(session, item.steps));
        } else if (item.layer === "L6") {
          test.activate(item.name, options, ({ runs }) => activate(runs, item.expect));
        } else {
          test.scenario(item.name, options, ({ run }) => scenario(run, item.expect));
        }
      }
    });
  }
};
