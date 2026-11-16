import { posix } from "node:path";
import { firstLine, splitFrontmatter, textOf } from "#shared/markdown/index.ts";
import type { Command, Instruction, Inventory, Problem, Skill } from "../inventory.ts";
import { problem } from "../inventory.ts";
import { type Project, parentDirs, readMatching } from "../project.ts";
import { readSkillFiles } from "../skill-file.ts";
import { type OpencodeConfig, readOpencodeConfigs } from "./config.ts";

// Per folder OpenCode reads the first of these it finds. CLAUDE.md is the fallback Claude Code users get.
export const CONTEXT_NAMES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];
const CONTEXT = /^(?:(.*)\/)?(AGENTS|CLAUDE|CONTEXT)\.md$/;
const SKILL = /^(?:(.*)\/)?\.(?:opencode\/skills?|claude\/skills|agents\/skills)\/(?:.+\/)?([^/]+)\/SKILL\.md$/;
const COMMAND = /^(?:(.*)\/)?\.opencode\/commands?\/(.+)\.md$/;

// A file an `instructions` glob names, relative to the folder it matched from.
const instructionFiles = async (project: Project, configs: readonly OpencodeConfig[]): Promise<Instruction[]> => {
  const patterns = [...new Set(configs.flatMap((config) => config.instructions))].map((one) => new Bun.Glob(one));
  const matched = project.files.flatMap((path) => {
    const dir = parentDirs(path).find((base) =>
      patterns.some((glob) => glob.match(base === "" ? path : path.slice(base.length + 1))),
    );
    return dir === undefined ? [] : [{ path, dir }];
  });
  const texts = await project.readAll(matched.map(({ path }) => path));
  return matched.map(({ path, dir }, index) => ({ path, dir, kind: "rule", imports: [], text: texts[index] ?? "" }));
};

// OpenCode skips a skill without a name or without a description string: `description: ""` passes, a bare
// `description:` doesn't (spike 0017). Skills sit in subfolders too.
const findSkills = async (project: Project, problems: Problem[]): Promise<Skill[]> =>
  (await readSkillFiles(project, SKILL, problems)).map(({ path, dir, folder, frontmatter: { data, body } }) => {
    const name = textOf(data["name"]);
    const given = typeof data["description"] === "string";
    const description = textOf(data["description"]);
    if (name === undefined)
      problems.push(problem("lint.skillField", "error", path, { harness: "OpenCode", field: "name" }));
    else if (!given)
      problems.push(problem("lint.skillField", "error", path, { harness: "OpenCode", field: "description" }));
    else if (description === undefined) problems.push(problem("lint.noDescription", "warning", path, { name }));
    const listed = name !== undefined && given;
    return { name: name ?? folder, path, dir, description: description ?? "", listed, body };
  });

const findCommands = async (project: Project): Promise<Command[]> =>
  (await readMatching(project, COMMAND)).map(({ path, match, text }) => {
    const { data, body } = splitFrontmatter(text);
    const description = textOf(data["description"]) ?? firstLine(body) ?? "";
    return { name: match[2] ?? posix.basename(path, ".md"), path, dir: match[1] ?? "", description, body };
  });

export const discoverOpencode = async (project: Project): Promise<Inventory> => {
  const problems: Problem[] = [];
  const configs = await readOpencodeConfigs(project, problems);
  const skillProblems: Problem[] = [];
  const [contexts, rules, skills, commands] = await Promise.all([
    readMatching(project, CONTEXT),
    instructionFiles(project, configs),
    findSkills(project, skillProblems),
    findCommands(project),
  ]);
  // A CLAUDE.md or CONTEXT.md beside a file OpenCode prefers never loads.
  const shadowed = (path: string, dir: string) =>
    CONTEXT_NAMES.slice(0, CONTEXT_NAMES.indexOf(posix.basename(path))).some((name) =>
      contexts.some((other) => other.path === (dir === "" ? name : `${dir}/${name}`)),
    );
  const own = contexts.map(({ path, match, text }): Instruction => {
    const kind = match[2] === "AGENTS" ? "agents" : "memory";
    return { path, dir: match[1] ?? "", kind, imports: [], text };
  });
  const instructions: Instruction[] = [
    ...own.filter((file) => !shadowed(file.path, file.dir)),
    ...rules.filter((rule) => !contexts.some((context) => context.path === rule.path)),
  ];
  return {
    harness: "opencode",
    instructions,
    skills,
    commands: [...commands, ...configs.flatMap((config) => config.commands)],
    mcp: configs.flatMap((config) => config.mcp),
    problems: [...problems, ...skillProblems],
    ignored: own.filter((file) => shadowed(file.path, file.dir)).map((file) => file.path),
    instructionGlobs: Object.fromEntries(configs.map((config) => [config.dir, config.instructions])),
  };
};
