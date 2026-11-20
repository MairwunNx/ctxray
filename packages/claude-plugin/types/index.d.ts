// What the Loadout band and pane keep for the session. Claude Code counts every token here itself.

// One line of a list: a file, a tool group, a skill.
export type Piece = {
  name: string;
  tokens: number;
  note?: string;
  depth?: number;
  isIdle?: boolean;
};

// One share of the context, as /context names and colors it.
export type Share = { name: string; tokens: number; color: string };

export type Snapshot = {
  model: string;
  used: number;
  window: number;
  shares: Share[];
  files: Piece[];
  tools: Piece[];
  skills: Piece[];
  servers: number;
  skillsListed: number;
  skillsTotal: number;
};

export type Tab = "overview" | "files" | "tools" | "skills";

declare module "claude-code" {
  interface PluginState {
    ctxray: {
      snapshot: Shaped<Snapshot | null>;
      imports: Shaped<Record<string, string>>;
      usedSkills: Shaped<string[]>;
      tab: Tab;
      cwd: string;
      home: string;
      lang: string;
    };
  }
}
