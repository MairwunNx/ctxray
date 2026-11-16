#!/bin/sh
# Installs ctxray on Linux and macOS:
#   curl -fsSL https://github.com/MairwunNx/ctxray/releases/latest/download/install.sh | sh
#
# CTXRAY_VERSION        a version like 0.2.0, the latest release when unset
# CTXRAY_DOWNLOAD_BASE  where the releases live, https://github.com/MairwunNx/ctxray/releases when unset. A mirror
#                       keeps GitHub's layout: <base>/latest/download/<asset>, <base>/download/v<version>/<asset>
# CTXRAY_INSTALL_DIR    where the binary goes, ~/.local/bin when unset
set -eu

base="${CTXRAY_DOWNLOAD_BASE:-https://github.com/MairwunNx/ctxray/releases}"
base="${base%/}"
dir="${CTXRAY_INSTALL_DIR:-$HOME/.local/bin}"
if [ -n "${CTXRAY_VERSION:-}" ]; then url="$base/download/v${CTXRAY_VERSION#v}"; else url="$base/latest/download"; fi

# ctxray's own order: CTXRAY_LANG, then the POSIX variables, skipping C and POSIX.
lang=
for value in "${CTXRAY_LANG:-}" "${LC_ALL:-}" "${LC_MESSAGES:-}" "${LANG:-}"; do
  case "$value" in "" | C | C.* | POSIX | auto) ;; *) lang="$value" && break ;; esac
done
say() { case "$lang" in ru*) printf '%s\n' "$2" ;; *) printf '%s\n' "$1" ;; esac; }
fail() {
  say "$1" "$2" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "ctxray has no build for $(uname -s). On Windows, run install.ps1." "Для $(uname -s) сборки ctxray нет. На Windows запустите install.ps1." ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) cpu=x64 ;;
  arm64 | aarch64) cpu=arm64 ;;
  *) fail "ctxray has no build for $(uname -m) processors." "Для процессоров $(uname -m) сборки ctxray нет." ;;
esac
# A shell under Rosetta reports x64 on Apple silicon, the native build runs faster.
if [ "$os" = darwin ] && [ "$cpu" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then cpu=arm64; fi

target="$os-$cpu"
libs=
if [ "$os" = linux ]; then
  if ls /lib/ld-musl-* >/dev/null 2>&1; then
    target="$target-musl"
    # Bun's musl build links against these two, Alpine leaves them out.
    [ -e /usr/lib/libstdc++.so.6 ] || [ -e /lib/libstdc++.so.6 ] || libs=missing
  elif [ "$cpu" = x64 ] && ! grep -q avx2 /proc/cpuinfo 2>/dev/null; then
    target="$target-baseline"
  fi
fi

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "Install curl or wget first." "Сначала установите curl или wget."
  fi
}
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
asset="ctxray-$target.tar.gz"
fetch "$url/$asset" "$tmp/$asset" || fail "Couldn't download $url/$asset" "Не удалось скачать $url/$asset"
fetch "$url/SHA256SUMS" "$tmp/SHA256SUMS" || fail "Couldn't download $url/SHA256SUMS" "Не удалось скачать $url/SHA256SUMS"
expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)"
if [ -z "$expected" ] || [ "$expected" != "$(sha256 "$tmp/$asset")" ]; then
  fail "$asset doesn't match its checksum in SHA256SUMS." "$asset не совпадает с контрольной суммой из SHA256SUMS."
fi

tar -xzf "$tmp/$asset" -C "$tmp" ctxray
mkdir -p "$dir"
mv "$tmp/ctxray" "$dir/ctxray"
chmod +x "$dir/ctxray"
if [ -n "$libs" ]; then
  say "Installed ctxray into $dir. It needs libstdc++ and libgcc to run: apk add libstdc++ libgcc" \
    "ctxray установлен в $dir. Для запуска ему нужны libstdc++ и libgcc: apk add libstdc++ libgcc"
else
  version="$("$dir/ctxray" --version)"
  say "Installed $version into $dir" "$version установлен в $dir"
fi
case ":$PATH:" in
  *":$dir:"*) ;;
  *) say "Add $dir to PATH to run ctxray by name." "Добавьте $dir в PATH, чтобы запускать ctxray по имени." ;;
esac
