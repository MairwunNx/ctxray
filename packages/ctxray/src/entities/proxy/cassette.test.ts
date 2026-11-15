import { afterAll, describe, expect, test } from "bun:test";
import { createPlayer, createRecorder, type Miss } from "./cassette.ts";
import { createForward } from "./forward.ts";
import { createRelay } from "./relay.ts";
import { startProxy } from "./server.ts";

const proxy = startProxy();
// A model that reads a file in the session's folder, then finishes.
const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const body = (await request.json()) as { messages?: { role: string }[] };
    const turn = (body.messages ?? []).filter((message) => message.role === "assistant").length;
    return Response.json({ turn, said: turn === 0 ? "Read /tmp/run-1/work/app/Charge.kt" : "done" });
  },
});
afterAll(async () => {
  await proxy.stop();
  upstream.stop(true);
});

const NO_EGRESS = { proxy: undefined, noProxy: [], ca: [] };
const turn = (assistants: number) => ({
  tools: [{ name: "Read" }],
  messages: [{ role: "user" }, ...Array.from({ length: assistants }, () => ({ role: "assistant" }))],
});
const post = async (baseUrl: string, path: string, body: object) =>
  (await fetch(`${baseUrl}${path}`, { method: "POST", body: JSON.stringify(body) })).json();

describe("cassettes", () => {
  test("a recorded session plays back in another folder", async () => {
    const recorder = createRecorder(() => ["/tmp/run-1/work"]);
    const recording = proxy.open(createForward({ upstream: upstream.url.origin, egress: NO_EGRESS, ...recorder }));
    await post(recording.baseUrl, "/v1/messages", turn(0));
    await post(recording.baseUrl, "/v1/messages", { messages: [] }); // a side call, like a title
    await post(recording.baseUrl, "/v1/messages", turn(1));
    recording.close();
    const tape = await recorder.tape();
    expect(tape.map((entry) => [entry.path, entry.position])).toEqual([
      ["/v1/messages", 0],
      ["/v1/messages", undefined],
      ["/v1/messages", 1],
    ]);
    expect(tape[0]?.body).toContain("Read <work>/app/Charge.kt");

    const misses: Miss[] = [];
    const playing = proxy.open(
      createPlayer(
        tape,
        () => "/tmp/run-2/work",
        (miss) => misses.push(miss),
      ),
    );
    expect(await post(playing.baseUrl, "/v1/messages", turn(0))).toEqual({
      turn: 0,
      said: "Read /tmp/run-2/work/app/Charge.kt",
    });
    expect(await post(playing.baseUrl, "/v1/messages", turn(1))).toEqual({ turn: 1, said: "done" });
    const response = await fetch(`${playing.baseUrl}/v1/messages`, { method: "POST", body: JSON.stringify(turn(2)) });
    expect(response.status).toBe(404);
    expect(misses).toEqual([{ path: "/v1/messages", position: 2 }]);
    playing.close();
  });

  test("a relay answers past its turns in the model's place, and stops on a refusal", async () => {
    let spent = false;
    const relay = createRelay(createForward({ upstream: upstream.url.origin, egress: NO_EGRESS }), {
      maxTurns: 1,
      refuse: () => (spent ? "the budget is spent" : undefined),
    });
    const session = proxy.open(relay.handler);
    expect(await post(session.baseUrl, "/v1/messages", turn(0))).toEqual({
      turn: 0,
      said: "Read /tmp/run-1/work/app/Charge.kt",
    });
    const closing = (await post(session.baseUrl, "/v1/messages", turn(1))) as { content: { text: string }[] };
    expect(closing.content[0]?.text).toBe("That's all for now.");
    expect([relay.cut(), (await relay.turn(1)).position, relay.turns().length]).toEqual([true, 1, 2]);
    spent = true;
    const refused = await fetch(`${session.baseUrl}/v1/messages`, { method: "POST", body: JSON.stringify(turn(0)) });
    expect(refused.status).toBe(429);
    session.close();
  });
});
