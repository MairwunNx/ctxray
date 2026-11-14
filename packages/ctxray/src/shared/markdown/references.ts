import { Lexer, marked, type Token } from "marked";

export type Reference = { target: string; line: number };

// What one top-level block holds, with its code blanked out: imports and links in code are examples.
type Block = { start: number; text: string; links: { href: string; raw: string }[] };

const blank = (text: string, raw: string): string => {
  const at = text.indexOf(raw);
  return at < 0 ? text : text.slice(0, at) + raw.replace(/[^\n]/g, " ") + text.slice(at + raw.length);
};

// marked's block tokens add up to the source, so each block knows where it starts and every line keeps its number.
const blocks = (source: string): Block[] => {
  let start = 0;
  return new Lexer({ gfm: true }).lex(source).flatMap((token: Token) => {
    const block = { start, text: token.raw, links: [] as Block["links"] };
    start += token.raw.length;
    if (token.type === "code") return [];
    marked.walkTokens([token], (inner) => {
      if (inner.type === "codespan" || inner.type === "code") block.text = blank(block.text, inner.raw);
      if (inner.type === "link" || inner.type === "image") block.links.push({ href: inner.href, raw: inner.raw });
    });
    return [block];
  });
};

const lineAt = (source: string, offset: number) => source.slice(0, offset).split("\n").length;

// `@path` after a line start or a blank. A backslash keeps a space in the path, trailing punctuation ends it.
const IMPORT = /(?<=^|\s)@((?:\\ |[^\s])+)/g;

export const findImports = (source: string): Reference[] =>
  blocks(source).flatMap(({ start, text }) =>
    [...text.matchAll(IMPORT)].flatMap((match) => {
      const target = (match[1] ?? "").replace(/[.,;:!?)\]]+$/, "").replaceAll("\\ ", " ");
      return target === "" ? [] : [{ target, line: lineAt(source, start + match.index) }];
    }),
  );

const SCHEME = /^[a-z][\w+.-]*:/i;

const decoded = (path: string) => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

// Relative links only, inline or by reference: a URL, an anchor, or a root-relative path says nothing about the repo.
export const findLinks = (source: string): Reference[] =>
  blocks(source).flatMap(({ start, text, links }) =>
    links.flatMap(({ href, raw }) => {
      const path = href.replace(/[#?].*$/, "");
      if (SCHEME.test(href) || /^[#/~]/.test(href) || path === "") return [];
      return [{ target: decoded(path), line: lineAt(source, start + Math.max(text.indexOf(raw), 0)) }];
    }),
  );
