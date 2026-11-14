import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { inParallel } from "#shared/infra/index.ts";
import { findLinks } from "#shared/markdown/index.ts";
import type { Inventory } from "../inventory.ts";
import { dirOf, joinPath, type Project } from "../project.ts";

// Text as the model gets it, for comparing two files: no `@imports` (they load files of their own), no
// frontmatter, whitespace collapsed.
export const comparable = (text: string) =>
  text
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/^@\S+\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

// What one harness of the run reads, by real file, so a symlink and its target count as one.
export type HarnessIndex = {
  reads: (path: string) => boolean;
  instructions: string; // every instruction text it reads, comparable, one string
  skills: ReadonlyMap<string, string>; // name → comparable body
};

export type ReachIndex = {
  ids: readonly HarnessId[];
  of: (id: HarnessId) => HarnessIndex;
  linked: ReadonlySet<string>; // what the read files link to or import
};

const pathsOf = (inventory: Inventory) => [
  ...inventory.instructions.map((file) => file.path),
  ...inventory.skills.map((skill) => skill.path),
  ...inventory.commands.map((command) => command.path),
];

const linksOf = (inventory: Inventory) => {
  const documents = [
    ...inventory.instructions.map(({ path, text }) => ({ path, text })),
    ...[...inventory.skills, ...inventory.commands].map(({ path, body }) => ({ path, text: body })),
  ];
  return [
    ...inventory.instructions.flatMap((file) => file.imports),
    ...documents.flatMap(({ path, text }) => findLinks(text).map((link) => joinPath(dirOf(path), link.target))),
  ];
};

export const indexReach = async (
  project: Project,
  inventories: Partial<Record<HarnessId, Inventory>>,
): Promise<ReachIndex> => {
  const ids = Object.keys(inventories) as HarnessId[];
  const all = ids.map((id) => inventories[id] as Inventory);
  const candidates = [...new Set([...project.files, ...all.flatMap(pathsOf)])];
  const reals = await inParallel(candidates, (path) => realpath(join(project.root, path)).catch(() => path));
  const realOf = new Map(candidates.map((path, index) => [path, reals[index] ?? path]));
  const real = (path: string) => realOf.get(path) ?? path;
  const indexes = new Map(
    all.map((inventory, index): [HarnessId, HarnessIndex] => {
      const ignored = new Set(inventory.ignored ?? []);
      const read = new Set(
        pathsOf(inventory)
          .filter((path) => !ignored.has(path))
          .map(real),
      );
      const instructions = inventory.instructions
        .filter((file) => !ignored.has(file.path))
        .map((file) => comparable(file.text))
        .join(" \n ");
      const skills = new Map(inventory.skills.map((skill) => [skill.name, comparable(skill.body)]));
      return [ids[index] as HarnessId, { reads: (path) => read.has(real(path)), instructions, skills }];
    }),
  );
  return {
    ids,
    of: (id) => indexes.get(id) as HarnessIndex,
    linked: new Set(all.flatMap(linksOf)),
  };
};
