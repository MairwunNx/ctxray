import type { Inventory } from "../inventory.ts";

export { createCopy, type ProjectCopy } from "./isolate.ts";

// The files that get a canary: whatever any of the harnesses could load from the project. A canary in a file
// one harness never reads does no harm, so one copy serves them all.
export const canaryFiles = (inventories: readonly Inventory[]): Set<string> =>
  new Set(
    inventories.flatMap((inventory) => [
      ...inventory.instructions.map((file) => file.path),
      ...inventory.skills.map((skill) => skill.path),
      ...inventory.commands.map((command) => command.path),
    ]),
  );
