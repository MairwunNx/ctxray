import { countTokens } from "#shared/tokens/index.ts";
import type { Instruction, Inventory } from "../inventory.ts";
import { chainTo } from "../project.ts";
import { createRules, listingLine, type Scope, type StaticLoadout, withTokens } from "../static-loadout.ts";

// What fits into the byte budget: the file that crosses it gets cut, the ones after it stay out.
export const withinBudget = (chain: readonly Instruction[], budget: number) => {
  let used = 0;
  const kept: { instruction: Instruction; text: string; cut: boolean }[] = [];
  for (const instruction of chain) {
    if (used >= budget) break;
    const bytes = Buffer.from(instruction.text);
    const text = bytes.subarray(0, budget - used).toString();
    kept.push({ instruction, text, cut: bytes.length > budget - used });
    used += bytes.length;
  }
  return kept;
};

// Emulates Codex 0.169 (ADR 0006): the AGENTS.md chain from the root down to the cwd is fixed at session
// start, so the files the agent works with change nothing.
export const resolveCodex = (inventory: Inventory, { cwd }: Scope): StaticLoadout => {
  const chain = chainTo(cwd);
  const { rules, add } = createRules();
  const files = chain.flatMap((dir) => inventory.instructions.filter((file) => file.dir === dir));
  for (const { instruction, text } of withinBudget(files, inventory.budget ?? Number.POSITIVE_INFINITY)) {
    add(instruction.path, "always", "cwd", text);
  }
  // `.agents/skills` from the cwd up to the root, plus the project's `.codex/skills`.
  const skills = inventory.skills.filter((skill) => skill.listed && chain.includes(skill.dir));
  return withTokens(
    {
      harness: "codex",
      cwd,
      rules,
      skills: {
        listed: skills.map((skill) => ({
          name: skill.name,
          path: skill.path,
          tokens: countTokens(listingLine(skill.name, skill.description)),
        })),
        loaded: [],
      },
      mcp: { servers: inventory.mcp.filter((server) => server.enabled).map(({ name }) => ({ name })), tools: [] },
      commands: [],
    },
    [],
  );
};
