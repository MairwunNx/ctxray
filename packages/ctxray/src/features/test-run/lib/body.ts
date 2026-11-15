import { checkBroken, collectRuns, judgeScenario, settle } from "./evals.ts";
import { fail } from "./failure.ts";
import { resolveIn } from "./loadout.ts";
import type { TestDefinition } from "./model.ts";
import type { Cell, RunContext } from "./run.ts";
import { type CellScope, inCell } from "./scope.ts";
import { createSession, type Session, type SessionRequest } from "./session.ts";

// L6 and L7: the samples run first, then the body judges them.
const runEval = async (definition: TestDefinition, cell: Cell, scope: CellScope, context: RunContext) => {
  const evals = context.evals ?? fail("activate.noBackend");
  const runs = await collectRuns(definition, cell.key, scope, evals);
  const base = { ...cell.item, harness: scope.harness };
  if (definition.kind === "activate") {
    checkBroken(runs);
    await inCell(scope, () => definition.body({ ...base, runs }));
  } else {
    await judgeScenario(runs, scope, definition.options.min, async (run) => {
      await inCell(scope, () => definition.body({ ...base, run }));
    });
  }
  settle(scope);
};

// What a test body gets: its item, and the tools of its layer. Every session it opened ends with it, and a
// session that fails to end (the harness crashed, or reached for the internet) fails the test.
export const runBody = async (definition: TestDefinition, cell: Cell, scope: CellScope, context: RunContext) => {
  if (definition.kind === "activate" || definition.kind === "scenario")
    return runEval(definition, cell, scope, context);
  const sessions: Session[] = [];
  const startSession = (request: SessionRequest = {}) => {
    const session = createSession(context.capture, scope, {
      ...(definition.options.cwd && { cwd: definition.options.cwd }),
      ...request,
    });
    sessions.push(session);
    return session;
  };
  const assemble = async (request: SessionRequest = {}) => (await startSession(request).firstRequest()).loadout;
  const base = { ...cell.item, harness: scope.harness, resolve: resolveIn(scope), assemble, startSession };
  let error: unknown;
  try {
    await inCell(scope, () =>
      definition.body(definition.kind === "wire" ? { ...base, session: startSession() } : base),
    );
  } catch (thrown) {
    error = thrown;
  }
  for (const session of sessions) {
    try {
      await session.end();
    } catch (thrown) {
      error ??= thrown;
    }
  }
  if (error !== undefined) throw error;
};
