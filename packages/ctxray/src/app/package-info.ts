import packageJson from "../../package.json" with { type: "json" };

export const VERSION: string = packageJson.version;
export const MANUAL_URL: string = packageJson.homepage;
export const ISSUES_URL: string = packageJson.bugs;
