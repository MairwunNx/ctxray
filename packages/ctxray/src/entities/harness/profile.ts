import type { CaptureMode, HarnessId } from "../../shared/contract/index.ts";
import type { Capability } from "./capability.ts";

// What an adapter declares about its harness. The discovery and launch functions join it in later stages.
export type HarnessProfile = {
  id: HarnessId;
  title: string;
  modes: readonly CaptureMode[];
  // Modes that work through undocumented means and run only when the user opts in.
  experimentalModes: readonly CaptureMode[];
  capabilities: readonly Capability[];
};

export type Requirement = { requires: readonly Capability[]; mode: CaptureMode; experimental: boolean };

export type Support = { supported: true } | { supported: false; missing: string[] };

export const checkSupport = (profile: HarnessProfile, need: Requirement): Support => {
  const modes = need.experimental ? [...profile.modes, ...profile.experimentalModes] : profile.modes;
  const missing = [
    ...(modes.includes(need.mode) ? [] : [`mode:${need.mode}`]),
    ...need.requires.filter((capability) => !profile.capabilities.includes(capability)),
  ];
  return missing.length === 0 ? { supported: true } : { supported: false, missing };
};
