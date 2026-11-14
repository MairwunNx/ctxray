import { createInjector } from "typed-inject";

export type Env = Readonly<Record<string, string | undefined>>;

export const createContainer = (env: Env) => createInjector().provideValue("env", env);

export type Container = ReturnType<typeof createContainer>;
