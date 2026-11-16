import { listOf, splitFrontmatter } from "#shared/markdown/index.ts";
import { expandImports } from "../imports.ts";
import { type Instruction, type Problem, problem } from "../inventory.ts";
import { joinPath, type Project, readMatching } from "../project.ts";

const CONTEXT = /^(?:(.*)\/)?(CLAUDE|AGENTS)\.md$/;
const RULE = /^(?:(.*)\/)?\.claude\/rules\/.+\.md$/;
const MAX_BYTES = 4 * 1024 * 1024;

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
  const { data: parsed, body, error, loose, tabs, tabsAsIndent } = splitFrontmatter(text);
  const data = tabs ? (tabsAsIndent ?? {}) : parsed;
  // Claude Code reads a rule's frontmatter past the tabs that YAML forbids (spike 0017).
  if (tabs) problems.push(problem("lint.frontmatterTab", "warning", path));
  else if (error !== undefined) {
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
  // `@path` pulls a file in, relative to the importing file, up to four hops deep.
  return { instructions: await expandImports(project, roots, problems, 4), problems };
};
