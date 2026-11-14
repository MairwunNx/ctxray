import { globProblem } from "#shared/glob/index.ts";
import { type Inventory, type Problem, problem } from "../inventory.ts";
import { matchingGlob, type Project } from "../project.ts";

// L3 finds dead rules for free: a glob no file of the repository matches never loads its rule.
export const findDeadRules = (project: Project, inventory: Inventory): Problem[] =>
  [...inventory.instructions, ...inventory.skills].flatMap(({ path, dir, globs }) => {
    const valid = (globs ?? []).filter((pattern) => globProblem(pattern) === undefined);
    if (valid.length === 0) return [];
    const dead = valid.filter((pattern) => !project.files.some((file) => matchingGlob([pattern], dir, file)));
    if (dead.length === valid.length)
      return [problem("resolve.deadRule", "warning", path, { patterns: dead.join(", ") })];
    return dead.map((pattern) => problem("resolve.deadPattern", "warning", path, { pattern }));
  });
