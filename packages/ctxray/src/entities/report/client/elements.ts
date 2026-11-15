import type { LoadoutSnapshot, Provenance } from "#shared/contract/index.ts";
import type { Part } from "./app.ts";

// One piece of a context, down to a single line of a skill listing, with where it came from.
export type Piece = {
  component: Part;
  id: string;
  label: string;
  tokens: number;
  group?: string; // an MCP tool's server
  provenance?: Provenance | undefined;
};

export const piecesOf = (loadout: LoadoutSnapshot): Piece[] => {
  const { provenance, tokens } = loadout;
  const pieces: Piece[] = [
    ...loadout.system.map((section) => ({
      component: "system" as const,
      id: `system:${section.id}`,
      label: section.title ?? section.id.replace(/^system:/, ""),
      tokens: section.tokens,
      provenance: provenance[`system:${section.id}`],
    })),
    ...loadout.rules.map((rule) => ({
      component: "rules" as const,
      id: `rule:${rule.path}`,
      label: rule.path,
      tokens: rule.tokens,
      provenance: provenance[`rule:${rule.path}`] ?? {
        source: rule.path,
        reason: rule.reason,
        evidence: "static" as const,
      },
    })),
    ...loadout.skills.listed.map((skill) => ({
      component: "skills" as const,
      id: `skill:${skill.name}`,
      label: skill.name,
      tokens: skill.tokens,
      provenance:
        provenance[`skill:${skill.name}`] ??
        (skill.path ? { source: skill.path, reason: "listed", evidence: "static" as const } : undefined),
    })),
    ...loadout.skills.loaded.map((skill) => ({
      component: "skills" as const,
      id: `skill-body:${skill.name}`,
      label: `${skill.name} ↧`,
      tokens: skill.tokens,
      provenance: { source: skill.path, reason: "loaded", evidence: "marker" as const },
    })),
    ...loadout.mcp.tools.map((tool) => ({
      component: "mcp" as const,
      id: `mcp:${tool.server}/${tool.name}`,
      label: `${tool.server}/${tool.name}`,
      tokens: tool.tokens,
      group: tool.server,
      provenance: provenance[`mcp:${tool.server}`],
    })),
  ];
  // What only a total knows: the harness's own tools, commands, and an exact count's framing.
  const builtIn = tokens.byComponent.tools ?? 0;
  if (builtIn > 0) pieces.push({ component: "tools", id: "tools", label: "tools", tokens: builtIn });
  const commands = tokens.byComponent.commands ?? 0;
  if (commands > 0) pieces.push({ component: "commands", id: "commands", label: "commands", tokens: commands });
  if (tokens.framing) pieces.push({ component: "framing", id: "framing", label: "framing", tokens: tokens.framing });
  // The rest is the conversation itself: the prompt and the turns so far.
  const owned = Object.values(tokens.byComponent).reduce((sum, value) => sum + value, 0) + (tokens.framing ?? 0);
  if (tokens.total > owned)
    pieces.push({ component: "messages", id: "messages", label: "messages", tokens: tokens.total - owned });
  return pieces;
};
