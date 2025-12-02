import Asciidoctor from "asciidoctor";
import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import type { Loader, LoaderContext } from "astro/loaders";

const asciidoctor = Asciidoctor();

export function asciidocLoader({ base }: { base: string }): Loader {
    return {
        name: "asciidoc-loader",
        load: async ({ store, logger }: LoaderContext) => {
            logger.info(`Loading adoc files from ${base}`);

            const files = await fg("**/*.adoc", { cwd: base, absolute: true });

            await Promise.all(
                files.map(async (filePath) => {
                    try {
                        const content = await fs.readFile(filePath, "utf-8");

                        // 言語判定
                        const relativePath = path.relative(base, filePath);
                        const lang = relativePath.split(path.sep)[0];

                        // Asciidoctor設定
                        const doc = asciidoctor.load(content, {
                            safe: "server",
                            attributes: {
                                showtitle: true,
                                stem: "latexmath", // MathJaxを有効化 (LaTeXモード)
                                "source-highlighter": "highlightjs", // ソースコードハイライトを有効化
                                sectnums: true, // セクション番号を有効化
                                sectanchors: true, // セクションアンカーを有効化
                                xrefstyle: "short",
                                "figure-caption": lang === "ja" ? "図" : "Figure",
                                "listing-caption": lang === "ja" ? "コード" : "Code",
                            },
                        });

                        // メタデータ抽出
                        const titleObj = doc.getDocumentTitle({
                            partition: true,
                        }) as any;
                        const title = titleObj.hasSubtitle()
                            ? `${titleObj.getMain()}: ${titleObj.getSubtitle()}`
                            : titleObj.getMain();

                        const description = doc.getAttribute("description");
                        const revdate = doc.getAttribute("revdate");
                        const publishedAt = doc.getAttribute("published_at");
                        const author = doc.getAttribute("author");

                        // 必須属性チェック
                        const missingAttributes = [];
                        if (!description) missingAttributes.push("description");
                        if (!revdate) missingAttributes.push("revdate");
                        if (!publishedAt)
                            missingAttributes.push("published_at");
                        if (!author) missingAttributes.push("author");

                        if (missingAttributes.length > 0) {
                            throw new Error(
                                `Missing required attributes in ${filePath}: ${missingAttributes.join(", ")}`,
                            );
                        }

                        const tags = doc.getAttribute("tags")
                            ? doc
                                  .getAttribute("tags")
                                  .split(",")
                                  .map((t: string) => t.trim())
                            : [];

                        // HTML変換
                        const render = doc.convert();

                        // IDと各種パス情報の生成
                        const parts = relativePath.split(path.sep);
                        const slugBase = parts
                            .slice(1)
                            .join("/")
                            .replace(/\.adoc$/, "");
                        const id = relativePath; // ストア上のID

                        // ★修正点: return せず、store.set を使用する
                        store.set({
                            id,
                            data: {
                                slug: slugBase, // URL用スラッグをデータの一部として持たせる
                                title: String(title),
                                date: new Date(publishedAt), // 初版投稿日（RSS pubDate用）
                                publishedAt: new Date(publishedAt), // 初版
                                updatedAt: new Date(revdate), // 最終更新
                                author: author,
                                description: description,
                                tags,
                                lang,
                                restricted:
                                    doc.getAttribute("restricted") === "true", // 閲覧制限フラグ (文字列比較)
                                bodyHtml: render, // レンダリング済みHTMLもデータとして保存
                            },
                        });
                    } catch (e) {
                        logger.error(
                            `Failed to load ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
                        );
                    }
                }),
            );
        },
    };
}
