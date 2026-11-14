// Subresource integrity: `sha512-<base64>` as npm records it, or `sha256-<base64>` for a download whose
// publisher puts a SHA-256 next to it. ctxray checks the strongest hash the entry holds.
const ALGORITHMS = ["sha512", "sha256"] as const;
type Algorithm = (typeof ALGORITHMS)[number];

const strongest = (integrity: string) => {
  const hashes = integrity.split(/\s+/);
  for (const algorithm of ALGORITHMS) {
    const found = hashes.find((one) => one.startsWith(`${algorithm}-`));
    if (found) return { algorithm, expected: found };
  }
  return undefined;
};

export const hasherFor = (integrity: string) => {
  const found = strongest(integrity);
  return found && { ...found, hasher: new Bun.CryptoHasher(found.algorithm) };
};

export const integrityOf = (hasher: Bun.CryptoHasher, algorithm: Algorithm = "sha512") =>
  `${algorithm}-${hasher.digest("base64")}`;

// `e945be00…  agent-cli-local-package.tar.gz`, a `.sha256` file's line, as integrity.
export const integrityOfSha256 = (line: string) => {
  const hex = /^[0-9a-f]{64}/i.exec(line.trim())?.[0];
  return hex === undefined ? undefined : `sha256-${Buffer.from(hex, "hex").toString("base64")}`;
};

// The first 8 hex digits of the hash: enough to tell two builds of one version apart in a directory name.
export const shortHash = (integrity: string) =>
  Buffer.from((strongest(integrity)?.expected ?? integrity).replace(/^sha\d+-/, ""), "base64")
    .toString("hex")
    .slice(0, 8);
