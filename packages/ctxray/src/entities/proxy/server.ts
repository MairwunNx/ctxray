import { Elysia } from "elysia";
import type { Egress } from "#shared/infra/index.ts";
import { forwardMcp, type McpMessage } from "./mcp-forward.ts";
import type { Handler, Incoming, Json, Protocol, Route } from "./model.ts";
import { KITS } from "./protocols/index.ts";

type Matched = { protocol: Protocol; route: Route; stream?: boolean; model?: string };

// Routes match on the path alone: Claude Code adds `?beta=true`, Gemini adds `?alt=sse` (ADR 0004).
const ROUTES: [RegExp, (match: RegExpExecArray) => Matched][] = [
  [/^\/v1\/messages$/, () => ({ protocol: "anthropic", route: "turn" })],
  [/^\/v1\/messages\/count_tokens$/, () => ({ protocol: "anthropic", route: "count" })],
  [/^\/v1\/responses$/, () => ({ protocol: "responses", route: "turn" })],
  [/^\/v1\/chat\/completions$/, () => ({ protocol: "chat", route: "turn" })],
  [/^\/v1\/models$/, () => ({ protocol: "chat", route: "models" })],
  [/^\/v1\/analytics\//, () => ({ protocol: "responses", route: "analytics" })],
  [
    /^\/v1beta\/models\/([^/:]+):(generateContent|streamGenerateContent|countTokens)$/,
    (match) => ({
      protocol: "gemini",
      route: match[2] === "countTokens" ? "count" : "turn",
      stream: match[2] === "streamGenerateContent",
      ...(match[1] && { model: match[1] }),
    }),
  ],
];

const matchRoute = (path: string): Matched => {
  for (const [pattern, matched] of ROUTES) {
    const match = pattern.exec(path);
    if (match) return matched(match);
  }
  return { protocol: "anthropic", route: "unknown" };
};

const readBody = async (request: Request): Promise<Json> => {
  const text = await request.text();
  if (text === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Json) : { value: parsed };
  } catch {
    return { text };
  }
};

export type ProxyServer = {
  url: string; // http://127.0.0.1:<port>
  // A harness run gets its own prefix, `<url>/s/<id>`, to use as its base URL.
  open: (handler: Handler) => { id: string; baseUrl: string; close: () => void };
  // An HTTP MCP server behind ctxray: the harness gets `url`, the messages reach `onMessage`.
  openMcp: (
    target: string,
    egress: Egress,
    onMessage: (line: McpMessage) => void,
  ) => { url: string; close: () => void };
  stop: () => Promise<void>;
};

// One local server for a whole ctxray run. Each harness session talks to it under its own prefix, so the
// requests of parallel sessions never mix.
export const startProxy = (): ProxyServer => {
  const sessions = new Map<string, Handler>();
  const servers = new Map<string, ReturnType<typeof forwardMcp>>();
  const mcp = ({ params, request }: { params: { id: string; "*"?: string }; request: Request }) => {
    const forward = servers.get(params.id);
    return forward ? forward(request, params["*"] ?? "") : new Response("ctxray: no such MCP server", { status: 404 });
  };
  const app = new Elysia()
    .all("/m/:id", mcp)
    .all("/m/:id/*", mcp)
    .all("/s/:session/*", async ({ params, request }) => {
      const handler = sessions.get(params.session);
      const url = new URL(request.url);
      const path = url.pathname.slice(`/s/${params.session}`.length);
      const matched = matchRoute(path);
      if (!handler) return KITS[matched.protocol].error(404, `ctxray: no session ${params.session}`);
      const body = request.method === "GET" ? {} : await readBody(request);
      const incoming: Incoming = {
        session: params.session,
        protocol: matched.protocol,
        route: matched.route,
        stream: matched.stream ?? body["stream"] === true,
        path,
        search: url.search,
        method: request.method,
        headers: request.headers,
        body,
        model: matched.model ?? (typeof body["model"] === "string" ? body["model"] : undefined),
      };
      return handler(incoming);
    });
  app.listen({ hostname: "127.0.0.1", port: 0 });
  const url = `http://127.0.0.1:${app.server?.port}`;
  return {
    url,
    open: (handler) => {
      const id = crypto.randomUUID().slice(0, 8);
      sessions.set(id, handler);
      return { id, baseUrl: `${url}/s/${id}`, close: () => sessions.delete(id) };
    },
    openMcp: (target, egress, onMessage) => {
      const id = crypto.randomUUID().slice(0, 8);
      servers.set(id, forwardMcp(target, egress, onMessage));
      return { url: `${url}/m/${id}`, close: () => servers.delete(id) };
    },
    stop: async () => {
      await app.stop(true);
    },
  };
};
