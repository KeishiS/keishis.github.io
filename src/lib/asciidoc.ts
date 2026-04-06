import Asciidoctor from "asciidoctor";
import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import type { Loader, LoaderContext } from "astro/loaders";
import {
    getOptionalPrivatePageSalt,
    getPrivatePageHash,
    PRIVATE_PAGE_SALT_ENV,
} from "./privatePages";

const asciidoctor = Asciidoctor();

type ArticlePath = {
    articleDir: string;
    id: string;
    lang: string;
    pageId: string;
    relativePath: string;
    slug: string;
};

function isArticleEntrypoint(filePath: string): boolean {
    return path.basename(filePath) === "index.adoc";
}

function resolveArticlePath(absoluteBase: string, filePath: string): ArticlePath {
    const relativePath = path.relative(absoluteBase, filePath);
    const parts = relativePath.split(path.sep);

    if (!isArticleEntrypoint(filePath) || parts.length < 3) {
        throw new Error(`Expected article entrypoint at {lang}/{slug}/index.adoc: ${relativePath}`);
    }

    const lang = parts[0];
    const slug = parts.slice(1, -1).join("/");

    if (!slug) {
        throw new Error(`Missing slug directory for ${relativePath}`);
    }

    return {
        articleDir: path.dirname(filePath),
        id: `${lang}/${slug}`,
        lang,
        pageId: slug,
        relativePath,
        slug,
    };
}

type LoaderVariant = "blog" | "private";

function createAsciidocLoader({
    base,
    variant,
}: {
    base: string;
    variant: LoaderVariant;
}): Loader {
    return {
        name: "asciidoc-loader",
        load: async ({ store, logger, watcher }: LoaderContext) => {
            logger.info(`Loading adoc files from ${base}`);
            store.clear();

            // ベースディレクトリの絶対パス（ウォッチャーのパスと比較するため）
            const absoluteBase = path.resolve(base);
            const salt = getOptionalPrivatePageSalt();

            // 単一ファイルの読み込み処理
            const loadEntry = async (filePath: string) => {
                try {
                    const content = await fs.readFile(filePath, "utf-8");
                    const article = resolveArticlePath(absoluteBase, filePath);

                    if (variant === "private" && article.slug.includes("/")) {
                        throw new Error(
                            `Private article entrypoint must be at {lang}/{pageId}/index.adoc: ${article.relativePath}`,
                        );
                    }

                    // Asciidoctor設定
                    const privateHash =
                        variant === "private"
                            ? salt
                                ? getPrivatePageHash(article.pageId, salt)
                                : null
                            : null;
                    const doc = asciidoctor.load(content, {
                        base_dir: article.articleDir,
                        safe: "server",
                        attributes: {
                            imagesdir:
                                variant === "private"
                                    ? `/${article.lang}/private/${privateHash}`
                                    : `/${article.lang}/blog/${article.slug}`,
                            showtitle: false,
                            stem: "latexmath",
                            "source-highlighter": "highlightjs",
                            sectnums: true,
                            sectanchors: true,
                            xrefstyle: "short",
                            "figure-caption": article.lang === "ja" ? "図" : "Figure",
                            "listing-caption": article.lang === "ja" ? "コード" : "Code",
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

                    // 必須属性チェック
                    const missingAttributes = [];
                    if (!description) missingAttributes.push("description");

                    if (variant === "private") {
                        if (!salt) missingAttributes.push(PRIVATE_PAGE_SALT_ENV);
                    }

                    const revdate =
                        variant === "blog" ? doc.getAttribute("revdate") : undefined;
                    const publishedAt =
                        variant === "blog"
                            ? doc.getAttribute("published_at")
                            : doc.getAttribute("published_at");
                    const author = doc.getAttribute("author");

                    if (variant === "blog") {
                        if (!revdate) missingAttributes.push("revdate");
                        if (!publishedAt) missingAttributes.push("published_at");
                        if (!author) missingAttributes.push("author");
                    }

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

                    store.set({
                        id: article.id,
                        data: {
                            title: String(title),
                            description: description,
                            lang: article.lang,
                            bodyHtml: render,
                            ...(variant === "blog"
                                ? {
                                      slug: article.slug,
                                      date: new Date(publishedAt!),
                                      publishedAt: new Date(publishedAt!),
                                      updatedAt: new Date(revdate!),
                                      author: author!,
                                      tags,
                                      restricted:
                                          doc.getAttribute("restricted") === "true",
                                  }
                                : {
                                      pageId: article.pageId,
                                      hash: privateHash!,
                                      author: author || undefined,
                                      publishedAt: publishedAt
                                          ? new Date(publishedAt)
                                          : undefined,
                                  }),
                        },
                    });

                    logger.info(`Loaded ${article.relativePath}`);
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    logger.error(`Failed to load ${filePath}: ${message}`);
                    throw e;
                }
            };

            // 初期読み込み
            const files = await fg("**/index.adoc", { cwd: base, absolute: true });

            if (variant === "private" && files.length > 0 && !salt) {
                throw new Error(
                    `${PRIVATE_PAGE_SALT_ENV} is required to build private pages from ${base}.`,
                );
            }

            await Promise.all(files.map(loadEntry));

            // ウォッチャー設定 (開発モード時)
            if (watcher) {
                watcher.on("change", async (filePath) => {
                    if (filePath.startsWith(absoluteBase) && isArticleEntrypoint(filePath)) {
                        logger.info(`Reloading ${filePath}`);
                        await loadEntry(filePath);
                    }
                });
                watcher.on("add", async (filePath) => {
                    if (filePath.startsWith(absoluteBase) && isArticleEntrypoint(filePath)) {
                        logger.info(`Adding ${filePath}`);
                        await loadEntry(filePath);
                    }
                });
                watcher.on("unlink", async (filePath) => {
                    if (filePath.startsWith(absoluteBase) && isArticleEntrypoint(filePath)) {
                        const article = resolveArticlePath(absoluteBase, filePath);
                        logger.info(`Deleting ${article.relativePath}`);
                        store.delete(article.id);
                    }
                });
            }
        },
    };
}

export function asciidocLoader({ base }: { base: string }): Loader {
    return createAsciidocLoader({ base, variant: "blog" });
}

export function privateAsciidocLoader({ base }: { base: string }): Loader {
    return createAsciidocLoader({ base, variant: "private" });
}
