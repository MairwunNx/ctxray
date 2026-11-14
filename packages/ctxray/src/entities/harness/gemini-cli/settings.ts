import { type McpDeclaration, type Problem, problem } from "../inventory.ts";
import { type Project, readMatching } from "../project.ts";

const SETTINGS = /^(?:(.*)\/)?\.gemini\/settings\.json$/;

// The parts of `.gemini/settings.json` that change what Gemini CLI loads. It reads the file only in the
// folder it starts in, so each folder's settings count for a session started there (ADR 0007).
export type GeminiSettings = { dir: string; path: string; contextFiles: string[]; mcp: McpDeclaration[] };

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : Array.isArray(value) ? value.map(String) : [];

const parse = (text: string, path: string, problems: Problem[]): Record<string, unknown> => {
  try {
    return record(Bun.JSONC.parse(text));
  } catch (error) {
    problems.push(problem("lint.badJson", "error", path, { message: error instanceof Error ? error.message : "" }));
    return {};
  }
};

export const readGeminiSettings = async (project: Project, problems: Problem[]): Promise<GeminiSettings[]> =>
  (await readMatching(project, SETTINGS)).map(({ path, match, text }) => {
    const raw = parse(text, path, problems);
    // `mcp.allowed` keeps only the servers it names, `mcp.excluded` drops the ones it names.
    const allowed = strings(record(raw["mcp"])["allowed"]);
    const excluded = strings(record(raw["mcp"])["excluded"]);
    const mcp = Object.entries(record(raw["mcpServers"])).map(([name, value]) => {
      const server = record(value);
      if (!["command", "url", "httpUrl"].some((key) => typeof server[key] === "string")) {
        problems.push(problem("lint.mcpTransport", "error", path, { name }));
      }
      const enabled = !excluded.includes(name) && (allowed.length === 0 || allowed.includes(name));
      return { name, path, enabled };
    });
    const contextFiles = strings(record(raw["context"])["fileName"]).map((name) => name.trim());
    return { dir: match[1] ?? "", path, contextFiles: contextFiles.filter((name) => name !== ""), mcp };
  });
