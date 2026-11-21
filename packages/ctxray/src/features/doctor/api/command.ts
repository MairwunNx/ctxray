import { progressView } from "#entities/harness-cache/index.ts";
import { CONFIG_OPTION } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Renderer, type Span, span, type View } from "#shared/render/index.ts";
import type { DoctorAction } from "../doctor.action.ts";
import type { DoctorCheck, DoctorSection, Status } from "../lib/model.ts";

export const doctorSpec: CommandSpec = {
  name: "doctor",
  summary: "command.doctor",
  options: { fix: { type: "boolean", summary: "option.fix" }, config: CONFIG_OPTION },
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

// What `--fix` did, then how many findings above it left to you.
const fixView = (fixes: readonly DoctorCheck[], left: number, t: Translate): View => [
  ...sectionView(
    {
      title: "doctor.titleFix",
      checks: fixes.length > 0 ? [...fixes] : [{ status: "info", key: "doctor.nothingFixed" }],
    },
    t,
  ).slice(0, -1),
  ...(left > 0 ? [[span("   "), span(t("doctor.leftForYou", { count: left }), "muted")]] : []),
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
  async (values) => {
    const { sections, fixes } = await doctor({
      fix: values["fix"] === true,
      onProgress: (harness, progress) => renderer.live(progressView(harness, progress, t)),
    });
    renderer.live(undefined);
    const found = sections.flatMap((section) => section.checks);
    const all = [...found, ...(fixes ?? [])];
    const errors = all.filter((one) => one.status === "error").length;
    const warnings = all.filter((one) => one.status === "warning").length;
    const left = found.filter((one) => one.status === "error" || one.status === "warning").length;
    renderer.print([
      [],
      ...sections.flatMap((section) => sectionView(section, t)),
      ...(fixes ? fixView(fixes, left, t) : []),
      [summary(errors, warnings, t)],
    ]);
    return errors > 0 ? ExitCode.environment : ExitCode.ok;
  };
createDoctorCommand.inject = ["doctorAction", "t", "renderer"] as const;
