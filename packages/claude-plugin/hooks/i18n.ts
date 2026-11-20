// The words the band and the pane show. English is the source, Russian ships too, as in the ctxray CLI.
const en = {
  title: "ctxray · Loadout",
  open: "Loadout",
  hide: "Hide",
  ofWindow: (used: string, window: string, share: string) => `${used} of ${window} · ${share}`,
  waiting: "ctxray counts the Loadout after the first turn.",
  tab: { overview: "Overview", files: "Files", tools: "Tools", skills: "Skills" },
  share: {
    "System prompt": "System prompt",
    "System tools": "Built-in tools",
    "MCP tools": "MCP tools",
    "Custom agents": "Agents",
    "Memory files": "Instruction files",
    Skills: "Skills",
    Messages: "Messages",
  } as Record<string, string>,
  short: {
    "System prompt": "system",
    "System tools": "tools",
    "MCP tools": "mcp",
    "Custom agents": "agents",
    "Memory files": "files",
    Skills: "skills",
    Messages: "chat",
  } as Record<string, string>,
  kind: { Project: "project", User: "user", Local: "local", Managed: "managed", AutoMem: "memory" } as Record<
    string,
    string
  >,
  source: {
    projectSettings: "project",
    userSettings: "user",
    policySettings: "managed",
    plugin: "plugin",
    "built-in": "built-in",
    mcp: "MCP",
    syncedSkills: "account",
  } as Record<string, string>,
  importedBy: (parent: string) => `@ from ${parent}`,
  builtIn: "Built-in tools",
  deferred: "Built-in, behind tool search",
  files: (n: number) => `${n} ${n === 1 ? "file" : "files"}`,
  servers: (n: number) => `${n} MCP ${n === 1 ? "server" : "servers"}`,
  keys: "1–4 · Esc",
  server: (count: number, idle: number) => `${count} tools${idle > 0 ? `, ${idle} behind search` : ""}`,
  noFiles: "No instruction files loaded.",
  noTools: "No MCP servers.",
  skillsListed: (listed: number, total: number) =>
    listed === total ? `${total} skills listed` : `${listed} of ${total} skills listed`,
  used: "used",
  footer: "Counted by Claude Code · why each piece loaded: ctxray inspect",
};

export type Words = typeof en;

const ru: Words = {
  ...en,
  title: "ctxray · Loadout",
  hide: "Скрыть",
  ofWindow: (used, window, share) => `${used} из ${window} · ${share}`,
  waiting: "ctxray посчитает Loadout после первого хода.",
  tab: { overview: "Обзор", files: "Файлы", tools: "Инструменты", skills: "Скиллы" },
  share: {
    "System prompt": "Системный промпт",
    "System tools": "Встроенные инструменты",
    "MCP tools": "MCP-инструменты",
    "Custom agents": "Агенты",
    "Memory files": "Файлы инструкций",
    Skills: "Скиллы",
    Messages: "Сообщения",
  },
  short: {
    "System prompt": "система",
    "System tools": "инструменты",
    "MCP tools": "mcp",
    "Custom agents": "агенты",
    "Memory files": "файлы",
    Skills: "скиллы",
    Messages: "чат",
  },
  kind: { Project: "проект", User: "пользователь", Local: "локальный", Managed: "организация", AutoMem: "память" },
  source: {
    projectSettings: "проект",
    userSettings: "пользователь",
    policySettings: "организация",
    plugin: "плагин",
    "built-in": "встроенный",
    mcp: "MCP",
    syncedSkills: "аккаунт",
  },
  importedBy: (parent) => `@ из ${parent}`,
  builtIn: "Встроенные инструменты",
  deferred: "Встроенные, за поиском инструментов",
  files: (n) => `файлов: ${n}`,
  servers: (n) => `MCP-серверов: ${n}`,
  keys: "1–4 · Esc",
  server: (count, idle) => `инструментов: ${count}${idle > 0 ? `, за поиском: ${idle}` : ""}`,
  noFiles: "Файлы инструкций не загружены.",
  noTools: "MCP-серверов нет.",
  skillsListed: (listed, total) => (listed === total ? `скиллов в списке: ${total}` : `в списке ${listed} из ${total}`),
  used: "вызван",
  footer: "Считает Claude Code · почему загружена каждая часть: ctxray inspect",
};

const CATALOGS: Record<string, Words> = { en, ru };

export const wordsFor = (lang: string): Words => CATALOGS[lang] ?? en;
