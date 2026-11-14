export type Reference = { target: string; line: number };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_SPAN = /(`+).*?\1/g;

// Code spans and fenced blocks hold examples, not references, so they turn blank. Lines keep their numbers.
export const withoutCode = (text: string): string[] => {
  let fence: string | undefined;
  return text.split("\n").map((line) => {
    const open = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (open !== undefined && open[0] === fence[0] && open.length >= fence.length) fence = undefined;
      return "";
    }
    if (open !== undefined) {
      fence = open;
      return "";
    }
    return line.replace(CODE_SPAN, (span) => " ".repeat(span.length));
  });
};

const collect = (text: string, pattern: RegExp, pick: (match: RegExpExecArray) => string | undefined) =>
  withoutCode(text).flatMap((line, index) =>
    [...line.matchAll(pattern)].flatMap((match) => {
      const target = pick(match);
      return target === undefined ? [] : [{ target, line: index + 1 }];
    }),
  );

// `@path` after a line start or a blank. A backslash keeps a space in the path, trailing punctuation ends it.
const IMPORT = /(?<=^|\s)@((?:\\ |[^\s])+)/g;

export const findImports = (text: string): Reference[] =>
  collect(text, IMPORT, (match) => {
    const target = (match[1] ?? "").replace(/[.,;:!?)\]]+$/, "").replaceAll("\\ ", " ");
    return target === "" ? undefined : target;
  });

const LINK = /!?\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g;
const SCHEME = /^[a-z][\w+.-]*:/i;

// Relative Markdown links only: a URL, an anchor, or a root-relative path says nothing about the repository.
export const findLinks = (text: string): Reference[] =>
  collect(text, LINK, (match) => {
    const raw = match[1] ?? match[2] ?? "";
    if (SCHEME.test(raw) || /^[#/~]/.test(raw)) return undefined;
    const path = raw.replace(/[#?].*$/, "");
    if (path === "") return undefined;
    try {
      return decodeURI(path);
    } catch {
      return path;
    }
  });
