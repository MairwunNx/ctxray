import type { Component, Exchange, Json, Protocol } from "#shared/contract/index.ts";

// A session as the harness itself keeps it on disk: the requests ctxray rebuilt from that record, and what the
// record leaves out. The latest request is the last one.
export type Recorded = {
  requests: Exchange[];
  version: string | undefined;
  cwd: string | undefined;
  model: string | undefined;
  files: string[]; // what the agent read or edited by the latest request: absolute, or relative to `cwd`
  reported: number | undefined; // input tokens the provider counted for the latest request
  unseen: Component[]; // parts of the request the record never holds
};

export const record = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};

export const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(record) : []);

export const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

// A JSON Lines file, a broken or half-written line skipped.
export const jsonLines = (content: string): Json[] =>
  content.split("\n").flatMap((line) => {
    try {
      return line.trim() === "" ? [] : [record(JSON.parse(line))];
    } catch {
      return [];
    }
  });

export const exchange = (session: string, protocol: Protocol, path: string, seq: number, body: Json): Exchange => ({
  seq,
  session,
  protocol,
  path,
  retries: 0,
  headers: {},
  body,
});
