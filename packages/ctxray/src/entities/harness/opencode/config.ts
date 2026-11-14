import { textOf } from "#shared/markdown/index.ts";
import type { Command, McpDeclaration, Problem } from "../inventory.ts";
import { problem } from "../inventory.ts";
import { type Project, readMatching } from "../project.ts";

const CONFIG = /^(?:(.*)\/)?(?:\.opencode\/)?opencode\.jsonc?$/;

// The parts of an opencode.json that change what OpenCode loads. It merges every config from the git root down
// to the cwd, the deeper one winning (ADR 0008).
export type OpencodeConfig = {
  dir: string;
  path: string;
  instructions: string[]; // globs and paths, matched from the cwd up to the root
  mcp: McpDeclaration[];
  commands: Command[]; // defined in the config itself
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const parse = (text: string, path: string, problems: Problem[]): Record<string, unknown> => {
  try {
    return record(Bun.JSONC.parse(text));
  } catch (error) {
    problems.push(problem("lint.badJson", "error", path, { message: error instanceof Error ? error.message : "" }));
    return {};
  }
};

export const readOpencodeConfigs = async (project: Project, problems: Problem[]): Promise<OpencodeConfig[]> =>
  (await readMatching(project, CONFIG)).map(({ path, match, text }) => {
    const raw = parse(text, path, problems);
    const dir = match[1] ?? "";
    const instructions = (Array.isArray(raw["instructions"]) ? raw["instructions"] : [])
      .map(String)
      .filter((entry) => !/^https?:\/\//.test(entry) && !entry.startsWith("~/") && !entry.startsWith("/"));
    const mcp = Object.entries(record(raw["mcp"])).map(([name, value]) => {
      const server = record(value);
      const local = Array.isArray(server["command"]) || typeof server["command"] === "string";
      if (!local && typeof server["url"] !== "string")
        problems.push(problem("lint.mcpTransport", "error", path, { name }));
      return { name, path, enabled: server["enabled"] !== false };
    });
    const commands = Object.entries(record(raw["command"])).map(([name, value]) => {
      const command = record(value);
      const body = textOf(command["template"]) ?? "";
      return { name, path, dir, description: textOf(command["description"]) ?? "", body };
    });
    return { dir, path, instructions, mcp, commands };
  });
