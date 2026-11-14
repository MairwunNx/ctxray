// Enough TOML to write MCP server tables back: strings, numbers, booleans, arrays, and inline tables.
export const tomlValue = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const pairs = Object.entries(value).map(([key, inner]) => `${JSON.stringify(key)} = ${tomlValue(inner)}`);
    return `{ ${pairs.join(", ")} }`;
  }
  return '""';
};

// `[mcp_servers."name"]` and its keys. Quoted names may hold dots, unlike `-c` overrides.
export const tomlTable = (path: readonly string[], entry: Record<string, unknown>) =>
  [
    `[${path.map((part) => JSON.stringify(part)).join(".")}]`,
    ...Object.entries(entry)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${JSON.stringify(key)} = ${tomlValue(value)}`),
    "",
  ].join("\n");
