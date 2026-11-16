import type { HarnessId } from "#shared/contract/index.ts";
import { configReadersOf, readersOf } from "../locations.ts";

// A file named or placed almost right: the harness looks for another name and never reads it. Spike 0017
// checked each case against the harnesses themselves on macOS and Linux.
export type NearMiss = { expected: string; kind: "name" | "case"; readers: HarnessId[] };

// Typos and wrong places, each with what the harness reads instead. Matched without regard to case.
const REWRITES: [RegExp, string][] = [
  [/(^|\/)\.agents?\/skills?\//i, "$1.agents/skills/"],
  [/(^|\/)\.(claude|cursor|codex|gemini)\/skill\//i, "$1.$2/skills/"],
  [/(^|\/)\.(claude|cursor)\/rule\//i, "$1.$2/rules/"],
  [/(^|\/)\.(claude|cursor)\/command\//i, "$1.$2/commands/"],
  [/(^|\/)agent\.md$/i, "$1AGENTS.md"],
  [/(^|\/)(claude|agents|gemini)\.markdown$/i, "$1$2.md"],
  [/(^|\/)\.cursor(-?rules?|ules)$/i, "$1.cursorrules"],
  [/^(\.claude\/)?mcp\.json$/i, ".mcp.json"],
  [/^\.mcp\.jsonc$/i, ".mcp.json"],
  [/(^|\/)\.(cursor\/mcp|gemini\/settings)\.jsonc$/i, "$1.$2.json"],
  [/(^|\/)\.codex\/config\.(ya?ml|json)$/i, "$1.codex/config.toml"],
  [/(^|\/)(\.opencode\/)?opencode\.ya?ml$/i, "$1$2opencode.json"],
  // A skill is a folder with SKILL.md in it, never a lone Markdown file.
  [
    /(^|\/)\.(claude|agents|codex|gemini|opencode|cursor)\/(skills?)\/((?!skill\.md$|readme\.md$)[^/]+)\.md$/i,
    "$1.$2/$3/$4/SKILL.md",
  ],
  // Cursor's build reads only .mdc files from .cursor/rules.
  [/(^|\/)\.cursor\/rules\/(.+)\.md$/i, "$1.cursor/rules/$2.mdc"],
];

// The spelling each harness looks for, by its lowercase form.
const CANONICAL = new Map(
  [
    ...["CLAUDE.md", "CLAUDE.local.md", "AGENTS.md", "AGENTS.override.md", "GEMINI.md", "SKILL.md", ".cursorrules"],
    ...[".claude", ".cursor", ".agents", ".codex", ".gemini", ".opencode", "rules", "skills", "skill", "commands"],
    ...[".mcp.json", "mcp.json", "settings.json", "config.toml", "opencode.json", "opencode.jsonc", "agents"],
  ].map((name) => [name.toLowerCase(), name]),
);
const HARNESS_FOLDER = /^\.(claude|cursor|agents|codex|gemini|opencode)$/i;

// Only the harness's folder, the kind folder in it, like `rules`, and the file name get the spelling the harness
// looks for. Folders of the project and the names of skills keep theirs.
const canonical = (path: string) => {
  const parts = path.split("/");
  const from = parts.findIndex((part) => HARNESS_FOLDER.test(part));
  const last = parts.length - 1;
  return parts
    .map((part, index) => {
      if (index !== last && (from === -1 || index < from || index > from + 1)) return part;
      const known = CANONICAL.get(part.toLowerCase());
      if (known !== undefined) return known;
      // A rule or command keeps its own name, but Claude Code matches its .md exactly. Cursor takes .MDC too.
      return from !== -1 && index === last ? part.replace(/\.md$/i, ".md") : part;
    })
    .join("/");
};

const readersOfFile = (path: string): HarnessId[] => [...new Set([...readersOf(path), ...configReadersOf(path)])];

// An instruction file's name in lowercase, deep in the project and outside the harnesses' folders, is more
// likely a document about the agent, like docs/claude.md, than a typo.
const looksLikeDocument = (path: string) => {
  const name = path.split("/").at(-1) ?? "";
  return (
    path.includes("/") && !path.split("/").some((part) => HARNESS_FOLDER.test(part)) && name === name.toLowerCase()
  );
};

export const nearMiss = (path: string): NearMiss | undefined => {
  if (readersOfFile(path).length > 0) return undefined;
  const rewritten = REWRITES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), path);
  const expected = canonical(rewritten);
  const readers = readersOfFile(expected);
  if (expected === path || readers.length === 0 || looksLikeDocument(path)) return undefined;
  // Names the harness opens match on a case-insensitive disk. A rule's or command's extension it matches by
  // glob, in every letter.
  const sameLetters = expected.toLowerCase() === path.toLowerCase();
  const name = expected.split("/").at(-1) ?? "";
  const globbed = !CANONICAL.has(name.toLowerCase()) && expected.replace(/\.\w+$/, "") === path.replace(/\.\w+$/, "");
  return { expected, kind: sameLetters && !globbed ? "case" : "name", readers };
};
