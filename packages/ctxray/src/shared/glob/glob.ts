import braces from "braces";
import ignore, { type Ignore } from "ignore";

export type GlobProblem = "empty" | "unbalanced" | "outside";

const PAIRS: Record<string, string> = { "{": "}", "[": "]" };

// Bun.Glob accepts anything and matches nothing for a broken pattern, so a pattern gets checked before use.
export const globProblem = (pattern: string): GlobProblem | undefined => {
  if (pattern.trim() === "") return "empty";
  const open: string[] = [];
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index] ?? "";
    if (char === "\\") index++;
    else if (char in PAIRS) open.push(PAIRS[char] ?? "");
    else if (char === "}" || char === "]") {
      if (open.pop() !== char) return "unbalanced";
    }
  }
  if (open.length > 0) return "unbalanced";
  return pattern.split("/").includes("..") ? "outside" : undefined;
};

// Claude Code expands braces up to this many patterns. Past it the pattern stays as written and its braces
// match literally, so it matches nothing.
const BRACE_BUDGET = 1000;
const matchers = new Map<string, Ignore>();

const expand = (pattern: string): string[] => {
  try {
    const expanded = braces.expand(pattern);
    return expanded.length > BRACE_BUDGET ? [pattern] : expanded;
  } catch {
    return [pattern];
  }
};

// .gitignore rules, as `ignore` implements them, plus brace expansion: `*.md` matches at any depth, a leading
// slash anchors the pattern, a trailing one takes the whole folder. `path` is relative, with `/`.
export const matchesGitignore = (pattern: string, path: string): boolean => {
  let matcher = matchers.get(pattern);
  if (!matcher) {
    matcher = ignore().add(expand(pattern.trim()));
    matchers.set(pattern, matcher);
  }
  return matcher.ignores(path);
};

export const isGlob = (pattern: string): boolean => /[*?[\]{}]/.test(pattern);
