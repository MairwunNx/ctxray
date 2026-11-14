export type Env = Readonly<Record<string, string | undefined>>;

const CI_VARIABLES = ["CI", "GITLAB_CI", "GITHUB_ACTIONS"] as const;

// `CI=false` and `CI=0` are how people switch CI mode off by hand, so they don't count.
export const isOn = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

export const isCi = (env: Env): boolean => CI_VARIABLES.some((name) => isOn(env[name]));
