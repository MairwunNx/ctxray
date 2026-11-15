import { join } from "node:path";
import { STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { rulesOf } from "./rules.ts";
import type { CellResult } from "./run.ts";
import type { Workspace } from "./scope.ts";

export type Coverage = {
  harness: HarnessId;
  kinds: { activation: string; total: number; tested: number }[];
  untested: string[];
  dead: string[];
  noPrompts: string[];
};

const DEAD = new Set(["resolve.deadRule", "resolve.deadPattern"]);

const deadOf = (results: readonly CellResult[], harness: HarnessId) =>
  results
    .filter((cell) => cell.harness === harness && cell.check === "lint" && cell.failure?.kind === "problems")
    .flatMap((cell) => (cell.failure?.kind === "problems" ? cell.failure.problems : []))
    .filter((problem) => DEAD.has(problem.key))
    .map((problem) => problem.path);

// What the evals saw load: a rule or skill picked by description that no L6 or L7 run loaded has no prompt
// that reaches it.
const evalLoaded = (results: readonly CellResult[], harness: HarnessId, root: string) =>
  new Set(
    results
      .filter((cell) => cell.harness === harness && (cell.layer === "L6" || cell.layer === "L7"))
      .flatMap((cell) =>
        (cell.sessions ?? []).flatMap(({ peak }) =>
          [...peak.rules.map((rule) => rule.path), ...peak.skills.loaded.map((skill) => skill.path)].map((path) =>
            join(cell.fixture ?? root, path),
          ),
        ),
      ),
  );

// How much of the project's rules and skills the run's tests looked at, by how each loads (TASK §4.3).
export const coverageOf = async (
  repository: Workspace,
  harnesses: readonly HarnessId[],
  seen: (harness: HarnessId) => ReadonlySet<string>,
  results: readonly CellResult[],
): Promise<Coverage[]> => {
  const coverage: Coverage[] = [];
  for (const harness of harnesses.filter((id) => STATIC_ADAPTERS[id])) {
    const rules = rulesOf(repository.project, await repository.inventoryOf(harness));
    if (rules.length === 0) continue;
    const looked = seen(harness);
    const loaded = evalLoaded(results, harness, repository.root);
    const at = (path: string) => join(repository.root, path);
    const activations = [...new Set(rules.map((rule) => rule.activation))];
    coverage.push({
      harness,
      kinds: activations.map((activation) => {
        const ofKind = rules.filter((rule) => rule.activation === activation);
        return { activation, total: ofKind.length, tested: ofKind.filter((rule) => looked.has(at(rule.path))).length };
      }),
      untested: rules.filter((rule) => !looked.has(at(rule.path))).map((rule) => rule.path),
      dead: [...new Set(deadOf(results, harness))],
      noPrompts: rules
        .filter((rule) => rule.activation === "intent" && !loaded.has(at(rule.path)))
        .map((rule) => rule.path),
    });
  }
  return coverage;
};
