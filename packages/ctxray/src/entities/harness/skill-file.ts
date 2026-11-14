import { type Frontmatter, splitFrontmatter } from "#shared/markdown/index.ts";
import { type Problem, problem } from "./inventory.ts";
import { type Project, readMatching } from "./project.ts";

export type SkillFile = { path: string; dir: string; folder: string; frontmatter: Frontmatter };

// Every `<dir>/<root>/<folder>/SKILL.md` that matches, where `root` is like `.claude/skills`.
export const readSkillFiles = async (project: Project, pattern: RegExp, problems: Problem[]): Promise<SkillFile[]> =>
  (await readMatching(project, pattern)).map(({ path, match, text }) => {
    const frontmatter = splitFrontmatter(text);
    if (frontmatter.error !== undefined) {
      const loose = frontmatter.loose === true;
      problems.push(
        problem(loose ? "lint.looseFrontmatter" : "lint.frontmatter", loose ? "warning" : "error", path, {
          message: frontmatter.error,
        }),
      );
    }
    return { path, dir: match[1] ?? "", folder: match[2] ?? "", frontmatter };
  });
