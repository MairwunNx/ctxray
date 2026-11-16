// The Homebrew formula and the Scoop manifest of a release, written from its checksums. The release workflow
// commits them to MairwunNx/homebrew-tap and MairwunNx/scoop-bucket.
const REPO = "https://github.com/MairwunNx/ctxray";
const DESCRIPTION = "X-ray for agent harnesses: see and test what your coding agent loads";

const pick = (sums: ReadonlyMap<string, string>, asset: string) => {
  const sum = sums.get(asset);
  if (!sum) throw new Error(`SHA256SUMS has no ${asset}`);
  return sum;
};

export const formula = (version: string, sums: ReadonlyMap<string, string>) => {
  const build = (target: string, indent: string) =>
    [
      `${indent}url "${REPO}/releases/download/v${version}/ctxray-${target}.tar.gz"`,
      `${indent}sha256 "${pick(sums, `ctxray-${target}.tar.gz`)}"`,
    ].join("\n");
  return `# ctxray's release workflow writes this file from the release's SHA256SUMS.
class Ctxray < Formula
  desc "${DESCRIPTION}"
  homepage "${REPO}"
  version "${version}"
  license "MIT"

  on_macos do
    on_arm do
${build("darwin-arm64", "      ")}
    end
    on_intel do
${build("darwin-x64", "      ")}
    end
  end

  on_linux do
    on_arm do
${build("linux-arm64", "      ")}
    end
    on_intel do
${build("linux-x64", "      ")}
    end
  end

  def install
    bin.install "ctxray"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ctxray --version")
  end
end
`;
};

export const scoopManifest = (version: string, sums: ReadonlyMap<string, string>) => {
  const url = (cpu: string, tag: string) => `${REPO}/releases/download/${tag}/ctxray-windows-${cpu}.zip`;
  const manifest = {
    version,
    description: DESCRIPTION,
    homepage: REPO,
    license: "MIT",
    architecture: {
      "64bit": { url: url("x64", `v${version}`), hash: pick(sums, "ctxray-windows-x64.zip") },
      arm64: { url: url("arm64", `v${version}`), hash: pick(sums, "ctxray-windows-arm64.zip") },
    },
    bin: "ctxray.exe",
    checkver: "github",
    autoupdate: {
      architecture: { "64bit": { url: url("x64", "v$version") }, arm64: { url: url("arm64", "v$version") } },
      hash: { url: "$baseurl/SHA256SUMS" },
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
};
