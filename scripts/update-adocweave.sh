#!/usr/bin/env bash
# AdocWeave の版を更新します。版の記述は flake.nix の input（ref=vX.Y.Z）だけに置き、
# flake.lock・vendor/adocweave（WebAssembly）・release.json はそこから生成します。
#
# 使い方:
#   scripts/update-adocweave.sh            flake.lock に固定された版で vendor/adocweave を作り直す
#   scripts/update-adocweave.sh 0.44.1     flake.nix の ref を書き換えて flake.lock を更新し、vendor も揃える
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="KeishiS/adocweave"
dest="${root}/vendor/adocweave"

if [ $# -gt 1 ]; then
    echo "使い方: $0 [version]" >&2
    exit 1
fi

if [ $# -eq 1 ]; then
    version="$1"
    sed -i -E "s|(github:${repo//\//\\/}\?ref=v)[0-9][0-9A-Za-z.+-]*|\1${version}|" "${root}/flake.nix"
    (cd "${root}" && nix flake update adocweave)
fi

version="$(jq -r '.nodes.adocweave.original.ref' "${root}/flake.lock" | sed 's/^v//')"
if [ -z "${version}" ] || [ "${version}" = "null" ]; then
    echo "flake.lock から adocweave の版を読めません" >&2
    exit 1
fi

archive="adocweave-browser-${version}.tar.xz"
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

echo "AdocWeave ${version} を ${dest} へ配置しました（flake.lock と同じ版）。"
