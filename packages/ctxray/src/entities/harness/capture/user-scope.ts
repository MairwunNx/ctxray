import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Env } from "#shared/infra/index.ts";

// The user's own HOME and environment, for a run with `userScope: "inherit"`.
export type UserScope = { home: string; env: Env };

// What a harness reads from the user's folders, copied into the run's. Copies, never links: the harness writes
// into its config folder, and a symlinked skill would lead it back into the real one.
export const copyUserScope = async (pairs: readonly (readonly [string, string])[]) => {
  for (const [from, to] of pairs) {
    if (!(await stat(from).catch(() => undefined))) continue;
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, dereference: true, force: true });
  }
};

// The user-level instructions, skills, agents, and commands of Claude Code. Settings stay out: they can point the
// harness past ctxray, and so can user MCP servers in ~/.claude.json.
export const claudeUserScope = ({ home, env }: UserScope, configDir: string) => {
  const own = env["CLAUDE_CONFIG_DIR"] || join(home, ".claude");
  const names = ["CLAUDE.md", "rules", "skills", "agents", "commands", "output-styles"];
  return names.map((name) => [join(own, name), join(configDir, name)] as const);
};

// Codex: AGENTS.md and the skills and prompts of CODEX_HOME, plus the skills in ~/.agents. config.toml stays
// out, ctxray writes its own.
export const codexUserScope = ({ home, env }: UserScope, codexHome: string, runHome: string) => {
  const own = env["CODEX_HOME"] || join(home, ".codex");
  const names = ["AGENTS.md", "AGENTS.override.md", "skills", "prompts"];
  return [
    ...names.map((name) => [join(own, name), join(codexHome, name)] as const),
    [join(home, ".agents", "skills"), join(runHome, ".agents", "skills")] as const,
  ];
};
