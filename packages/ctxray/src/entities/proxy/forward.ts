import { type Egress, fetchThrough } from "#shared/infra/index.ts";
import { CREDENTIAL_HEADERS } from "./credentials.ts";
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

// The upstream's answer as the harness got it, once the last byte went by.
export type Answer = { status: number; contentType: string; text: string };

export type ForwardOptions = {
  upstream: string | undefined; // a gateway in front of every provider, or each provider's own API
  egress: Egress;
  // The real key, in place of the dummy one the harness holds: credentialsFor() with the user's environment.
  headers?: Record<string, string> | ((protocol: Protocol, sent: Headers) => Record<string, string>);
  onExchange?: (exchange: Exchange) => void;
  onAnswer?: (exchange: Exchange, answer: Answer) => void;
};

// The harness reads one copy of the body as it streams, ctxray the other.
const tapped = (response: Response, onText: (text: string) => void): ReadableStream | null => {
  if (!response.body) {
    onText("");
    return null;
  }
  const [mine, theirs] = response.body.tee();
  new Response(mine).text().then(onText, () => onText(""));
  return theirs;
};

// The proxy in front of a real model: the request goes on unchanged, ctxray keeps a copy.
export const createForward = ({
  upstream,
  egress,
  headers = {},
  onExchange = () => {},
  onAnswer,
}: ForwardOptions): Handler => {
  let seq = 0;
  return async (incoming) => {
    const kit = KITS[incoming.protocol];
    const isTurn = incoming.route === "turn" && kit.hasTools(incoming.body);
    const exchange: Exchange = {
      seq: seq++,
      session: incoming.session,
      protocol: incoming.protocol,
      path: incoming.path,
      position: isTurn ? kit.position(incoming.body) : undefined,
      retries: 0,
      userAgent: incoming.headers.get("user-agent") ?? undefined,
      headers: Object.fromEntries(incoming.headers.entries()),
      body: incoming.body,
    };
    onExchange(exchange);
    const target = new URL(`${(upstream ?? PROVIDERS[incoming.protocol]).replace(/\/$/, "")}${incoming.path}`);
    target.search = incoming.search;
    const sent = new Headers(incoming.headers);
    for (const name of [...HOP_BY_HOP, ...CREDENTIAL_HEADERS]) sent.delete(name);
    const own = typeof headers === "function" ? headers(incoming.protocol, incoming.headers) : headers;
    for (const [name, value] of Object.entries(own)) sent.set(name, value);
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
      const contentType = response.headers.get("content-type") ?? "application/json";
      const body = onAnswer
        ? tapped(response, (text) => onAnswer(exchange, { status: response.status, contentType, text }))
        : response.body;
      return new Response(body, { status: response.status, headers: back });
    } catch (error) {
      const failed = kit.error(502, `ctxray: ${target.host} unreachable: ${(error as Error).message}`);
      if (onAnswer) {
        const text = await failed.clone().text();
        onAnswer(exchange, { status: failed.status, contentType: "application/json", text });
      }
      return failed;
    }
  };
};
