import { join } from "node:path";
import type { Inventory, Segment, StaticLoadout } from "#entities/harness/index.ts";
import type { Component } from "#shared/contract/index.ts";

// What a harness's record leaves out but the project's files tell: the instruction files it loads at start and
// the skills it lists, as L3 predicts them, one per name. They count with `static` evidence. The system prompt and the tools
// stay unseen.
export const filledFromFiles = (
  segments: readonly Segment[],
  unseen: readonly Component[],
  inventory: Inventory,
  predicted: StaticLoadout,
  work: string,
): Segment[] => {
  const has = (component: Segment["component"], id: string) =>
    segments.some((segment) => segment.component === component && segment.id === id);
  const rules: Segment[] = unseen.includes("rules")
    ? predicted.rules
        .filter((rule) => rule.activation === "always" && !has("rules", rule.path))
        .flatMap((rule) => {
          const file = inventory.instructions.find((one) => one.path === rule.path);
          return file
            ? [{ component: "rules" as const, id: rule.path, text: file.text, evidence: "static" as const }]
            : [];
        })
    : [];
  const skills: Segment[] = unseen.includes("skills")
    ? predicted.skills.listed
        .filter(
          (skill, index, all) =>
            !has("skills", skill.name) && all.findIndex((one) => one.name === skill.name) === index,
        )
        .map((skill) => {
          const description = inventory.skills.find((one) => one.path === skill.path)?.description ?? "";
          return {
            component: "skills" as const,
            id: skill.name,
            text: `${skill.name}: ${description}`,
            evidence: "static" as const,
            source: join(work, skill.path),
          };
        })
    : [];
  return [...rules, ...skills];
};
