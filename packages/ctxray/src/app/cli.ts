import { DEFAULT_CONFIG } from "#entities/user-config/index.ts";
import { type OptionSpecs, type ParseError, parseFlags } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import { CATALOGS, createTranslator, DEFAULT_LANG, type Translate } from "#shared/i18n/index.ts";
import { type Env, isOn } from "#shared/infra/index.ts";
import { createRenderer } from "#shared/render/index.ts";
import { COMMANDS } from "./commands.ts";
import { type Container, createRunInjector } from "./container.ts";
import { helpView } from "./help.ts";
import { GLOBAL_OPTIONS } from "./options.ts";
import { ISSUES_URL, VERSION } from "./package-info.ts";
import { resolveSettings } from "./settings.ts";

export type Io = {
  env: Env;
  stdout: NodeJS.WriteStream;
  stderr: { write: (text: string) => unknown };
  intlLocale?: string | undefined;
};

// Flags of every command, so a command's flag before its name (`ctxray --force init`) still parses.
const ANY_OPTIONS: OptionSpecs = Object.assign({}, GLOBAL_OPTIONS, ...COMMANDS.map((command) => command.spec.options));

const parseErrorText = (t: Translate, error: ParseError) => t(`error.${error.kind}`, { name: error.option });

const text = (value: string | boolean | undefined) => (typeof value === "string" ? value : undefined);

export const runCli = async (args: readonly string[], io: Io, container: Container): Promise<ExitCode> => {
  const probe = parseFlags(args, ANY_OPTIONS);
  const values = probe.ok ? probe.values : {};
  const sources = { values, env: io.env, tty: io.stdout.isTTY === true, intlLocale: io.intlLocale };
  const say = (text: string) => io.stderr.write(`ctxray: ${text}\n`);
  // With CTXRAY_DEBUG a message missing from the chosen catalog says so, in English, the catalog it falls back to.
  const english = createTranslator(DEFAULT_LANG);
  const onMissing = (key: string, lang: string) => say(english("debug.missingMessage", { key, lang }));
  const translator = (lang: string) =>
    createTranslator(lang, CATALOGS, isOn(io.env["CTXRAY_DEBUG"]) ? onMissing : undefined);
  let settings = resolveSettings(sources);
  let t = translator(settings.lang);
  const usageError = (text: string, help = "ctxray --help") => {
    say(text);
    io.stderr.write(`${t("error.hint", { command: help })}\n`);
    return ExitCode.usage;
  };

  if (settings.unsupportedLang) say(t("lang.unsupported", { lang: settings.unsupportedLang }));
  if (!probe.ok) return usageError(parseErrorText(t, probe.error));

  const [name, ...rest] = probe.positionals;
  const command = COMMANDS.find((candidate) => candidate.spec.name === name);
  if (name !== undefined && !command) return usageError(t("error.unknownCommand", { name }));
  const parsed = parseFlags(args, { ...GLOBAL_OPTIONS, ...command?.spec.options });
  if (!parsed.ok) return usageError(parseErrorText(t, parsed.error));
  const subcommands = command?.spec.subcommands;
  const [sub] = rest;
  if (!subcommands && sub !== undefined) return usageError(t("error.unexpectedArgument", { value: sub }));
  if (subcommands && values["help"] !== true) {
    if (sub === undefined && command.spec.defaultSubcommand === undefined)
      return usageError(t("error.noSubcommand", { command: command.spec.name }));
    if (sub !== undefined && !(sub in subcommands))
      return usageError(t("error.unknownSubcommand", { name: sub, command: command.spec.name }));
  }
  if (values["version"] === true) {
    io.stdout.write(`ctxray ${VERSION}\n`);
    return ExitCode.ok;
  }

  // The config can name the language, so the CLI reads it before it renders anything.
  let config = DEFAULT_CONFIG;
  if (command?.spec.usesConfig && values["help"] !== true) {
    const loaded = await container.resolve("configLoader")(text(parsed.values["config"]), settings.lang);
    if (!loaded.ok) {
      say(t("config.failed"));
      for (const problem of loaded.problems) io.stderr.write(`  ${t(problem.key, problem.params)}\n`);
      return ExitCode.config;
    }
    config = loaded.config;
    const configured = resolveSettings({ ...sources, configLang: config.lang });
    if (configured.unsupportedLang !== settings.unsupportedLang) {
      say(t("lang.unsupported", { lang: String(configured.unsupportedLang) }));
    }
    settings = configured;
    t = translator(settings.lang);
  }

  const specs = COMMANDS.map((candidate) => candidate.spec);
  // Disposed in reverse on every way out: the run's injector first, then the renderer it prints through.
  await using stack = new AsyncDisposableStack();
  const renderer = stack.adopt(await createRenderer(settings.renderer, io.stdout), (opened) => opened.close());
  const run = stack.adopt(createRunInjector(container, settings, t, renderer, config), (injector) =>
    injector.dispose(),
  );
  try {
    if (!command || values["help"] === true) {
      renderer.print(helpView(t, specs, GLOBAL_OPTIONS, command?.spec));
      return ExitCode.ok;
    }
    return await command.handler(run)(parsed.values, rest);
  } catch (error) {
    say(t("error.internal", { message: error instanceof Error ? (error.stack ?? error.message) : String(error) }));
    say(t("error.report", { url: ISSUES_URL }));
    return ExitCode.internal;
  }
};
