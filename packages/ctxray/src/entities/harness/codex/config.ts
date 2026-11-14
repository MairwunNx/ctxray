import { type McpDeclaration, type Problem, problem } from "../inventory.ts";
import type { Project } from "../project.ts";

export const CONFIG_PATH = ".codex/config.toml";
const DEFAULT_BUDGET = 32 * 1024;

// The parts of `.codex/config.toml` that change what Codex loads from the project.
export type CodexConfig = {
  budget: number;
  fallbacks: readonly string[];
  mcp: readonly McpDeclaration[];
  // Skills switched off by `[[skills.config]]`, by name or by absolute path.
  disabledSkills: (name: string, absolutePath: string) => boolean;
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export const readCodexConfig = async (project: Project, problems: Problem[]): Promise<CodexConfig> => {
  const text = await project.read(CONFIG_PATH);
  let raw: Record<string, unknown> = {};
  try {
    raw = record(text === undefined ? {} : Bun.TOML.parse(text));
  } catch (error) {
    problems.push(
      problem("lint.badToml", "error", CONFIG_PATH, {
        harness: "Codex",
        message: error instanceof Error ? error.message : "",
      }),
    );
  }
  const budget = raw["project_doc_max_bytes"];
  const mcp = Object.entries(record(raw["mcp_servers"])).map(([name, value]) => {
    const server = record(value);
    if (typeof server["command"] !== "string" && typeof server["url"] !== "string") {
      problems.push(problem("lint.mcpTransport", "error", CONFIG_PATH, { name }));
    }
    return { name, path: CONFIG_PATH, enabled: server["enabled"] !== false };
  });
  const entries = Array.isArray(record(raw["skills"])["config"]) ? (record(raw["skills"])["config"] as unknown[]) : [];
  // When several entries match a skill, the last one wins.
  const disabledSkills = (name: string, absolutePath: string) => {
    const match = entries.map(record).findLast((entry) => entry["name"] === name || entry["path"] === absolutePath);
    return match?.["enabled"] === false;
  };
  return {
    budget: typeof budget === "number" && budget > 0 ? budget : DEFAULT_BUDGET,
    fallbacks: strings(raw["project_doc_fallback_filenames"]),
    mcp,
    disabledSkills,
  };
};
