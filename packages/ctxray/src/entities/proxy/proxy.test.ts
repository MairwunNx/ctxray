import { afterAll, describe, expect, test } from "bun:test";
import { createConversation } from "./conversation.ts";
import type { Json, Step } from "./model.ts";
import { type ProxyServer, startProxy } from "./server.ts";

const proxy: ProxyServer = startProxy();
afterAll(() => proxy.stop());

const post = (base: string, path: string, body: Json) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "x-api-key": "dummy" }, body: JSON.stringify(body) });

// The events of an SSE body, without the framing.
const events = async (response: Response) =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Json);

const READ: Step = { call: { name: "Read", input: { file_path: "/x/a.kt" } } };

// Ids are random, so each case reads the parts that tell whether the harness gets its tool call.
describe("each protocol answers a turn with the scripted step", () => {
  test.each<[string, string, Json, (response: Response) => Promise<unknown>, unknown]>([
    [
      "anthropic, streaming",
      "/v1/messages?beta=true",
      { stream: true, tools: [{ name: "Read" }], messages: [{ role: "user", content: "hi" }] },
      async (response) => {
        const all = await events(response);
        const delta = all.find((event) => event["type"] === "content_block_delta")?.["delta"] as Json;
        return [all.map((event) => event["type"]).join(" "), delta["partial_json"]];
      },
      [
        "message_start ping content_block_start content_block_delta content_block_stop message_delta message_stop",
        '{"file_path":"/x/a.kt"}',
      ],
    ],
    [
      "anthropic, plain",
      "/v1/messages",
      { tools: [{ name: "Read" }], messages: [] },
      async (response) => ((await response.json()) as Json)["stop_reason"],
      "tool_use",
    ],
    [
      "responses",
      "/v1/responses",
      { stream: true, tools: [{ type: "function", name: "exec_command" }], input: [] },
      async (response) => {
        const all = await events(response);
        const item = all.find((event) => event["type"] === "response.output_item.done")?.["item"] as Json;
        return [all.map((event) => event["type"]).join(" "), item["type"], item["arguments"]];
      },
      [
        "response.created response.output_item.added response.output_item.done response.completed",
        "function_call",
        '{"file_path":"/x/a.kt"}',
      ],
    ],
    [
      "chat",
      "/v1/chat/completions",
      { stream: false, tools: [{ type: "function" }], messages: [] },
      async (response) => ((await response.json()) as { choices: Json[] }).choices[0]?.["finish_reason"],
      "tool_calls",
    ],
    [
      "gemini",
      "/v1beta/models/gemini-3-pro:streamGenerateContent?alt=sse",
      { tools: [{ functionDeclarations: [] }], contents: [] },
      async (response) => (await events(response))[0]?.["candidates"],
      [
        {
          content: { role: "model", parts: [{ functionCall: { name: "Read", args: { file_path: "/x/a.kt" } } }] },
          finishReason: "STOP",
          index: 0,
        },
      ],
    ],
  ])("%s", async (_, path, body, read, expected) => {
    const conversation = createConversation();
    const session = proxy.open(conversation.handler);
    conversation.answer(0, READ);
    const response = await post(session.baseUrl, path, body);
    expect(response.status).toBe(200);
    expect(await read(response)).toEqual(expected);
    expect(conversation.turns().map((turn) => turn.position)).toEqual([0]);
    session.close();
  });
});

describe("a conversation", () => {
  test("waits for the driver, then keeps the answer for a retried turn", async () => {
    const conversation = createConversation();
    const session = proxy.open(conversation.handler);
    const body = { stream: false, tools: [{ name: "Read" }], messages: [] };
    const pending = post(session.baseUrl, "/v1/messages", body);
    const turn = await conversation.turn(0);
    expect(turn.headers["x-api-key"]).toBe("dummy");
    conversation.answer(0, { text: "first" });
    const first = (await (await pending).json()) as { content: Json[] };
    const again = (await (await post(session.baseUrl, "/v1/messages", body)).json()) as { content: Json[] };
    expect([first.content[0]?.["text"], again.content[0]?.["text"]]).toEqual(["first", "first"]);
    expect(conversation.turns()[0]?.retries).toBe(1);
    session.close();
  });

  test("answers side calls and later turns once finished", async () => {
    const conversation = createConversation();
    const session = proxy.open(conversation.handler);
    conversation.finish({ text: "done" });
    const side = await post(session.baseUrl, "/v1/messages", { messages: [] });
    const turn = await post(session.baseUrl, "/v1/messages", { tools: [{}], messages: [{ role: "assistant" }] });
    expect(((await side.json()) as { content: Json[] }).content[0]?.["text"]).toBe("ok");
    expect(((await turn.json()) as { content: Json[] }).content[0]?.["text"]).toBe("done");
    expect(conversation.turns().map((exchange) => exchange.position)).toEqual([1]);
    expect(conversation.sideCalls()).toHaveLength(1);
    session.close();
  });

  test("refuses unknown routes and unknown sessions", async () => {
    const conversation = createConversation();
    const session = proxy.open(conversation.handler);
    expect((await post(session.baseUrl, "/v2/whatever", {})).status).toBe(404);
    expect(conversation.sideCalls()[0]?.path).toBe("/v2/whatever");
    session.close();
    expect((await post(session.baseUrl, "/v1/messages", {})).status).toBe(404);
  });
});
