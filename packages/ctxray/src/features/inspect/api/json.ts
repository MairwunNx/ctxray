import { type Problem, ruleOf } from "#entities/harness/index.ts";
import { INSPECTION_SCHEMA_VERSION, type InspectedProblem, type Inspection } from "#shared/contract/index.ts";
import type { InspectResult } from "../inspect.action.ts";

const toProblem = (problem: Problem, message: (problem: Problem) => string): InspectedProblem => ({
  severity: problem.severity,
  key: problem.key,
  ...(ruleOf(problem.key) && { rule: ruleOf(problem.key) }),
  message: message(problem),
  path: problem.path,
  ...(problem.line === undefined ? {} : { line: problem.line }),
});

// `--json` prints the Inspection contract, one line of text per printed line.
export const toJson = (result: InspectResult, message: (problem: Problem) => string): string[] => {
  const inspection: Inspection = {
    schemaVersion: INSPECTION_SCHEMA_VERSION,
    harnesses: result.harnesses.map((harness) => ({
      ...harness,
      problems: harness.problems.map((problem) => toProblem(problem, message)),
    })),
    unsupported: result.unsupported,
  };
  return JSON.stringify(inspection, null, 2).split("\n");
};
