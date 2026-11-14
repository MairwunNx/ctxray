import { createInjector } from "typed-inject";

export type Env = Readonly<Record<string, string | undefined>>;

// Providers go in FAA layer order: shared, entities, features, command handlers.
// Factories take dependencies as positional parameters and declare `factory.inject = [...] as const`.
export const createContainer = (env: Env) => createInjector().provideValue("env", env);

export type Container = ReturnType<typeof createContainer>;
