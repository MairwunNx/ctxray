import { type Frontmatter, splitFrontmatter } from "#shared/markdown/index.ts";
import { type Problem, problem } from "./inventory.ts";
import type { Project } from "./project.ts";

export type SkillFile = { path: string; dir: string; folder: string; frontmatter: Frontmatter };

// Every `<dir>/<root>/<folder>/SKILL.md` that matches, where `root` is like `.claude/skills`.
export const readSkillFiles = async (project: Project, pattern: RegExp, problems: Problem[]): Promise<SkillFile[]> => {
  const found: SkillFile[] = [];
  for (const path of project.files) {
    const match = pattern.exec(path);
    const text = match ? await project.read(path) : undefined;
    if (!match || text === undefined) continue;
    const frontmatter = splitFrontmatter(text);
    if (frontmatter.error !== undefined) {
      problems.push(problem("lint.frontmatter", "error", path, { message: frontmatter.error }));
    }
    found.push({ path, dir: match[1] ?? "", folder: match[2] ?? "", frontmatter });
  }
  return found;
};
