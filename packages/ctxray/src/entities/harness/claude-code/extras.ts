import { firstLine, flagOf, listOf, splitFrontmatter, textOf } from "#shared/markdown/index.ts";
import { type Command, type McpDeclaration, type Problem, problem, type Skill } from "../inventory.ts";
import { type Project, readMatching } from "../project.ts";
import { readSkillFiles } from "../skill-file.ts";

const SKILL = /^(?:(.*)\/)?\.claude\/skills\/([^/]+)\/SKILL\.md$/;
const COMMAND = /^(?:(.*)\/)?\.claude\/commands\/(?:.+\/)?([^/]+)\.md$/;
// Claude Code cuts description plus when_to_use at this length in the skill listing.
const LISTING_LIMIT = 1536;

export const findSkills = async (project: Project, problems: Problem[]): Promise<Skill[]> =>
  (await readSkillFiles(project, SKILL, problems)).map(({ path, dir, folder, frontmatter: { data, body } }) => {
    // Claude Code 2.1 names a skill by its folder and shows a different `name` after it: `- folder (name):`.
    const name = folder;
    const declared = textOf(data["name"]);
    if (declared !== undefined && declared !== folder) {
      problems.push(problem("lint.skillFolderName", "warning", path, { name: declared, folder }));
    }
    const when = textOf(data["when_to_use"]);
    const own = textOf(data["description"]) ?? firstLine(body);
    if (own === undefined) problems.push(problem("lint.noDescription", "warning", path, { name }));
    const description = [own, when].filter((part) => part !== undefined).join(" ");
    if (description.length > LISTING_LIMIT) {
      problems.push(
        problem("lint.longDescription", "warning", path, { length: description.length, limit: LISTING_LIMIT }),
      );
    }
    const globs = listOf(data["paths"]);
    const listed = flagOf(data["disable-model-invocation"]) !== true;
    return {
      name,
      path,
      dir,
      description: description.slice(0, LISTING_LIMIT),
      listed,
      body,
      ...(globs ? { globs } : {}),
    };
  });

export const findCommands = async (project: Project): Promise<Command[]> =>
  (await readMatching(project, COMMAND)).map(({ path, match, text }) => {
    const { data, body } = splitFrontmatter(text);
    const description = textOf(data["description"]) ?? firstLine(body) ?? "";
    return { name: match[2] ?? "", path, dir: match[1] ?? "", description, body };
  });

const parseJson = (text: string, path: string, problems: Problem[]): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    problems.push(problem("lint.badJson", "error", path, { message: error instanceof Error ? error.message : "" }));
    return undefined;
  }
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

// Project servers live in .mcp.json. Settings can switch some of them off.
export const findMcp = async (project: Project, problems: Problem[]): Promise<McpDeclaration[]> => {
  const path = ".mcp.json";
  const settings = [".claude/settings.json", ".claude/settings.local.json"];
  const [text, ...raws] = await project.readAll([path, ...settings]);
  if (text === undefined) return [];
  const disabled = new Set<string>();
  settings.forEach((file, index) => {
    const raw = raws[index];
    const names = raw === undefined ? undefined : record(parseJson(raw, file, problems))["disabledMcpjsonServers"];
    if (Array.isArray(names)) for (const name of names) disabled.add(String(name));
  });
  const servers = record(record(parseJson(text, path, problems))["mcpServers"]);
  return Object.entries(servers).map(([name, server]) => {
    const { command, url } = record(server);
    if (typeof command !== "string" && typeof url !== "string") {
      problems.push(problem("lint.mcpTransport", "error", path, { name }));
    }
    return { name, path, enabled: !disabled.has(name) };
  });
};
