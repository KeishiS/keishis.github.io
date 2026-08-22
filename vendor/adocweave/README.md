# AdocWeave（WebAssembly配布物）

このディレクトリには、AsciiDoc記事をHTMLへ変換するために使う
[AdocWeave](https://github.com/KeishiS/adocweave) のWebAssembly配布物を置いています。
AdocWeaveはnpmへ公開されないため、GitHub Releasesの `adocweave-browser-<version>.tar.xz` から
必要なファイルだけを取り出して、このリポジトリに同梱しています。

## 内容

- `wasm/adocweave_wasm.js`、`wasm/adocweave_wasm_bg.wasm`、`wasm/adocweave_wasm.d.ts`: wasm-bindgenの生成物。
  `src/lib/asciidoc.ts` がNode.js上で読み込みます。
- `worker/protocol.generated.d.mts`: WASM APIの要求と応答の型定義。型の参照にだけ使います。
- `release.json`: 同梱したバージョン、archive名、`sha256.sum` に記載されたハッシュ値。
- `LICENSE-*`、`THIRD_PARTY_NOTICES.adoc`: 配布物に含まれるライセンス表記。

## 更新手順

版を書く場所は `flake.nix` の input（`github:KeishiS/adocweave?ref=vX.Y.Z`）だけです。
`flake.lock`、このディレクトリのファイル、`release.json` はそこから生成します。

```console
scripts/update-adocweave.sh 0.44.1   # flake.nix の ref を書き換え、flake.lock と vendor を更新
scripts/update-adocweave.sh          # flake.lock の版に vendor を揃え直す
```

スクリプトは `gh release download` でarchiveと `sha256.sum` を取得し、ハッシュを検証してから
上記のファイルを置き換え、`release.json` を書き換えます。CI で使う CLI（`scripts/install-adocweave-cli.sh`）も
`flake.lock` の版を使い、`release.json` と一致しない場合は失敗します。更新後は `pnpm build` で記事の変換結果を確認してください。
AdocWeaveは 0.y.z の間、minor版で互換性のない変更を行うことがあるため、Release Notesの
「公開仕様と破壊的変更」を先に確認します。
