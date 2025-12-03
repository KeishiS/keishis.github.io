import Asciidoctor from "asciidoctor";
import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import type { Loader, LoaderContext } from "astro/loaders";

const asciidoctor = Asciidoctor();

export function asciidocLoader({ base }: { base: string }): Loader {
    return {
        name: "asciidoc-loader",
        load: async ({ store, logger, watcher }: LoaderContext) => {
            logger.info(`Loading adoc files from ${base}`);

            // ベースディレクトリの絶対パス（ウォッチャーのパスと比較するため）
            const absoluteBase = path.resolve(base);

            // 単一ファイルの読み込み処理
            const loadEntry = async (filePath: string) => {
                try {
                    const content = await fs.readFile(filePath, "utf-8");

                    // filePath は絶対パス。store ID 用に base からの相対パスを計算
                    const relativePath = path.relative(absoluteBase, filePath);

                    // 言語判定 (ディレクトリ構造に基づく: src/data/blog/ja/...)
                    const lang = relativePath.split(path.sep)[0];

                    // Asciidoctor設定
                    const doc = asciidoctor.load(content, {
                        safe: "server",
                        attributes: {
                            showtitle: false,
                            stem: "latexmath",
                            "source-highlighter": "highlightjs",
                            sectnums: true,
                            sectanchors: true,
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
                    if (!publishedAt) missingAttributes.push("published_at");
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

                    // スラッグ生成
                    const parts = relativePath.split(path.sep);
                    const slugBase = parts
                        .slice(1)
                        .join("/")
                        .replace(/\.adoc$/, "");
                    
                    const id = relativePath; // ストア上のID

                    store.set({
                        id,
                        data: {
                            slug: slugBase,
                            title: String(title),
                            date: new Date(publishedAt),
                            publishedAt: new Date(publishedAt),
                            updatedAt: new Date(revdate),
                            author: author,
                            description: description,
                            tags,
                            lang,
                            restricted: doc.getAttribute("restricted") === "true",
                            bodyHtml: render,
                        },
                    });
                    
                    logger.info(`Loaded ${relativePath}`);
                } catch (e) {
                    logger.error(
                        `Failed to load ${filePath}: ${e instanceof Error ? e.message : String(e)}`
                    );
                }
            };

            // 初期読み込み
            const files = await fg("**/*.adoc", { cwd: base, absolute: true });
            await Promise.all(files.map(loadEntry));

            // ウォッチャー設定 (開発モード時)
            if (watcher) {
                watcher.on("change", async (filePath) => {
                    if (filePath.startsWith(absoluteBase) && filePath.endsWith(".adoc")) {
                        logger.info(`Reloading ${filePath}`);
                        await loadEntry(filePath);
                    }
                });
                watcher.on("add", async (filePath) => {
                    if (filePath.startsWith(absoluteBase) && filePath.endsWith(".adoc")) {
                        logger.info(`Adding ${filePath}`);
                        await loadEntry(filePath);
                    }
                });
                watcher.on("unlink", async (filePath) => {
                    if (filePath.startsWith(absoluteBase) && filePath.endsWith(".adoc")) {
                        const relativePath = path.relative(absoluteBase, filePath);
                        logger.info(`Deleting ${relativePath}`);
                        store.delete(relativePath);
                    }
                });
            }
        },
    };
}