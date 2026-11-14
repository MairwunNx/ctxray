// The project's file size rule: aim for about 120 lines, never more than 200.
export const LIMIT = 200;

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
// Translation catalogs and test fixtures grow with content, not with logic.
const EXEMPT = [/(^|\/)i18n\/locales\//, /(^|\/)fixtures\//];

export type SourceFile = { path: string; text: string };
export type Oversized = { path: string; lines: number };

export const isChecked = (path: string): boolean => CODE.test(path) && !EXEMPT.some((pattern) => pattern.test(path));

export const countLines = (text: string): number => {
  if (text === "") return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
};

export const findOversized = (files: readonly SourceFile[], limit = LIMIT): Oversized[] =>
  files
    .filter((file) => isChecked(file.path))
    .map((file) => ({ path: file.path, lines: countLines(file.text) }))
    .filter((file) => file.lines > limit);
