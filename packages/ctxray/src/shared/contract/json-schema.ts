import { z } from "zod";
import { RegExpValue, UserConfig } from "./config.ts";
import { Inspection } from "./inspection.ts";
import { LoadoutSnapshot } from "./loadout.ts";
import { Session } from "./session.ts";

const BASE = "https://github.com/MairwunNx/ctxray/releases/latest/download";
export const CONFIG_SCHEMA_URL = `${BASE}/config.schema.json`;

// A config is what people write, so its schema describes the input. Snapshots and sessions describe what ctxray wrote.
const documents = {
  config: { schema: UserConfig, io: "input" },
  loadout: { schema: LoadoutSnapshot, io: "output" },
  session: { schema: Session, io: "output" },
  inspection: { schema: Inspection, io: "output" },
} as const;

export type JsonSchemaDocument = { $id: string; $schema?: string; [key: string]: unknown };

// JSON can't hold a RegExp, so the JSON form of a pattern is only its string source.
const dropRegExp = (ctx: { zodSchema: unknown; jsonSchema: Record<string, unknown> }) => {
  if (ctx.zodSchema === RegExpValue) ctx.jsonSchema["not"] = {};
};

// The published JSON Schemas, by file stem. Release builds attach them, and IDEs resolve `$id`.
export const jsonSchemas = (): Record<keyof typeof documents, JsonSchemaDocument> => {
  const entries = Object.entries(documents).map(([name, { schema, io }]) => [
    name,
    {
      ...z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any", override: dropRegExp }),
      $id: `${BASE}/${name}.schema.json`,
    },
  ]);
  return Object.fromEntries(entries);
};
