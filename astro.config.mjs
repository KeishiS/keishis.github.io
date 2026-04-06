// @ts-check
import { defineConfig } from "astro/config";
import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { loadLocalEnv } from "./src/lib/loadLocalEnv.js";

const projectRoot = process.cwd();
const blogSourceRoot = path.join(projectRoot, "src/data/blog");
const privateSourceRoot = path.join(projectRoot, "src/data/private");
const execFileAsync = promisify(execFile);
loadLocalEnv();
/** @typedef {"ja" | "en"} BlogLocale */

/** @param {string} filePath */
function isArticleEntrypoint(filePath) {
    return path.basename(filePath) === "index.adoc";
}

/**
 * @param {string} filePath
 */
function isTypstSourceFile(filePath) {
    return path.extname(filePath) === ".typ";
}

/**
 * @param {string} root
 * @param {string} candidate
 */
function isPathInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** @param {string} requestPath */
function parseBlogAssetRequest(requestPath) {
    const match = requestPath.match(/^\/(ja|en)\/blog\/(.+)$/);

    if (!match || !path.extname(requestPath)) {
        return null;
    }

    const [, lang, relativeAssetPath] = match;
    const normalizedAssetPath = path.posix.normalize(relativeAssetPath);

    if (normalizedAssetPath.startsWith("../") || normalizedAssetPath === "..") {
        return null;
    }

    return {
        lang: /** @type {BlogLocale} */ (lang),
        relativeAssetPath: normalizedAssetPath,
    };
}

/** @param {string} pageId */
function getPrivatePageHash(pageId) {
    const salt = process.env.PRIVATE_PAGE_SALT;

    if (!salt) {
        throw new Error("PRIVATE_PAGE_SALT is required to build private pages.");
    }

    return createHash("sha256")
        .update(`${pageId}${salt}`)
        .digest("hex")
        .slice(0, 20);
}

/** @param {BlogLocale} lang */
function getLanguageRoot(lang) {
    return path.join(blogSourceRoot, lang);
}

/**
 * @param {"blog" | "private"} scope
 * @param {BlogLocale} lang
 */
function getScopedLanguageRoot(scope, lang) {
    return path.join(scope === "blog" ? blogSourceRoot : privateSourceRoot, lang);
}

/**
 * @param {BlogLocale} lang
 * @param {string} relativeAssetPath
 */
function buildAssetCandidate(lang, relativeAssetPath) {
    const languageRoot = getLanguageRoot(lang);
    const candidatePath = path.join(languageRoot, relativeAssetPath);

    if (!isPathInside(languageRoot, candidatePath)) {
        return null;
    }

    return candidatePath;
}

/**
 * @param {BlogLocale} lang
 * @param {string} relativeAssetPath
 */
function resolveAssetCandidates(lang, relativeAssetPath) {
    /** @type {BlogLocale[]} */
    const languageOrder = lang === "en" ? ["en", "ja"] : [lang];

    return /** @type {string[]} */ (languageOrder
        .map((candidateLang) => buildAssetCandidate(candidateLang, relativeAssetPath))
        .filter((candidatePath) => candidatePath !== null));
}

/**
 * @param {BlogLocale} lang
 * @param {string} routeHash
 * @param {string} relativeAssetPath
 */
function buildPrivateAssetCandidate(lang, routeHash, relativeAssetPath) {
    const languageRoot = getScopedLanguageRoot("private", lang);
    const candidatePath = path.join(languageRoot, routeHash, relativeAssetPath);

    if (!isPathInside(languageRoot, candidatePath)) {
        return null;
    }

    return candidatePath;
}

/**
 * @param {BlogLocale} lang
 * @param {string} routeHash
 * @param {string} relativeAssetPath
 */
async function resolvePrivateAssetCandidates(lang, routeHash, relativeAssetPath) {
    const languageRoot = getScopedLanguageRoot("private", lang);
    const entrypoints = await fg("*/index.adoc", { cwd: languageRoot });

    return entrypoints
        .map((entrypoint) => entrypoint.split("/")[0])
        .filter((pageId) => getPrivatePageHash(pageId) === routeHash)
        .map((pageId) => buildPrivateAssetCandidate(lang, pageId, relativeAssetPath))
        .filter((candidatePath) => candidatePath !== null);
}

/**
 * @param {string} articleDir
 * @param {string} targetDir
 */
async function copyArticleAssets(articleDir, targetDir) {
    const entries = await fs.readdir(articleDir, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = path.join(articleDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            await copyArticleAssets(sourcePath, targetPath);
            continue;
        }

        if (
            !entry.isFile() ||
            isArticleEntrypoint(sourcePath) ||
            isTypstSourceFile(sourcePath)
        ) {
            continue;
        }

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
    }
}

async function collectArticles() {
    const entrypoints = await fg("**/index.adoc", { cwd: blogSourceRoot });

    return entrypoints.map((entrypoint) => {
        const parts = entrypoint.split("/");
        const lang = /** @type {BlogLocale} */ (parts[0]);
        const slug = parts.slice(1, -1).join("/");
        const articleDir = path.join(blogSourceRoot, lang, slug);

        return {
            articleDir,
            lang,
            slug,
        };
    });
}

async function collectPrivateArticles() {
    const files = await fg("*/*/index.adoc", { cwd: privateSourceRoot });

    if (files.length > 0 && !process.env.PRIVATE_PAGE_SALT) {
        throw new Error("PRIVATE_PAGE_SALT is required to build private pages.");
    }

    return files.map((entrypoint) => {
        const parts = entrypoint.split("/");
        const lang = /** @type {BlogLocale} */ (parts[0]);
        const pageId = parts[1];

        return {
            articleDir: path.join(privateSourceRoot, lang, pageId),
            lang,
            slug: getPrivatePageHash(pageId),
        };
    });
}

async function collectPrivatePageUrls() {
    const privateArticles = await collectPrivateArticles();

    return privateArticles
        .map((article) => ({
            lang: article.lang,
            pageId: path.basename(article.articleDir),
            url: `/${article.lang}/private/${article.slug}/`,
        }))
        .sort((a, b) =>
            a.pageId === b.pageId
                ? a.lang.localeCompare(b.lang)
                : a.pageId.localeCompare(b.pageId),
        );
}

/**
 * @param {string} filePath
 */
function isTypstFile(filePath) {
    return isTypstSourceFile(filePath);
}

/**
 * @param {string} root
 * @param {string} filePath
 */
function isFileInside(root, filePath) {
    return filePath === root || isPathInside(root, filePath);
}

/**
 * @param {string} typPath
 */
function getTypstPdfPath(typPath) {
    return typPath.slice(0, -path.extname(typPath).length) + ".pdf";
}

/**
 * @param {string} typPath
 */
async function compileTypstFile(typPath) {
    const pdfPath = getTypstPdfPath(typPath);

    await execFileAsync("typst", ["compile", typPath, pdfPath], {
        cwd: projectRoot,
    });

    return pdfPath;
}

async function compileAllTypstFiles() {
    const typFiles = await fg(["src/data/blog/**/*.typ", "src/data/private/**/*.typ"], {
        cwd: projectRoot,
        absolute: true,
    });

    await Promise.all(typFiles.map((typFile) => compileTypstFile(typFile)));

    return typFiles.length;
}

/**
 * @param {string} filePath
 */
async function removeCompiledTypstPdf(filePath) {
    const pdfPath = getTypstPdfPath(filePath);
    await fs.rm(pdfPath, { force: true });
}

function createTypstCompilePlugin() {
    /** @type {Promise<void> | null} */
    let pendingInitialCompile = null;

    async function ensureInitialCompile() {
        if (!pendingInitialCompile) {
            pendingInitialCompile = compileAllTypstFiles().then(
                (count) => {
                    if (count > 0) {
                        console.log(`Compiled ${count} Typst file${count === 1 ? "" : "s"}.`);
                    }
                },
                (error) => {
                    pendingInitialCompile = null;
                    throw error;
                },
            );
        }

        await pendingInitialCompile;
    }

    /**
     * @param {string} filePath
     */
    function shouldHandleTypst(filePath) {
        return (
            isTypstFile(filePath) &&
            (isFileInside(blogSourceRoot, filePath) || isFileInside(privateSourceRoot, filePath))
        );
    }

    return {
        name: "typst-compile",
        async buildStart() {
            await ensureInitialCompile();
        },
        /** @param {any} server */
        configureServer(server) {
            const runInitialCompile = async () => {
                try {
                    await ensureInitialCompile();
                } catch (error) {
                    server.config.logger.error(
                        `Failed to compile Typst files: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            };

            void runInitialCompile();

            server.watcher.on("add", async (filePath) => {
                if (!shouldHandleTypst(filePath)) {
                    return;
                }

                try {
                    await compileTypstFile(filePath);
                    server.config.logger.info(`Compiled ${path.relative(projectRoot, filePath)}`);
                    server.ws.send({ type: "full-reload" });
                } catch (error) {
                    server.config.logger.error(
                        `Failed to compile ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            });

            server.watcher.on("change", async (filePath) => {
                if (!shouldHandleTypst(filePath)) {
                    return;
                }

                try {
                    await compileTypstFile(filePath);
                    server.config.logger.info(`Compiled ${path.relative(projectRoot, filePath)}`);
                    server.ws.send({ type: "full-reload" });
                } catch (error) {
                    server.config.logger.error(
                        `Failed to compile ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            });

            server.watcher.on("unlink", async (filePath) => {
                if (!shouldHandleTypst(filePath)) {
                    return;
                }

                try {
                    await removeCompiledTypstPdf(filePath);
                    server.config.logger.info(
                        `Removed ${path.relative(projectRoot, getTypstPdfPath(filePath))}`,
                    );
                    server.ws.send({ type: "full-reload" });
                } catch (error) {
                    server.config.logger.error(
                        `Failed to remove compiled PDF for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            });
        },
    };
}

function createBlogAssetPlugin() {
    /** @type {string} */
    let outDir = path.join(projectRoot, "dist");
    let privateUrlsLogged = false;

    return {
        name: "blog-static-assets",
        /** @param {any} server */
        configureServer(server) {
            server.httpServer?.once("listening", async () => {
                if (privateUrlsLogged) {
                    return;
                }

                privateUrlsLogged = true;

                const privatePageUrls = await collectPrivatePageUrls();

                if (privatePageUrls.length === 0) {
                    return;
                }

                console.log("\nPrivate page URLs:");
                for (const entry of privatePageUrls) {
                    console.log(`- ${entry.pageId} [${entry.lang}]: ${entry.url}`);
                }
            });

            server.middlewares.use(
                /**
                 * @param {any} req
                 * @param {any} res
                 * @param {any} next
                 */
                async (req, res, next) => {
                    const requestUrl = req.url ? new URL(req.url, "http://localhost") : null;
                    const pathname = requestUrl?.pathname ?? "";
                    const parsed = parseBlogAssetRequest(pathname);

                    if (parsed) {
                        for (const candidatePath of resolveAssetCandidates(
                            parsed.lang,
                            parsed.relativeAssetPath,
                        )) {
                            try {
                                const stat = await fs.stat(candidatePath);
                                if (!stat.isFile()) {
                                    continue;
                                }

                                const buffer = await fs.readFile(candidatePath);
                                res.setHeader("Content-Length", String(buffer.length));
                                res.end(buffer);
                                return;
                            } catch {
                                continue;
                            }
                        }
                    }

                    const privateMatch = pathname.match(
                        /^\/(ja|en)\/private\/([^/]+)\/(.+)$/,
                    );

                    if (!privateMatch) {
                        next();
                        return;
                    }

                    const [, lang, routeHash, relativeAssetPath] = privateMatch;

                    for (const candidatePath of await resolvePrivateAssetCandidates(
                        /** @type {BlogLocale} */ (lang),
                        routeHash,
                        path.posix.normalize(relativeAssetPath),
                    )) {
                        try {
                            const stat = await fs.stat(candidatePath);
                            if (!stat.isFile()) {
                                continue;
                            }

                            const buffer = await fs.readFile(candidatePath);
                            res.setHeader("Content-Length", String(buffer.length));
                            res.end(buffer);
                            return;
                        } catch {
                            continue;
                        }
                    }

                    next();
                },
            );
        },
        /** @param {any} config */
        configResolved(config) {
            outDir = config.build.outDir;
        },
        async closeBundle() {
            const articles = await collectArticles();
            const privateArticles = await collectPrivateArticles();

            for (const article of articles) {
                const targetDir = path.join(outDir, article.lang, "blog", article.slug);

                if (article.lang === "en") {
                    const fallbackDir = path.join(blogSourceRoot, "ja", article.slug);
                    try {
                        const fallbackStat = await fs.stat(fallbackDir);
                        if (fallbackStat.isDirectory()) {
                            await copyArticleAssets(fallbackDir, targetDir);
                        }
                    } catch {
                        // no-op
                    }
                }

                await copyArticleAssets(article.articleDir, targetDir);
            }

            for (const article of privateArticles) {
                const targetDir = path.join(
                    outDir,
                    article.lang,
                    "private",
                    article.slug,
                );

                await copyArticleAssets(article.articleDir, targetDir);
            }
        },
    };
}

// https://astro.build/config
export default defineConfig({
    site: "https://www.keishis.me",
    integrations: [
        react(),
        sitemap({
            filter: (page) => !page.includes("/private/"),
        }),
    ],
    i18n: {
        defaultLocale: "ja",
        locales: ["ja", "en"],
        routing: {
            prefixDefaultLocale: false,
        },
    },
    vite: {
        plugins: [tailwindcss(), createTypstCompilePlugin(), createBlogAssetPlugin()],
    },
});
