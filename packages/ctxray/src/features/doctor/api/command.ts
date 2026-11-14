import { CONFIG_OPTION } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Renderer, type Span, span, type View } from "#shared/render/index.ts";
import type { DoctorAction } from "../doctor.action.ts";
import type { DoctorSection, Status } from "../lib/model.ts";

export const doctorSpec: CommandSpec = {
  name: "doctor",
  summary: "command.doctor",
  options: { config: CONFIG_OPTION },
  usesConfig: true,
};

const MARKS: Record<Status, Span> = {
  ok: span("✓", "success"),
  info: span("·", "muted"),
  warning: span("!", "warning"),
  error: span("✗", "failure"),
};

const sectionView = ({ title, checks }: DoctorSection, t: Translate): View => [
  [span(` ${t(title)}`, "strong")],
  ...columns(
    checks.map((one) => [
      MARKS[one.status],
      span(t(one.key, one.params), one.status === "error" ? "failure" : "plain"),
    ]),
    { indent: 3, gap: 1 },
  ),
  [],
];

const summary = (errors: number, warnings: number, t: Translate) => {
  if (errors === 0 && warnings === 0) return span(` ${t("doctor.healthy")}`, "success");
  const parts = [
    ...(errors > 0 ? [t("doctor.errors", { count: errors })] : []),
    ...(warnings > 0 ? [t("doctor.warnings", { count: warnings })] : []),
  ];
  return span(` ${parts.join(" · ")}`, errors > 0 ? "failure" : "warning");
};

export const createDoctorCommand =
  (doctor: DoctorAction, t: Translate, renderer: Renderer): Handler =>
  async () => {
    const sections = await doctor();
    const all = sections.flatMap((section) => section.checks);
    const errors = all.filter((one) => one.status === "error").length;
    const warnings = all.filter((one) => one.status === "warning").length;
    renderer.print([[], ...sections.flatMap((section) => sectionView(section, t)), [summary(errors, warnings, t)]]);
    return errors > 0 ? ExitCode.environment : ExitCode.ok;
  };
createDoctorCommand.inject = ["doctorAction", "t", "renderer"] as const;
