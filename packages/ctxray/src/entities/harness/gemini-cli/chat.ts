import type { Exchange, Json } from "#shared/contract/index.ts";
import { exchange, jsonLines, list, type Recorded, record, text } from "../recorded.ts";

// The model's turn as the wire carries it: its text, then a functionCall part per tool it called.
const modelTurn = (entry: Json): Json => {
  const said = text(entry["content"]);
  const calls = list(entry["toolCalls"]).map((call) => ({ functionCall: { name: call["name"], args: call["args"] } }));
  return { role: "model", parts: [...(said ? [{ text: said }] : []), ...calls] };
};

// The files the model's tools name: read_file, write_file, replace, read_many_files.
const filesOf = (entry: Json): string[] =>
  list(entry["toolCalls"]).flatMap((call) => {
    const args = record(call["args"]);
    const path = text(args["file_path"]) ?? text(args["absolute_path"]);
    return path ? [path] : [];
  });

// A Gemini CLI session rebuilt from its chat file, `~/.gemini/tmp/<project>/chats/session-*.jsonl` (ADR 0007): the
// first user turn holds the session context with every GEMINI.md, tool results hold what a read or a skill
// brought in. A record is written again as it changes, under the same id: the last one counts. The system
// instruction, with the skill listing, and the tools never reach the file.
export const readChat = (content: string, session: string): Recorded => {
  const byId = new Map<string, Json>();
  for (const line of jsonLines(content)) {
    const id = text(line["id"]);
    if (id && (line["type"] === "user" || line["type"] === "gemini")) byId.set(id, line);
  }
  const entries = [...byId.values()];
  const contents: Json[] = [];
  const requests: Exchange[] = [];
  const files: string[] = [];
  let seen: string[] = []; // the files by the latest request
  let last: Json | undefined;
  for (const entry of entries) {
    if (entry["type"] === "user") {
      contents.push({ role: "user", parts: list(entry["content"]) });
      continue;
    }
    requests.push(exchange(session, "gemini", "/v1beta/models", requests.length, { contents: [...contents] }));
    seen = [...new Set(files)];
    contents.push(modelTurn(entry));
    files.push(...filesOf(entry));
    last = entry;
  }
  const reported = record(last?.["tokens"])["input"];
  return {
    requests,
    version: undefined,
    cwd: undefined,
    model: text(last?.["model"]),
    files: seen,
    reported: typeof reported === "number" ? reported : undefined,
    unseen: ["system", "skills", "tools"],
  };
};
