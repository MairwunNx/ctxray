import { matchesGitignore } from "#shared/glob/index.ts";

// Where GitHub and GitLab look, in the order they look. The first file found wins.
export const CODEOWNERS_FILES = [".github/CODEOWNERS", ".gitlab/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

type Entry = { pattern: string; owners: readonly string[] };

export type Codeowners = { ownersOf: (path: string) => readonly string[] };

const parseLine = (raw: string): Entry | undefined => {
  const line = raw.replace(/(^|\s)#.*$/, "").trim();
  // GitLab section headers like `[Payments][2] @team` group lines, they own nothing themselves.
  if (line === "" || line.startsWith("[") || line.startsWith("^[")) return undefined;
  const [pattern, ...owners] = line.split(/\s+/);
  return pattern === undefined ? undefined : { pattern: pattern.replaceAll("\\ ", " "), owners };
};

// The last matching line wins, as on GitHub and GitLab. Owners compare without case: @Org/Team is @org/team.
export const parseCodeowners = (text: string): Codeowners => {
  const entries = text.split("\n").flatMap((line) => parseLine(line) ?? []);
  return {
    ownersOf: (path) => {
      const entry = entries.findLast(({ pattern }) => matchesGitignore(pattern, path));
      return entry ? entry.owners.map((owner) => owner.toLowerCase()) : [];
    },
  };
};
