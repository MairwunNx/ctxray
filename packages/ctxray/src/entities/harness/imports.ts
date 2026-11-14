import { inParallel } from "#shared/infra/index.ts";
import { findImports } from "#shared/markdown/index.ts";
import { type Instruction, type Problem, problem } from "./inventory.ts";
import { dirOf, joinPath, type Project } from "./project.ts";

const FILE_LIKE = /\.[A-Za-z0-9]+$/;

type Reference = { target: string; line: number; path: string; present: boolean };

// The imports of one file that point inside the project, each checked for existence in parallel.
const referencesOf = async (project: Project, instruction: Instruction): Promise<Reference[]> => {
  const inside = findImports(instruction.text)
    .filter(({ target }) => !/^[~/]/.test(target))
    .map((reference) => ({ ...reference, path: joinPath(dirOf(instruction.path), reference.target) }))
    .filter(({ path }) => !path.startsWith("../"));
  const present = await inParallel(inside, ({ path }) => project.exists(path));
  return inside.map((reference, index) => ({ ...reference, present: present[index] === true }));
};

// `@path` pulls a file in, relative to the importing file, up to `maxHops` deep: Claude Code and Gemini CLI
// both do it. A path outside the project needs the user's approval, so a static view leaves it out. One hop
// at a time, every file of a hop in parallel, so a file reached by two paths counts at its shortest depth.
export const expandImports = async (
  project: Project,
  roots: Instruction[],
  problems: Problem[],
  maxHops: number,
): Promise<Instruction[]> => {
  const known = new Map(roots.map((root) => [root.path, root]));
  const imports = new Map<string, string[]>();
  let hop = roots.filter((root) => root.kind !== "rule");
  for (let hops = 0; hop.length > 0; hops++) {
    const references = await inParallel(hop, (instruction) => referencesOf(project, instruction));
    const next: string[] = [];
    hop.forEach((instruction, index) => {
      const targets: string[] = [];
      for (const { target, line, path, present } of references[index] ?? []) {
        if (!present) {
          if (FILE_LIKE.test(target))
            problems.push(problem("lint.importMissing", "warning", instruction.path, { target }, line));
        } else if (hops === maxHops) {
          problems.push(problem("lint.importDepth", "warning", instruction.path, { target, hops: maxHops }, line));
        } else {
          targets.push(path);
          if (!known.has(path) && !next.includes(path)) next.push(path);
        }
      }
      imports.set(instruction.path, targets);
    });
    const texts = await project.readAll(next);
    hop = next.map((path, index) => ({
      path,
      dir: dirOf(path),
      kind: "import",
      imports: [],
      text: texts[index] ?? "",
    }));
    for (const child of hop) known.set(child.path, child);
  }
  return [...known.values()].map((instruction) => ({ ...instruction, imports: imports.get(instruction.path) ?? [] }));
};
