import type { Json, Protocol } from "../model.ts";
import type { ExactCounter } from "./counter.ts";

export type Piece = { component: string; id: string; text: string };

export type LocalSummary = {
  byComponent: Readonly<Record<string, number | undefined>>;
  byMcpServer: Readonly<Record<string, number>>;
};

export type ExactSummary = {
  total: number;
  byComponent: Record<string, number>;
  byMcpServer: Record<string, number>;
  framing: number; // what no component owns: the conversation, the request's frame, the tool-use preamble
  method: string;
};

const TEXT = ["system", "rules", "skills", "commands"];

// Shares of a whole, by weights, in whole tokens that add up to the whole.
const apportion = (whole: number, weights: Readonly<Record<string, number>>) => {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const shares: Record<string, number> = {};
  let given = 0;
  const entries = Object.entries(weights);
  for (const [index, [name, weight]] of entries.entries()) {
    const share = index === entries.length - 1 ? whole - given : sum === 0 ? 0 : Math.round((whole * weight) / sum);
    shares[name] = share;
    given += share;
  }
  return shares;
};

// The provider's own count of the request, split by add-one deltas (ADR 0012): the baseline, the baseline with
// one component's text, the baseline with every tool. Tools split between the harness and each MCP server by
// their local shares, so the rows always add up to the exact total.
export const exactSummary = async (
  counter: ExactCounter,
  protocol: Protocol,
  model: string,
  body: Json,
  pieces: readonly Piece[],
  local: LocalSummary,
): Promise<ExactSummary | undefined> => {
  const endpoint = counter.endpoint(protocol);
  if (!endpoint) return undefined;
  const count = (counted: Json) => counter.count(protocol, model, counted);
  const minimal = endpoint.minimal(model);
  const tools = endpoint.toolsOf(body);
  const texts = TEXT.map((component) => ({
    component,
    text: pieces
      .filter((piece) => piece.component === component)
      .map((piece) => piece.text)
      .join("\n\n"),
  })).filter(({ text }) => text !== "");
  const [total, baseline, probe, withTools, ...withTexts] = await Promise.all([
    count(body),
    count(minimal),
    tools.length > 0 ? count(endpoint.withTools(minimal, [endpoint.probe])) : Promise.resolve(0),
    tools.length > 0 ? count(endpoint.withTools(minimal, tools)) : Promise.resolve(0),
    ...texts.map(({ text }) => count(endpoint.withSystem(minimal, text))),
  ]);
  const byComponent: Record<string, number> = {};
  for (const [index, { component }] of texts.entries()) {
    byComponent[component] = Math.max(0, (withTexts[index] ?? baseline) - baseline);
  }
  const byMcpServer: Record<string, number> = {};
  if (tools.length > 0) {
    const toolTokens = Math.max(0, withTools - probe);
    const weights = { tools: local.byComponent["tools"] ?? 0, ...local.byMcpServer };
    const shares = apportion(toolTokens, weights);
    byComponent["tools"] = shares["tools"] ?? 0;
    for (const server of Object.keys(local.byMcpServer)) byMcpServer[server] = shares[server] ?? 0;
    const mcp = Object.values(byMcpServer).reduce((a, b) => a + b, 0);
    if (mcp > 0) byComponent["mcp"] = mcp;
  }
  const owned = Object.values(byComponent).reduce((a, b) => a + b, 0);
  return { total, byComponent, byMcpServer, framing: total - owned, method: endpoint.method };
};
