import fg from "fast-glob";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader, LoaderContext } from "astro/loaders";
import {
    initSync,
    process as processWithAdocWeave,
} from "../../vendor/adocweave/wasm/adocweave_wasm.js";
import type {
    AdocWeaveWasmResponse,
    Diagnostic,
    ProductSet,
    ResolvedResource,
    ResourceQuery,
    WasmRequest,
} from "../../vendor/adocweave/worker/protocol.generated.d.mts";
import {
    getOptionalPrivatePageSalt,
    getPrivatePageHash,
    PRIVATE_PAGE_SALT_ENV,
} from "./privatePages";

// ---------------------------------------------------------------------------
// AdocWeave (WebAssembly) の初期化
// ---------------------------------------------------------------------------

const vendorDir = fileURLToPath(new URL("../../vendor/adocweave/", import.meta.url));
const release = JSON.parse(readFileSync(path.join(vendorDir, "release.json"), "utf-8")) as {
    version: string;
};

let initialized = false;

function ensureAdocWeave(): void {
    if (initialized) return;
    const wasmBytes = readFileSync(path.join(vendorDir, "wasm", "adocweave_wasm_bg.wasm"));
    initSync({ module: wasmBytes });
    initialized = true;
}

/** 記事側の `[.role]` のうち、HTMLへ `role-<name>` classとして出力を許可する名前 */
const ALLOWED_BLOCK_ROLES = [
    "definition",
    "theorem",
    "lemma",
    "proposition",
    "corollary",
    "proof",
    "lead",
];

const NO_PRODUCTS: ProductSet = {
    syntax: false,
    canonicalAst: false,
    html: false,
    attributeOccurrences: false,
    attributeQueries: false,
    resourceQueries: false,
    diagnostics: false,
    symbols: false,
    projection: false,
};

function runAdocWeave(
    request: Omit<WasmRequest, "packageVersion" | "version" | "generation">,
    generation: number,
): AdocWeaveWasmResponse {
    ensureAdocWeave();
    const full: WasmRequest = {
        packageVersion: release.version,
        version: 1,
        generation,
        ...request,
    };
    return processWithAdocWeave(full) as AdocWeaveWasmResponse;
}

// ---------------------------------------------------------------------------
// 補助関数
// ---------------------------------------------------------------------------

const MEDIA_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

function guessMediaType(target: string, purpose: ResourceQuery["purpose"]): string {
    const ext = path.posix.extname(new URL(target, "file:///").pathname).toLowerCase();
    const known = MEDIA_TYPES[ext];
    if (known) return known;
    if (purpose === "audio") return "audio/mpeg";
    if (purpose === "video") return "video/mp4";
    return "image/png";
}

function isAbsoluteUrl(target: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/** UTF-8 byte offset から 1 始まりの行番号を求める */
function lineOf(sourceBytes: Buffer, offset: number): number {
    let line = 1;
    const end = Math.min(offset, sourceBytes.length);
    for (let i = 0; i < end; i += 1) {
        if (sourceBytes[i] === 0x0a) line += 1;
    }
    return line;
}

/**
 * AdocWeave の HTML をこのサイトの構造へ合わせる。
 * - 文書タイトル（h1.document-title）はページ側で描画するため取り除く。
 * - セクション見出しは `==` が h1 になるため、ページの h1 と衝突しないよう一段下げる。
 * AdocWeave の出力は固定の要素だけで構成され、テキストはエスケープ済みのため、
 * タグ名に対する置換で十分に安全である。
 */
function adaptHtml(html: string): string {
    const withoutTitle = html.replace(/^<h1 class="document-title"[^>]*>.*?<\/h1>\n?/, "");
    return withoutTitle.replace(
        /<(\/?)h([1-5])\b/g,
        (_match, slash: string, level: string) => `<${slash}h${Number(level) + 1}`,
    );
}

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

type ConvertedArticle = {
    title: string;
    attributes: Map<string, string>;
    html: string;
};

/**
 * AsciiDoc を AdocWeave で解析し、画像などのリソースを解決したうえで HTML へ変換する。
 * 1回目の解析で文書属性とリソース参照を取り出し、2回目で解決結果を渡して HTML を生成する。
 */
async function convertArticle({
    content,
    article,
    imagesDir,
    logger,
}: {
    content: string;
    article: ArticlePath;
    imagesDir: string;
    logger: LoaderContext["logger"];
}): Promise<ConvertedArticle> {
    const isJa = article.lang === "ja";
    const analysisOptions: WasmRequest["analysisOptions"] = {
        attributes: {
            "figure-caption": isJa ? "図" : "Figure",
            "table-caption": isJa ? "表" : "Table",
            "example-caption": isJa ? "例" : "Example",
            "listing-caption": isJa ? "コード" : "Code",
        },
        diagnostics: {
            // 本文の折り返し幅は記事の書き方に委ねる
            rules: { "line-too-long": { enabled: false } },
        },
    };

    const first = runAdocWeave(
        {
            sourceId: article.relativePath,
            source: content,
            analysisOptions,
            products: {
                ...NO_PRODUCTS,
                attributeOccurrences: true,
                resourceQueries: true,
                diagnostics: true,
                projection: true,
            },
        },
        1,
    );

    const sourceBytes = Buffer.from(content, "utf-8");
    reportDiagnostics(first.diagnostics, sourceBytes, article, logger);

    const attributes = new Map<string, string>();
    for (const occurrence of first.attributeOccurrences) {
        if (occurrence.operation === "set") {
            attributes.set(occurrence.name, occurrence.value.foldedText);
        } else if (occurrence.operation === "unset") {
            attributes.delete(occurrence.name);
        }
    }

    const title = first.projection?.title?.text;
    if (!title) {
        throw new Error(`Missing document title in ${article.relativePath}`);
    }

    const resources = await resolveResources(first.resourceQueries, article, imagesDir, logger);

    const second = runAdocWeave(
        {
            sourceId: article.relativePath,
            source: content,
            analysisOptions,
            products: { ...NO_PRODUCTS, html: true },
            renderInputs: { resources },
            renderPolicy: {
                roles: { allowed: ALLOWED_BLOCK_ROLES },
                activeUrls: {
                    allowedSchemes: ["http", "https", "mailto"],
                    allowResolvedRootRelative: true,
                },
            },
        },
        2,
    );
    reportDiagnostics(second.renderDiagnostics, sourceBytes, article, logger);

    return { title, attributes, html: adaptHtml(second.html) };
}

async function resolveResources(
    queries: ResourceQuery[],
    article: ArticlePath,
    imagesDir: string,
    logger: LoaderContext["logger"],
): Promise<ResolvedResource[]> {
    const resolved: ResolvedResource[] = [];
    for (const query of queries) {
        const range = { sourceStart: query.range.start, sourceEnd: query.range.end };
        const target = query.target;

        if (isAbsoluteUrl(target)) {
            resolved.push({
                ...range,
                outcome: {
                    status: "resolved",
                    href: target,
                    mediaType: guessMediaType(target, query.purpose),
                },
            });
            continue;
        }

        const normalized = path.posix.normalize(target);
        const localPath = path.resolve(article.articleDir, normalized);
        const inside =
            localPath === article.articleDir ||
            localPath.startsWith(article.articleDir + path.sep);
        const exists = inside && (await fs.stat(localPath).then((s) => s.isFile(), () => false));

        if (!exists) {
            logger.warn(`${article.relativePath}: resource not found: ${target}`);
            resolved.push({ ...range, outcome: { status: "failed", kind: "missing" } });
            continue;
        }

        resolved.push({
            ...range,
            outcome: {
                status: "resolved",
                href: `${imagesDir}/${normalized}`,
                mediaType: guessMediaType(normalized, query.purpose),
            },
        });
    }
    return resolved;
}

function reportDiagnostics(
    diagnostics: Diagnostic[],
    sourceBytes: Buffer,
    article: ArticlePath,
    logger: LoaderContext["logger"],
): void {
    const errors: string[] = [];
    for (const diagnostic of diagnostics) {
        const line = lineOf(sourceBytes, diagnostic.range.start);
        const message = `${article.relativePath}:${line}: [${diagnostic.code}] ${diagnostic.message}`;
        if (diagnostic.severity === "error") {
            errors.push(message);
            logger.error(message);
        } else if (diagnostic.severity === "warning") {
            logger.warn(message);
        } else {
            logger.debug(message);
        }
    }
    if (errors.length > 0) {
        throw new Error(`AdocWeave reported ${errors.length} error(s) in ${article.relativePath}`);
    }
}

// ---------------------------------------------------------------------------
// Astro content loader
// ---------------------------------------------------------------------------

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
            logger.info(`Loading adoc files from ${base} (AdocWeave ${release.version})`);
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

                    const privateHash =
                        variant === "private"
                            ? salt
                                ? getPrivatePageHash(article.pageId, salt)
                                : null
                            : null;
                    const imagesDir =
                        variant === "private"
                            ? `/${article.lang}/private/${privateHash}`
                            : `/${article.lang}/blog/${article.slug}`;

                    const { title, attributes, html } = await convertArticle({
                        content,
                        article,
                        imagesDir,
                        logger,
                    });

                    const description = attributes.get("description");

                    // 必須属性チェック
                    const missingAttributes = [];
                    if (!description) missingAttributes.push("description");

                    if (variant === "private") {
                        if (!salt) missingAttributes.push(PRIVATE_PAGE_SALT_ENV);
                    }

                    const revdate = variant === "blog" ? attributes.get("revdate") : undefined;
                    const publishedAt = attributes.get("published_at");
                    const author = attributes.get("author");

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

                    const tags = attributes.get("tags")
                        ? attributes
                              .get("tags")!
                              .split(",")
                              .map((t: string) => t.trim())
                              .filter((t: string) => t.length > 0)
                        : [];

                    store.set({
                        id: article.id,
                        data: {
                            title,
                            description,
                            lang: article.lang,
                            bodyHtml: html,
                            ...(variant === "blog"
                                ? {
                                      slug: article.slug,
                                      date: new Date(publishedAt!),
                                      publishedAt: new Date(publishedAt!),
                                      updatedAt: new Date(revdate!),
                                      author: author!,
                                      tags,
                                      restricted: attributes.get("restricted") === "true",
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
