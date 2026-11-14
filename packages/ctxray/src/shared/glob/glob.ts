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

// gitignore-style patterns: one without a slash matches a name at any depth, a leading slash anchors it.
export const gitignoreGlob = (pattern: string): Bun.Glob => {
  const trimmed = pattern.trim().replace(/\/$/, "/**");
  if (trimmed.startsWith("/")) return new Bun.Glob(trimmed.slice(1));
  return new Bun.Glob(trimmed.includes("/") ? trimmed : `**/${trimmed}`);
};

export const isGlob = (pattern: string): boolean => /[*?[\]{}]/.test(pattern);
