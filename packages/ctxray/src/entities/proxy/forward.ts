import { type Egress, fetchThrough } from "#shared/infra/index.ts";
import type { Exchange, Handler, Protocol } from "./model.ts";
import { KITS } from "./protocols/index.ts";

// Where each protocol goes when nobody configured an upstream.
export const PROVIDERS: Record<Protocol, string> = {
  anthropic: "https://api.anthropic.com",
  responses: "https://api.openai.com",
  chat: "https://api.openai.com",
  gemini: "https://generativelanguage.googleapis.com",
};

const HOP_BY_HOP = ["host", "connection", "content-length", "accept-encoding", "transfer-encoding"];

export type ForwardOptions = {
  upstream: string | undefined; // a gateway in front of every provider, or each provider's own API
  egress: Egress;
  headers?: Record<string, string>; // replaces what the harness sent, like the real key for a dummy one
  onExchange?: (exchange: Exchange) => void;
};

// The proxy in front of a real model: the request goes on unchanged, ctxray keeps a copy.
export const createForward = ({ upstream, egress, headers = {}, onExchange = () => {} }: ForwardOptions): Handler => {
  let seq = 0;
  return async (incoming) => {
    const kit = KITS[incoming.protocol];
    const isTurn = incoming.route === "turn" && kit.hasTools(incoming.body);
    onExchange({
      seq: seq++,
      session: incoming.session,
      protocol: incoming.protocol,
      path: incoming.path,
      position: isTurn ? kit.position(incoming.body) : undefined,
      retries: 0,
      userAgent: incoming.headers.get("user-agent") ?? undefined,
      headers: Object.fromEntries(incoming.headers.entries()),
      body: incoming.body,
    });
    const target = new URL(`${(upstream ?? PROVIDERS[incoming.protocol]).replace(/\/$/, "")}${incoming.path}`);
    target.search = incoming.search;
    const sent = new Headers(incoming.headers);
    for (const name of HOP_BY_HOP) sent.delete(name);
    for (const [name, value] of Object.entries(headers)) sent.set(name, value);
    try {
      const response = await fetchThrough(
        target,
        {
          method: incoming.method,
          headers: sent,
          ...(incoming.method !== "GET" && { body: JSON.stringify(incoming.body) }),
        },
        egress,
      );
      const back = new Headers(response.headers);
      back.delete("content-encoding");
      back.delete("content-length");
      return new Response(response.body, { status: response.status, headers: back });
    } catch (error) {
      return kit.error(502, `ctxray: ${target.host} unreachable: ${(error as Error).message}`);
    }
  };
};
