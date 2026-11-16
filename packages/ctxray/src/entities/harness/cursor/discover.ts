import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { firstLine, listOf, splitFrontmatter, textOf } from "#shared/markdown/index.ts";
import type { Command, Instruction, Inventory, McpDeclaration, Problem, Skill } from "../inventory.ts";
import { problem } from "../inventory.ts";
import { type Project, readMatching } from "../project.ts";
import { readSkillFiles } from "../skill-file.ts";
import { cursorFrontmatter } from "./frontmatter.ts";

const RULE = /^(?:(.*)\/)?\.cursor\/rules\/(?:.+\/)?[^/]+\.mdc$/;
const CONTEXT = /^(?:(.*)\/)?(AGENTS\.md|CLAUDE\.md|CLAUDE\.local\.md)$/;
const SKILL = /^(?:(.*)\/)?\.(?:cursor|agents|claude|codex|grok)\/skills\/(?:.+\/)?([^/]+)\/SKILL\.md$/;
const COMMAND = /^(?:(.*)\/)?\.cursor\/commands\/(.+)\.md$/;
const MCP = /^(?:(.*)\/)?\.cursor\/mcp\.json$/;

// Cursor picks a rule by a fixed order (ADR 0009): `alwaysApply` first, then `globs`, then a `description`
// the model fetches it by, and a rule with none of them waits for the user to attach it. Only a real `true`
// counts: `alwaysApply: yes` stays a string to Cursor.
const ruleOf = (path: string, dir: string, text: string): Instruction => {
  const { data, body } = cursorFrontmatter(text);
  const globs = listOf(data["globs"])?.filter((glob) => glob !== "");
  const description = textOf(data["description"]);
  const base = { path, dir, kind: "rule" as const, imports: [], text: body };
  if (data["alwaysApply"] === true) return { ...base, activation: "always" };
  if (globs && globs.length > 0) return { ...base, activation: "path", globs };
  if (description !== undefined) return { ...base, activation: "intent", description };
  return { ...base, activation: "manual" };
};

const findSkills = async (project: Project, problems: Problem[]): Promise<Skill[]> =>
  (await readSkillFiles(project, SKILL, problems)).map(({ path, dir, folder, frontmatter: { data, body } }) => {
    const name = textOf(data["name"]) ?? folder;
    const description = textOf(data["description"]) ?? firstLine(body);
    if (description === undefined) problems.push(problem("lint.noDescription", "warning", path, { name }));
    const globs = listOf(data["paths"]);
    const listed = data["disable-model-invocation"] !== true;
    return { name, path, dir, description: description ?? "", listed, body, ...(globs ? { globs } : {}) };
  });

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const findMcp = async (project: Project, problems: Problem[]): Promise<McpDeclaration[]> =>
  (await readMatching(project, MCP)).flatMap(({ path, text }) => {
    let raw: Record<string, unknown>;
    try {
      raw = record(JSON.parse(text));
    } catch (error) {
      problems.push(problem("lint.badJson", "error", path, { message: error instanceof Error ? error.message : "" }));
      return [];
    }
    return Object.entries(record(raw["mcpServers"])).map(([name, value]) => {
      const server = record(value);
      if (typeof server["command"] !== "string" && typeof server["url"] !== "string") {
        problems.push(problem("lint.mcpTransport", "error", path, { name }));
      }
      return { name, path, enabled: true };
    });
  });

const findCommands = async (project: Project): Promise<Command[]> =>
  (await readMatching(project, COMMAND)).map(({ path, match, text }) => {
    const { data, body } = splitFrontmatter(text);
    const description = textOf(data["description"]) ?? firstLine(body) ?? "";
    return { name: match[2] ?? "", path, dir: match[1] ?? "", description, body };
  });

// A CLAUDE.md that is the same file as the AGENTS.md beside it, through a symlink either way, loads once, as
// AGENTS.md. Two files with the same text both load: Cursor goes by the file, not by what it says.
const sameFiles = async (project: Project, paths: readonly string[]) => {
  const real = (path: string) => realpath(join(project.root, path)).catch(() => path);
  const twins = await Promise.all(
    paths
      .filter((path) => /(^|\/)CLAUDE\.md$/.test(path))
      .map(async (path) => {
        const agents = path.replace(/CLAUDE\.md$/, "AGENTS.md");
        return paths.includes(agents) && (await real(path)) === (await real(agents)) ? path : undefined;
      }),
  );
  return new Set(twins.filter((path) => path !== undefined));
};

// Cursor CLI and the Cursor editor share one rules system: one discovery serves both (ADR 0010).
export const discoverCursor = async (project: Project, harness: "cursor-cli" | "cursor-ide"): Promise<Inventory> => {
  const problems: Problem[] = [];
  const skillProblems: Problem[] = [];
  const mcpProblems: Problem[] = [];
  const [rules, contexts, legacy, skills, commands, mcp] = await Promise.all([
    readMatching(project, RULE),
    readMatching(project, CONTEXT),
    project.read(".cursorrules"),
    findSkills(project, skillProblems),
    findCommands(project),
    findMcp(project, mcpProblems),
  ]);
  const kinds = { "AGENTS.md": "agents", "CLAUDE.md": "memory", "CLAUDE.local.md": "local" } as const;
  const twins = await sameFiles(
    project,
    contexts.map((context) => context.path),
  );
  const instructions: Instruction[] = [
    ...contexts
      .filter(({ path }) => !twins.has(path))
      .map(({ path, match, text }): Instruction => {
        const kind = kinds[match[2] as keyof typeof kinds];
        return { path, dir: match[1] ?? "", kind, imports: [], text };
      }),
    ...rules.map(({ path, match, text }) => ruleOf(path, match[1] ?? "", text)),
    // The legacy .cursorrules at the root always applies.
    ...(legacy === undefined
      ? []
      : [{ path: ".cursorrules", dir: "", kind: "rule", imports: [], text: legacy } as const]),
  ];
  return {
    harness,
    instructions,
    skills,
    commands,
    mcp,
    problems: [...problems, ...skillProblems, ...mcpProblems],
  };
};
