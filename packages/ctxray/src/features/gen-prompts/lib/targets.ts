import type { Inventory } from "#entities/harness/index.ts";

// A rule or skill the model picks by its description: the ones L6 tests by prompts.
export type Target = { path: string; name: string; kind: "skill" | "rule"; description: string };

export const targetsOf = (inventories: readonly Inventory[]): Target[] => {
  const found = new Map<string, Target>();
  for (const inventory of inventories) {
    for (const skill of inventory.skills) {
      if (skill.listed && skill.description.trim() !== "") {
        found.set(skill.path, { path: skill.path, name: skill.name, kind: "skill", description: skill.description });
      }
    }
    for (const rule of inventory.instructions) {
      if (rule.activation === "intent" && rule.description?.trim()) {
        found.set(rule.path, { path: rule.path, name: rule.path, kind: "rule", description: rule.description });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
};
