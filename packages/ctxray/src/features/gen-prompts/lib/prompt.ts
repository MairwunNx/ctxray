import type { Target } from "./targets.ts";

// What the generator model gets. It writes in the description's language, so a Russian skill gets Russian prompts.
export const questionFor = (target: Target, count: number) =>
  [
    `You write test prompts for an AI coding agent. The agent has a ${target.kind} named “${target.name}”.`,
    "It loads it only when a request matches this description:",
    "",
    target.description,
    "",
    `Write ${count} requests a developer might type that should make the agent load it: varied wording, varied`,
    `detail, some indirect. Then write ${count} borderline requests that sound related but should not load it.`,
    "Write them in the language of the description.",
    'Answer with JSON only: {"positive": ["…"], "negative": ["…"]}',
  ].join("\n");

export type Generated = { positive: string[]; negative: string[] };

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];

// The JSON object in the answer, fenced or not. Undefined when there is none.
export const parseGenerated = (answer: string): Generated | undefined => {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(answer.slice(start, end + 1)) as Record<string, unknown>;
    const generated = { positive: strings(parsed["positive"]), negative: strings(parsed["negative"]) };
    return generated.positive.length > 0 ? generated : undefined;
  } catch {
    return undefined;
  }
};
