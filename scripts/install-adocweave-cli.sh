#!/usr/bin/env bash
# AdocWeave の CLI を GitHub Releases から取得して <dest-dir> へ配置します（主に CI 用）。
# 版は flake.lock に固定された adocweave の ref に従います。
# 使い方: scripts/install-adocweave-cli.sh <dest-dir>
#   環境変数 ADOCWEAVE_TARGET で target を変えられます（既定: x86_64-unknown-linux-musl）。
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "使い方: $0 <dest-dir>" >&2
    exit 1
fi

dest="$1"
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="KeishiS/adocweave"
ref="$(jq -r '.nodes.adocweave.original.ref' "${root}/flake.lock")"
if [ -z "${ref}" ] || [ "${ref}" = "null" ]; then
    echo "flake.lock から adocweave の ref を読めません。" >&2
    exit 1
fi

target="${ADOCWEAVE_TARGET:-x86_64-unknown-linux-musl}"
asset="adocweave-cli-${target}.zip"
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

gh release download "${ref}" --repo "${repo}" \
    --pattern "${asset}" --pattern sha256.sum --dir "${work}"
(cd "${work}" && sha256sum --check --ignore-missing sha256.sum)
gh attestation verify "${work}/${asset}" --repo "${repo}"

mkdir -p "${dest}"
unzip -o -q "${work}/${asset}" adocweave -d "${dest}"
chmod +x "${dest}/adocweave"
"${dest}/adocweave" --version --json
