import type { CommandSpec, OptionSpec, OptionSpecs } from "../shared/cli/index.ts";
import { CATALOGS, type Translate } from "../shared/i18n/index.ts";
import { columns, type Line, span, type View } from "../shared/render/index.ts";
import { MANUAL_URL, VERSION } from "./package-info.ts";

// `-h, --help` and `    --lang <lang>`: long names line up whether or not a short one exists.
const optionLabel = (name: string, option: OptionSpec) =>
  `${option.short ? `-${option.short}, ` : "    "}--${name}${option.value ? ` <${option.value}>` : ""}`;

const optionRows = (options: OptionSpecs, t: Translate) =>
  columns(
    Object.entries(options).map(([name, option]) => [
      span(optionLabel(name, option), "accent"),
      span(t(option.summary, { langs: Object.keys(CATALOGS).join(", ") })),
    ]),
    { indent: 3 },
  );

const title = (text: string): Line => [span(" "), span(text, "strong")];

// The overview without a command, the command's own page with one.
export const helpView = (
  t: Translate,
  commands: readonly CommandSpec[],
  globalOptions: OptionSpecs,
  command?: CommandSpec,
): View => {
  const usage = `ctxray ${command?.name ?? t("help.command")} ${t("help.options")}`;
  const overview: View = command
    ? [[span(" "), span(t(command.summary))], []]
    : [
        title(t("help.commandsTitle")),
        ...columns(
          commands.map((spec) => [span(spec.name, "accent"), span(t(spec.summary))]),
          { indent: 3 },
        ),
        [],
      ];
  return [
    [],
    [span(" "), span("ctxray", "strong"), span(` ${VERSION} · ${t("cli.tagline")}`, "muted")],
    [],
    [span(" "), span(`${t("help.usage")}: `, "strong"), span(usage)],
    [],
    ...overview,
    title(t("help.optionsTitle")),
    ...optionRows({ ...command?.options, ...globalOptions }, t),
    [],
    [span(" "), span(t("help.manual", { url: MANUAL_URL }), "muted")],
  ];
};
