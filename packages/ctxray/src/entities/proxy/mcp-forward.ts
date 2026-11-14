import { type Egress, fetchThrough } from "./forward.ts";

export type McpMessage = { from: "client" | "server"; message: unknown };

const messagesOf = (text: string, contentType: string): unknown[] => {
  const parse = (json: string) => {
    try {
      const value: unknown = JSON.parse(json);
      return Array.isArray(value) ? value : [value];
    } catch {
      return [];
    }
  };
  if (!contentType.includes("text/event-stream")) return parse(text);
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .flatMap((line) => parse(line.slice(5).trim()));
};

// An MCP server over HTTP, behind ctxray: requests go on to the real URL, and each JSON-RPC message both ways
// reaches `onMessage`, whether the server answers with JSON or with server-sent events.
export const forwardMcp =
  (target: string, egress: Egress, onMessage: (line: McpMessage) => void) =>
  async (request: Request, subpath: string): Promise<Response> => {
    const url = new URL(target);
    if (subpath !== "") url.pathname = `${url.pathname.replace(/\/$/, "")}/${subpath}`;
    url.search = new URL(request.url).search;
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
    for (const message of body ? messagesOf(body, "application/json") : []) onMessage({ from: "client", message });
    const headers = new Headers(request.headers);
    headers.delete("host");
    const response = await fetchThrough(url, { method: request.method, headers, ...(body && { body }) }, egress).catch(
      (error: Error) => Response.json({ error: `ctxray: ${url.host} unreachable: ${error.message}` }, { status: 502 }),
    );
    if (!response.body) return response;
    const [toClient, toLog] = response.body.tee();
    const contentType = response.headers.get("content-type") ?? "";
    void new Response(toLog).text().then((text) => {
      for (const message of messagesOf(text, contentType)) onMessage({ from: "server", message });
    });
    const back = new Headers(response.headers);
    back.delete("content-encoding");
    back.delete("content-length");
    return new Response(toClient, { status: response.status, headers: back });
  };
