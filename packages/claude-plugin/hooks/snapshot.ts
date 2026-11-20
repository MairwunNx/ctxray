import type { SessionUsage } from "claude-code";
import type { Piece, Snapshot } from "../types";
import { shortPath } from "./format";
import type { Words } from "./i18n";

// The session's Loadout from Claude Code's own /context breakdown: what it counts is what the model gets.
// `imports` maps an instruction file to the file whose `@` brought it, `used` names the skills that ran.
export type Inputs = {
  usage: SessionUsage;
  imports: Readonly<Record<string, string>>;
  used: readonly string[];
  cwd: string;
  home: string;
  words: Words;
};

const byTokens = (a: Piece, b: Piece) => b.tokens - a.tokens;

// /context paints the system prompt and the built-in tools in the same grey. Each share gets a theme color of
// its own here, so the bar tells them apart in every theme.
const PALETTE: Record<string, string> = {
  "System prompt": "suggestion",
  "System tools": "inactive",
  "MCP tools": "ide",
  "Custom agents": "success",
  "Memory files": "claude",
  Skills: "warning",
  Messages: "permission",
};

// How deep an `@` import sits: CLAUDE.md is 0, a file it imports is 1.
const depthOf = (path: string, imports: Readonly<Record<string, string>>) => {
  let depth = 0;
  for (let at = imports[path]; at !== undefined && depth < 8; at = imports[at]) depth += 1;
  return depth;
};

// Imports stay right under the file that brought them, the rest goes by size.
const ordered = <T extends { path: string; tokens: number }>(
  files: readonly T[],
  imports: Readonly<Record<string, string>>,
) => {
  const out: T[] = [];
  const place = (parent: string | undefined) => {
    const level = files.filter(
      (file) => imports[file.path] === parent || (parent === undefined && !imports[file.path]),
    );
    for (const file of [...level].sort((a, b) => b.tokens - a.tokens)) {
      if (out.includes(file)) continue;
      out.push(file);
      place(file.path);
    }
  };
  place(undefined);
  return [...out, ...files.filter((file) => !out.includes(file))];
};

export const toSnapshot = ({ usage, imports, used, cwd, home, words }: Inputs): Snapshot | null => {
  const breakdown = usage.context.breakdown;
  if (!breakdown) return null;
  const used_ = breakdown.categories.filter((share) => share.kind === "used" && share.tokens > 0);
  const short = (path: string) => shortPath(path, cwd, home);
  const files: Piece[] = ordered(breakdown.memoryFiles, imports).map((file) => {
    const parent = imports[file.path];
    return {
      name: short(file.path),
      tokens: file.tokens,
      depth: depthOf(file.path, imports),
      note: parent ? words.importedBy(short(parent)) : (words.kind[file.type] ?? file.type),
    };
  });
  const builtIn = breakdown.categories.find((share) => share.name === "System tools");
  const deferred = breakdown.categories.find((share) => share.kind === "deferred");
  const servers = new Map<string, { tokens: number; count: number; idle: number }>();
  for (const tool of breakdown.mcpTools) {
    const server = servers.get(tool.serverName) ?? { tokens: 0, count: 0, idle: 0 };
    server.count += 1;
    if (tool.isLoaded) server.tokens += tool.tokens;
    else server.idle += 1;
    servers.set(tool.serverName, server);
  }
  const tools: Piece[] = [
    ...(builtIn ? [{ name: words.builtIn, tokens: builtIn.tokens }] : []),
    ...[...servers]
      .map(([name, server]) => ({ name, tokens: server.tokens, note: words.server(server.count, server.idle) }))
      .sort(byTokens),
    ...(deferred && deferred.tokens > 0 ? [{ name: words.deferred, tokens: deferred.tokens, isIdle: true }] : []),
  ];
  const skills: Piece[] = (breakdown.skills?.skillFrontmatter ?? [])
    .map((skill) => {
      const prefix = skill.pluginName ? `${skill.pluginName}:` : "";
      const name = skill.name.startsWith(prefix) ? skill.name : `${prefix}${skill.name}`;
      const source = words.source[skill.source] ?? skill.source;
      const ran = used.includes(skill.name) || used.includes(name);
      return { name, tokens: skill.tokens, note: ran ? `${source} · ${words.used}` : source };
    })
    .sort(byTokens);
  return {
    model: breakdown.model,
    used: used_.reduce((sum, share) => sum + share.tokens, 0),
    window: breakdown.rawMaxTokens,
    shares: used_
      .map(({ name, tokens, color }) => ({ name, tokens, color: PALETTE[name] ?? color }))
      .sort((a, b) => b.tokens - a.tokens),
    files,
    tools,
    skills,
    servers: servers.size,
    skillsListed: breakdown.skills?.includedSkills ?? 0,
    skillsTotal: breakdown.skills?.totalSkills ?? 0,
  };
};
