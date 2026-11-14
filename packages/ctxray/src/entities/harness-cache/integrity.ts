// Subresource integrity, the form npm records: `sha512-<base64>`. ctxray checks only the strongest hash.
export const hasherFor = (integrity: string) => {
  const sha512 = integrity.split(/\s+/).find((one) => one.startsWith("sha512-"));
  return sha512 === undefined ? undefined : { expected: sha512, hasher: new Bun.CryptoHasher("sha512") };
};

export const integrityOf = (hasher: Bun.CryptoHasher) => `sha512-${hasher.digest("base64")}`;

// The first 8 hex digits of the hash: enough to tell two builds of one version apart in a directory name.
export const shortHash = (integrity: string) => {
  const sha512 = integrity.split(/\s+/).find((one) => one.startsWith("sha512-")) ?? integrity;
  return Buffer.from(sha512.replace(/^sha\d+-/, ""), "base64")
    .toString("hex")
    .slice(0, 8);
};
