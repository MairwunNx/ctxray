import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Env } from "#shared/infra/index.ts";

// The user's own HOME and environment, for a run with `userScope: "inherit"`, and the project the run copies.
export type UserScope = { home: string; env: Env; project: string };

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
// harness past ctxray. Their hooks and the user's MCP servers come in separately.
export const claudeUserScope = ({ home, env }: UserScope, configDir: string) => {
  const own = env["CLAUDE_CONFIG_DIR"] || join(home, ".claude");
  const names = ["CLAUDE.md", "rules", "skills", "agents", "commands", "output-styles"];
  return names.map((name) => [join(own, name), join(configDir, name)] as const);
};

// Codex: AGENTS.md, the skills, prompts, and hooks of CODEX_HOME, plus the skills in ~/.agents. config.toml
// stays out: ctxray writes its own and adds the user's MCP servers to it.
export const codexUserScope = ({ home, env }: UserScope, codexHome: string, runHome: string) => {
  const own = env["CODEX_HOME"] || join(home, ".codex");
  const names = ["AGENTS.md", "AGENTS.override.md", "skills", "prompts", "hooks.json"];
  return [
    ...names.map((name) => [join(own, name), join(codexHome, name)] as const),
    [join(home, ".agents", "skills"), join(runHome, ".agents", "skills")] as const,
  ];
};

// OpenCode: AGENTS.md, skills, commands, and agents of its config folder, plus the skills in ~/.claude and
// ~/.agents it reads too. opencode.json stays out: ctxray passes its own config and the user's MCP servers.
export const opencodeUserScope = ({ home, env }: UserScope, runHome: string) => {
  const own = join(env["XDG_CONFIG_HOME"] || join(home, ".config"), "opencode");
  const config = join(runHome, ".config", "opencode");
  const names = ["AGENTS.md", "skills", "skill", "commands", "command", "agents", "agent"];
  return [
    ...names.map((name) => [join(own, name), join(config, name)] as const),
    [join(home, ".claude", "CLAUDE.md"), join(runHome, ".claude", "CLAUDE.md")] as const,
    [join(home, ".claude", "skills"), join(runHome, ".claude", "skills")] as const,
    [join(home, ".agents", "skills"), join(runHome, ".agents", "skills")] as const,
  ];
};

// Gemini CLI: GEMINI.md, the skills, commands, and subagents of its folder, plus the skills in ~/.agents.
// settings.json stays out: ctxray writes its own and adds the user's MCP servers and hooks to it.
// Extensions stay out too: they bring MCP servers of their own that would reach the network past ctxray.
export const geminiUserScope = ({ home, env }: UserScope, geminiDir: string, runHome: string) => {
  const own = join(env["GEMINI_CLI_HOME"] || home, ".gemini");
  const names = ["GEMINI.md", "skills", "commands", "agents"];
  return [
    ...names.map((name) => [join(own, name), join(geminiDir, name)] as const),
    [join(home, ".agents", "skills"), join(runHome, ".agents", "skills")] as const,
  ];
};
