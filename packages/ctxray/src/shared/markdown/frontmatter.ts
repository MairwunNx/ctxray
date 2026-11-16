export type Frontmatter = {
  data: Readonly<Record<string, unknown>>;
  // The text after the frontmatter: what a harness puts into context.
  body: string;
  // Lines the frontmatter takes, so a finding in the body can name its line in the file.
  offset: number;
  error?: string;
  // Not strict YAML, read line by line the way Claude Code and Codex read it: `key: value` at the top level.
  loose?: boolean;
  // Tabs indent it, which YAML forbids. `data` is what the tolerant harnesses read: the YAML without the tabs.
  tabs?: boolean;
  // What Claude Code reads from such a rule: each tab taken for indentation, or nothing when that fails too.
  tabsAsIndent?: Readonly<Record<string, unknown>>;
};

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2");

// What the harnesses fall back to when YAML fails, like a `: ` inside an unquoted description.
const looseFields = (block: string): Record<string, string> =>
  Object.fromEntries(
    block.split(/\r?\n/).flatMap((line) => {
      const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
      const value = unquote((match?.[2] ?? "").trim());
      return match && value !== "" ? [[match[1] as string, value]] : [];
    }),
  );

const mappingOf = (block: string): Record<string, unknown> | undefined => {
  try {
    const data: unknown = Bun.YAML.parse(block);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

// Harnesses read frontmatter only when the opening `---` is the file's first line.
const BLOCK = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export const splitFrontmatter = (text: string): Frontmatter => {
  const match = BLOCK.exec(text);
  if (!match) return { data: {}, body: text, offset: 0 };
  const body = text.slice(match[0].length);
  const offset = match[0].split("\n").length - 1;
  try {
    const data: unknown = Bun.YAML.parse(match[1] ?? "");
    if (data === null || data === undefined) return { data: {}, body, offset };
    if (typeof data !== "object" || Array.isArray(data)) return { data: {}, body, offset, error: "not a mapping" };
    return { data: data as Record<string, unknown>, body, offset };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const block = match[1] ?? "";
    if (/^\t/m.test(block)) {
      const without = mappingOf(block.replace(/^\t+/gm, ""));
      const indented = mappingOf(block.replace(/^\t+/gm, (tabs) => "  ".repeat(tabs.length)));
      if (without) return { data: without, body, offset, error: message, tabs: true, tabsAsIndent: indented ?? {} };
    }
    const data = looseFields(match[1] ?? "");
    return Object.keys(data).length > 0
      ? { data, body, offset, error: message, loose: true }
      : { data: {}, body, offset, error: message };
  }
};

// A list field takes a YAML list or one comma-separated string, as Claude Code's `paths` does.
export const listOf = (value: unknown): string[] | undefined => {
  if (typeof value === "string") return value.split(",").map((item) => item.trim());
  if (Array.isArray(value)) return value.map(String);
  return undefined;
};

const TRUE = ["true", "yes", "on", "1"];
const FALSE = ["false", "no", "off", "0"];

// Boolean fields also take yes, no, on, off, 1, and 0 in any case.
export const flagOf = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase();
  if (TRUE.includes(text)) return true;
  return FALSE.includes(text) ? false : undefined;
};

export const textOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

export const firstLine = (body: string): string | undefined =>
  body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
