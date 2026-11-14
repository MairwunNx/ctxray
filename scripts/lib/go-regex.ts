// Turns a Go (RE2) regular expression into JavaScript source with the same meaning, for the gitleaks rules.
// The differences that matter there: inline flags like `(?i)` that hold to the end of their group, `(?P<name>`
// groups, `\z` and `\A`, and POSIX classes such as `[[:alnum:]]`.

const POSIX: Record<string, string> = {
  alnum: "A-Za-z0-9",
  alpha: "A-Za-z",
  digit: "0-9",
  lower: "a-z",
  upper: "A-Z",
  space: "\\s",
  xdigit: "0-9A-Fa-f",
  word: "\\w",
  punct: "!-\\/:-@\\[-`{-~",
};

// The index just past the group that is open at `from`, or the pattern's end when none is open.
const groupEnd = (source: string, from: number): number => {
  let depth = 0;
  let inClass = false;
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      i++;
    } else if (inClass) {
      if (char === "]") inClass = false;
    } else if (char === "[") {
      inClass = true;
      if (source[i + 1] === "^") i++;
      if (source[i + 1] === "]") i++;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return source.length;
};

const INLINE_FLAGS = /\(\?([imsU]+)\)/;

// `a(?i)b|c)` becomes `a(?i:b|c))`: Go applies the flags up to the end of the enclosing group.
const scopeInlineFlags = (source: string): string => {
  let result = source;
  for (let match = INLINE_FLAGS.exec(result); match; match = INLINE_FLAGS.exec(result)) {
    const flags = match[1]?.replace(/[^ims]/g, "") ?? "";
    const start = match.index;
    const bodyStart = start + match[0].length;
    const end = groupEnd(result, bodyStart);
    const body = result.slice(bodyStart, end);
    const scoped = flags === "" ? `(?:${body})` : `(?${flags}:${body})`;
    result = result.slice(0, start) + scoped + result.slice(end);
  }
  return result;
};

export const goToJs = (source: string): string =>
  scopeInlineFlags(
    source
      .replaceAll("(?P<", "(?<")
      .replace(/\\z/g, "$")
      .replace(/\\A/g, "^")
      .replace(/\[:(\w+):\]/g, (whole, name: string) => POSIX[name] ?? whole),
  );
