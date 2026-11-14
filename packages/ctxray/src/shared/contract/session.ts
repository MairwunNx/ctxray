import { z } from "zod";
import { HarnessInfo } from "./harness.ts";
import { LoadoutSnapshot } from "./loadout.ts";

export const SESSION_SCHEMA_VERSION = 1;

export const Turn = z.object({
  index: z.number().int().nonnegative(),
  loadout: LoadoutSnapshot,
});

export const Session = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  id: z.string(),
  harness: HarnessInfo,
  turns: z.array(Turn),
});
export type Session = z.infer<typeof Session>;
