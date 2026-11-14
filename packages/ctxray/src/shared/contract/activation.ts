import { z } from "zod";

// One vocabulary for every harness: Cursor's `alwaysApply`, `globs`, `description`, and `@rule` map onto it,
// and so do CLAUDE.md, AGENTS.md, GEMINI.md, nested files, skills, and slash commands.
export const Activation = z
  .enum(["always", "path", "intent", "manual"])
  .describe(
    "always: loads in every session of its zone. path: loads when the agent works with matching files. " +
      "intent: the model picks it by description. manual: loads only when the user names it.",
  );
export type Activation = z.infer<typeof Activation>;
