export type Frontmatter = {
  data: Readonly<Record<string, unknown>>;
  // The text after the frontmatter: what a harness puts into context.
  body: string;
  // Lines the frontmatter takes, so a finding in the body can name its line in the file.
  offset: number;
  error?: string;
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
    return { data: {}, body, offset, error: error instanceof Error ? error.message : String(error) };
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
