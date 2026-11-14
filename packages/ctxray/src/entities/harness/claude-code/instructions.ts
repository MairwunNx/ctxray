import { inParallel } from "#shared/infra/index.ts";
import { findImports, listOf, splitFrontmatter } from "#shared/markdown/index.ts";
import { type Instruction, type Problem, problem } from "../inventory.ts";
import { dirOf, joinPath, type Project, readMatching } from "../project.ts";

const CONTEXT = /^(?:(.*)\/)?(CLAUDE|AGENTS)\.md$/;
const RULE = /^(?:(.*)\/)?\.claude\/rules\/.+\.md$/;
const MAX_HOPS = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const FILE_LIKE = /\.[A-Za-z0-9]+$/;

type Found = { instructions: Instruction[]; problems: Problem[] };

// A CLAUDE.md inside `.claude/` belongs to the folder that holds `.claude/`.
const contextOf = (path: string) => {
  const match = CONTEXT.exec(path);
  if (!match) return undefined;
  const dir = match[1] ?? "";
  const owner = dir === ".claude" ? "" : dir.endsWith("/.claude") ? dir.slice(0, -"/.claude".length) : dir;
  return { dir: owner, kind: match[2] === "CLAUDE" ? ("memory" as const) : ("agents" as const) };
};

const ruleOf = (path: string, dir: string, text: string, problems: Problem[]): Instruction => {
  const { data, body, error, loose } = splitFrontmatter(text);
  if (error !== undefined) {
    problems.push(problem(loose ? "lint.looseFrontmatter" : "lint.frontmatter", "warning", path, { message: error }));
  }
  // `paths` is the only field Claude Code reads from a rule. Cursor's `globs` here does nothing.
  for (const field of Object.keys(data)) {
    if (field !== "paths") problems.push(problem("lint.ruleField", "warning", path, { field }));
  }
  const globs = listOf(data["paths"]);
  return { path, dir, kind: "rule", imports: [], text: body, ...(globs ? { globs } : {}) };
};

export const findInstructions = async (project: Project): Promise<Found> => {
  const problems: Problem[] = [];
  // CLAUDE.local.md is usually gitignored, so it gets looked up in every directory.
  const locals = project.dirs.map((dir) => joinPath(dir, "CLAUDE.local.md"));
  const [contexts, rules, localTexts] = await Promise.all([
    readMatching(project, CONTEXT),
    readMatching(project, RULE),
    project.readAll(locals),
  ]);
  const sized = (instruction: Instruction): Instruction[] => {
    if (Buffer.byteLength(instruction.text) <= MAX_BYTES) return [instruction];
    problems.push(problem("lint.tooLarge", "error", instruction.path, { limit: "4 MiB" }));
    return [];
  };
  const roots = [
    ...contexts.flatMap(({ path, text }) => {
      const context = contextOf(path);
      return context ? sized({ path, dir: context.dir, kind: context.kind, imports: [], text }) : [];
    }),
    ...rules.map(({ path, match, text }) => ruleOf(path, match[1] ?? "", text, problems)),
    ...locals.flatMap((path, index) => {
      const text = localTexts[index];
      return text === undefined
        ? []
        : sized({ path, dir: project.dirs[index] ?? "", kind: "local", imports: [], text });
    }),
  ];
  return { instructions: await expandImports(project, roots, problems), problems };
};

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

// `@path` pulls a file in, relative to the importing file, up to four hops deep. A path outside the
// project needs the user's approval, so a static view leaves it out. One hop at a time, every file of a
// hop in parallel, so a file reached by two paths counts at its shortest depth.
const expandImports = async (project: Project, roots: Instruction[], problems: Problem[]) => {
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
        } else if (hops === MAX_HOPS) {
          problems.push(problem("lint.importDepth", "warning", instruction.path, { target, hops: MAX_HOPS }, line));
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
