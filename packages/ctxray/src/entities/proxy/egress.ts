import { createServer, type Socket } from "node:net";

export type EgressGuard = {
  url: string; // for HTTPS_PROXY, HTTP_PROXY, and ALL_PROXY in the harness's environment
  attempts: () => readonly string[]; // `host:port` of every connection the harness tried past ctxray
  stop: () => Promise<void>;
};

// A proxy that lets nothing through. Harnesses phone home by default, and their model traffic must reach
// ctxray alone, so every attempt is refused and remembered (ADR 0013).
export const startEgressGuard = async (): Promise<EgressGuard> => {
  const attempts: string[] = [];
  const refuse = (socket: Socket) => {
    let head = "";
    socket.on("data", (chunk) => {
      head += chunk.toString("latin1");
      if (!head.includes("\r\n")) return;
      const [, target = "?"] = /^\w+ (\S+)/.exec(head) ?? [];
      attempts.push(target.replace(/^https?:\/\/([^/]+).*$/, "$1"));
      socket.end("HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\n\r\n");
    });
    socket.on("error", () => {});
  };
  const server = createServer(refuse);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    attempts: () => attempts,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
};
