import { z } from "zod";
import { LoadoutSnapshot } from "./loadout.ts";
import { Session } from "./session.ts";

const BASE = "https://github.com/MairwunNx/ctxray/releases/latest/download";

const documents = { loadout: LoadoutSnapshot, session: Session };

export type JsonSchemaDocument = { $id: string; $schema?: string; [key: string]: unknown };

// The published JSON Schemas, by file stem. Release builds attach them, and IDEs resolve `$id`.
export const jsonSchemas = (): Record<keyof typeof documents, JsonSchemaDocument> => {
  const entries = Object.entries(documents).map(([name, schema]) => [
    name,
    { ...z.toJSONSchema(schema, { target: "draft-2020-12" }), $id: `${BASE}/${name}.schema.json` },
  ]);
  return Object.fromEntries(entries);
};
