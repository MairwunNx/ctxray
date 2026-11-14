import { findImports, listOf, splitFrontmatter } from "#shared/markdown/index.ts";
import { type Instruction, type Problem, problem } from "../inventory.ts";
import { dirOf, joinPath, type Project } from "../project.ts";

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
  const { data, body, error } = splitFrontmatter(text);
  if (error !== undefined) problems.push(problem("lint.frontmatter", "warning", path, { message: error }));
  // `paths` is the only field Claude Code reads from a rule. Cursor's `globs` here does nothing.
  for (const field of Object.keys(data)) {
    if (field !== "paths") problems.push(problem("lint.ruleField", "warning", path, { field }));
  }
  const globs = listOf(data["paths"]);
  return { path, dir, kind: "rule", imports: [], text: body, ...(globs ? { globs } : {}) };
};

export const findInstructions = async (project: Project): Promise<Found> => {
  const problems: Problem[] = [];
  const instructions: Instruction[] = [];
  const add = async (path: string, dir: string, kind: Instruction["kind"]) => {
    const text = await project.read(path);
    if (text === undefined) return;
    if (Buffer.byteLength(text) > MAX_BYTES) problems.push(problem("lint.tooLarge", "error", path, { limit: "4 MiB" }));
    else instructions.push({ path, dir, kind, imports: [], text });
  };
  for (const path of project.files) {
    const context = contextOf(path);
    if (context) await add(path, context.dir, context.kind);
    const rule = RULE.exec(path);
    const text = rule ? await project.read(path) : undefined;
    if (rule && text !== undefined) instructions.push(ruleOf(path, rule[1] ?? "", text, problems));
  }
  // CLAUDE.local.md is usually gitignored, so it gets looked up in every directory.
  for (const dir of project.dirs) await add(joinPath(dir, "CLAUDE.local.md"), dir, "local");
  const imported = await expandImports(project, instructions, problems);
  return { instructions: [...instructions, ...imported], problems };
};

// `@path` pulls a file in, relative to the importing file, up to four hops deep. A path outside the
// project needs the user's approval, so a static view leaves it out.
const expandImports = async (project: Project, roots: Instruction[], problems: Problem[]) => {
  const imported = new Map<string, Instruction>();
  const visit = async (instruction: Instruction, hops: number): Promise<Instruction> => {
    const targets: string[] = [];
    for (const { target, line } of findImports(instruction.text)) {
      if (/^[~/]/.test(target)) continue;
      const path = joinPath(dirOf(instruction.path), target);
      if (path.startsWith("../")) continue;
      if (!(await project.exists(path))) {
        if (FILE_LIKE.test(target))
          problems.push(problem("lint.importMissing", "warning", instruction.path, { target }, line));
        continue;
      }
      if (hops === MAX_HOPS) {
        problems.push(problem("lint.importDepth", "warning", instruction.path, { target, hops: MAX_HOPS }, line));
        continue;
      }
      targets.push(path);
      if (imported.has(path) || roots.some((root) => root.path === path)) continue;
      const text = (await project.read(path)) ?? "";
      const child: Instruction = { path, dir: dirOf(path), kind: "import", imports: [], text };
      imported.set(path, child);
      imported.set(path, await visit(child, hops + 1));
    }
    return { ...instruction, imports: targets };
  };
  for (const [index, root] of roots.entries()) {
    if (root.kind !== "rule") roots[index] = await visit(root, 0);
  }
  return [...imported.values()];
};
