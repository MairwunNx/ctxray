import type { UserConfigInput } from "../../shared/contract/index.ts";

// Gives ctxray.config.ts its types. The binary validates the result when it loads the file.
export const defineConfig = (config: UserConfigInput): UserConfigInput => config;
