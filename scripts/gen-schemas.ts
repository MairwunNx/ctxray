// Writes the published JSON Schemas to dist/schemas, where the release picks them up.
import { mkdir } from "node:fs/promises";
import { jsonSchemas } from "../packages/ctxray/src/shared/contract/index.ts";

const dir = "dist/schemas";
await mkdir(dir, { recursive: true });
for (const [name, schema] of Object.entries(jsonSchemas())) {
  await Bun.write(`${dir}/${name}.schema.json`, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`${dir}/${name}.schema.json`);
}
