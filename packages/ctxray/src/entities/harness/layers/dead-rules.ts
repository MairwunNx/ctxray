import { globProblem } from "#shared/glob/index.ts";
import { type Inventory, type Problem, problem } from "../inventory.ts";
import { anchored, matchingGlob, type Project } from "../project.ts";

// L3 finds dead rules for free: a glob no file of the repository matches never loads its rule.
export const findDeadRules = (project: Project, inventory: Inventory): Problem[] =>
  [...inventory.instructions, ...inventory.skills].flatMap(({ path, dir, globs }) => {
    const valid = (globs ?? []).filter((pattern) => globProblem(pattern) === undefined);
    if (valid.length === 0) return [];
    // A Cursor rule's glob matches from its folder down, not at any depth.
    const cursor = /(^|\/)\.cursor\/rules\//.test(path);
    const matcher = (pattern: string) => (cursor ? anchored(pattern) : pattern);
    const dead = valid.filter((pattern) => !project.files.some((file) => matchingGlob([matcher(pattern)], dir, file)));
    if (dead.length === valid.length)
      return [problem("resolve.deadRule", "warning", path, { patterns: dead.join(", ") })];
    return dead.map((pattern) => problem("resolve.deadPattern", "warning", path, { pattern }));
  });
