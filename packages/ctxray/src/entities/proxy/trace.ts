import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Redactor } from "#shared/redact/index.ts";
import type { Exchange } from "./model.ts";

export type TraceWriter = { write: (exchange: Exchange) => void; flush: () => Promise<void> };

// Every exchange goes to a JSONL file, redacted first: keys and personal data never reach the disk.
export const createTraceWriter = (file: string, redactor: Redactor): TraceWriter => {
  let queue: Promise<void> = mkdir(dirname(file), { recursive: true }).then(() => {});
  return {
    write: (exchange) => {
      const line = `${JSON.stringify(redactor.value(exchange))}\n`;
      queue = queue.then(() => appendFile(file, line));
    },
    flush: () => queue,
  };
};
