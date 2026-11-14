import { createTranslator, DEFAULT_LANG, type MessageKey, type Params } from "#shared/i18n/index.ts";

const english = createTranslator(DEFAULT_LANG);

// Why a harness couldn't be resolved, downloaded, or installed, in words the CLI translates.
export class ProvisionFailure extends Error {
  readonly key: MessageKey;
  readonly params: Params;

  constructor(key: MessageKey, params: Params = {}) {
    super(english(key, params));
    this.name = "ProvisionFailure";
    this.key = key;
    this.params = params;
  }
}

export const fail = (key: MessageKey, params?: Params): never => {
  throw new ProvisionFailure(key, params);
};
