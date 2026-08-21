#!/usr/bin/env bash
# AdocWeave の WebAssembly 配布物を GitHub Releases から取得し、vendor/adocweave を更新します。
# 使い方: scripts/update-adocweave.sh <version>   例: scripts/update-adocweave.sh 0.42.0
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "使い方: $0 <version>" >&2
    exit 1
fi

version="$1"
repo="KeishiS/adocweave"
archive="adocweave-browser-${version}.tar.xz"
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="${root}/vendor/adocweave"
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

gh release download "v${version}" --repo "${repo}" \
    --pattern "${archive}" --pattern sha256.sum --dir "${work}"
(cd "${work}" && sha256sum --check --ignore-missing sha256.sum)
tar -xJf "${work}/${archive}" -C "${work}"

src="${work}/adocweave-browser-${version}"
mkdir -p "${dest}/wasm" "${dest}/worker"
cp "${src}/wasm/adocweave_wasm.js" "${src}/wasm/adocweave_wasm_bg.wasm" "${src}/wasm/adocweave_wasm.d.ts" "${dest}/wasm/"
cp "${src}/worker/protocol.generated.d.mts" "${dest}/worker/"
cp "${src}/LICENSE-APACHE" "${src}/LICENSE-MIT" "${src}/THIRD_PARTY_NOTICES.adoc" "${dest}/"

sha256="$(grep " ${archive}\$" "${work}/sha256.sum" | awk '{print $1}')"
cat > "${dest}/release.json" <<JSON
{
  "version": "${version}",
  "archive": "${archive}",
  "sha256": "${sha256}",
  "source": "https://github.com/${repo}/releases/tag/v${version}"
}
JSON

echo "AdocWeave ${version} を ${dest} へ配置しました。"
