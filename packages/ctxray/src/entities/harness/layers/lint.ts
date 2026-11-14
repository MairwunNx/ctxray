import { type GlobProblem, globProblem } from "#shared/glob/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import { inParallel } from "#shared/infra/index.ts";
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

const linksOf = async (project: Project, document: { path: string; text: string }): Promise<Problem[]> => {
  const candidates = findLinks(document.text)
    .map((link) => ({ ...link, path: joinPath(dirOf(document.path), link.target) }))
    .filter(({ path }) => !path.startsWith("../"));
  const [read, present] = await Promise.all([
    project.read(document.path),
    inParallel(candidates, ({ path }) => project.exists(path)),
  ]);
  // A body starts after the frontmatter, so its line numbers shift by the frontmatter's lines.
  const offset = Math.max(read === undefined ? 0 : read.split("\n").length - document.text.split("\n").length, 0);
  return candidates
    .filter((_, index) => !present[index])
    .map(({ target, line }) => problem("lint.brokenLink", "warning", document.path, { target }, line + offset));
};

const brokenLinks = async (project: Project, inventory: Inventory): Promise<Problem[]> =>
  (await inParallel(documents(inventory), (document) => linksOf(project, document))).flat();

// L1: the files are valid. Everything here reads files only and never needs the harness.
export const lint = async (project: Project, inventory: Inventory): Promise<Problem[]> => [
  ...inventory.problems,
  ...badGlobs(inventory),
  ...skillNames(inventory),
  ...duplicateText(inventory),
  ...(await brokenLinks(project, inventory)),
];
