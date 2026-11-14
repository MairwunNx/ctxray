import { type GlobProblem, globProblem } from "#shared/glob/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import { findLinks } from "#shared/markdown/index.ts";
import { type Inventory, type Problem, problem } from "../inventory.ts";
import { dirOf, joinPath, type Project } from "../project.ts";

// The Agent Skills format: lowercase letters, digits, and single hyphens, up to 64 characters.
const PORTABLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const GLOB_KEYS: Record<GlobProblem, MessageKey> = {
  empty: "lint.globEmpty",
  unbalanced: "lint.globUnbalanced",
  outside: "lint.globOutside",
};

const badGlobs = (inventory: Inventory): Problem[] =>
  [...inventory.instructions, ...inventory.skills].flatMap(({ path, globs }) =>
    (globs ?? []).flatMap((pattern) => {
      const reason = globProblem(pattern);
      return reason === undefined ? [] : [problem(GLOB_KEYS[reason], "error", path, { pattern })];
    }),
  );

// Skills of one directory share a namespace. A nested directory's skill with the same name is fine.
const skillNames = (inventory: Inventory): Problem[] => {
  const seen = new Map<string, string>();
  return inventory.skills.flatMap(({ name, path, dir }) => {
    const found: Problem[] = [];
    if (!PORTABLE_NAME.test(name) || name.length > 64) found.push(problem("lint.skillName", "warning", path, { name }));
    const first = seen.get(`${dir}/${name}`);
    if (first === undefined) seen.set(`${dir}/${name}`, path);
    else found.push(problem("lint.duplicateSkill", "warning", path, { name, other: first }));
    return found;
  });
};

// Two instruction files with the same text cost tokens twice and drift apart on the next edit.
const duplicateText = (inventory: Inventory): Problem[] => {
  const seen = new Map<string, string>();
  return inventory.instructions.flatMap(({ path, text }) => {
    const normal = text.replace(/\s+/g, " ").trim();
    if (normal === "") return [];
    const first = seen.get(normal);
    if (first === undefined) {
      seen.set(normal, path);
      return [];
    }
    return [problem("lint.duplicateText", "warning", path, { other: first })];
  });
};

const documents = (inventory: Inventory) => [
  ...inventory.instructions.map(({ path, text }) => ({ path, text })),
  ...[...inventory.skills, ...inventory.commands].map(({ path, body }) => ({ path, text: body })),
];

const brokenLinks = async (project: Project, inventory: Inventory): Promise<Problem[]> => {
  const found: Problem[] = [];
  for (const document of documents(inventory)) {
    // A body starts after the frontmatter, so its line numbers shift by the frontmatter's lines.
    const read = await project.read(document.path);
    const offset = read === undefined ? 0 : read.split("\n").length - document.text.split("\n").length;
    for (const { target, line } of findLinks(document.text)) {
      const path = joinPath(dirOf(document.path), target);
      if (path.startsWith("../") || (await project.exists(path))) continue;
      found.push(problem("lint.brokenLink", "warning", document.path, { target }, line + Math.max(offset, 0)));
    }
  }
  return found;
};

// L1: the files are valid. Everything here reads files only and never needs the harness.
export const lint = async (project: Project, inventory: Inventory): Promise<Problem[]> => [
  ...inventory.problems,
  ...badGlobs(inventory),
  ...skillNames(inventory),
  ...duplicateText(inventory),
  ...(await brokenLinks(project, inventory)),
];
