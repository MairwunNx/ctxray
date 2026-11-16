import { join } from "node:path";
import { inParallel } from "#shared/infra/index.ts";
import { type Frontmatter, splitFrontmatter } from "#shared/markdown/index.ts";
import { type Problem, problem } from "./inventory.ts";
import { type Project, readMatching } from "./project.ts";

// `bom`: the file starts with a byte order mark, which some harnesses refuse.
export type SkillFile = { path: string; dir: string; folder: string; bom: boolean; frontmatter: Frontmatter };

// Every `<dir>/<root>/<folder>/SKILL.md` that matches, where `root` is like `.claude/skills`.
// Reading text drops a byte order mark, so the first bytes tell.
const startsWithBom = async (project: Project, path: string) => {
  const head = await Bun.file(join(project.root, path)).slice(0, 3).bytes();
  return head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
};

export const readSkillFiles = async (project: Project, pattern: RegExp, problems: Problem[]): Promise<SkillFile[]> => {
  const files = await readMatching(project, pattern);
  const boms = await inParallel(files, ({ path }) => startsWithBom(project, path));
  return files.map(({ path, match, text }, index) => {
    const frontmatter = splitFrontmatter(text);
    if (frontmatter.tabs) problems.push(problem("lint.frontmatterTab", "error", path));
    else if (frontmatter.error !== undefined) {
      const loose = frontmatter.loose === true;
      problems.push(
        problem(loose ? "lint.looseFrontmatter" : "lint.frontmatter", loose ? "warning" : "error", path, {
          message: frontmatter.error,
        }),
      );
    }
    return { path, dir: match[1] ?? "", folder: match[2] ?? "", bom: boms[index] === true, frontmatter };
  });
};
