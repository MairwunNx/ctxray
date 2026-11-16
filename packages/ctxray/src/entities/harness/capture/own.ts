import type { Segment } from "./model.ts";

// ctxray's plugin for Claude Code reaches the model like any other plugin: its skills as `ctxray:<skill>`, its MCP
// server as `plugin_ctxray_<server>`. A loadout lists them as ctxray's own and leaves them out of every total,
// so ctxray doesn't count itself in what it measures. A skill body is ctxray's when it loads from the plugin's root.
export const OWN_PLUGIN = "ctxray";

export const isOwnSkill = (name: string) => name.startsWith(`${OWN_PLUGIN}:`);
export const isOwnServer = (name: string) => name.startsWith(`plugin_${OWN_PLUGIN}_`);
const isOwnPath = (path: string, roots: readonly string[]) =>
  roots.some((root) => path === root || path.startsWith(`${root.replace(/\/$/, "")}/`));

export const isOwnSegment = (segment: Segment, roots: readonly string[]) => {
  if (segment.component === "skills") {
    const id = segment.id.replace(/^loaded:/, "");
    return segment.id.startsWith("loaded:") ? isOwnPath(id, roots) : isOwnSkill(id);
  }
  if (segment.component === "mcp") return isOwnServer(segment.id.split("/")[0] ?? "");
  return false;
};
