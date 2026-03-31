// @ts-check
import { defineConfig } from "astro/config";
import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

const projectRoot = process.cwd();
const blogSourceRoot = path.join(projectRoot, "src/data/blog");
/** @typedef {"ja" | "en"} BlogLocale */

/** @param {string} filePath */
function isArticleEntrypoint(filePath) {
    return path.basename(filePath) === "index.adoc";
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

/** @param {BlogLocale} lang */
function getLanguageRoot(lang) {
    return path.join(blogSourceRoot, lang);
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

        if (!entry.isFile() || isArticleEntrypoint(sourcePath)) {
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

function createBlogAssetPlugin() {
    /** @type {string} */
    let outDir = path.join(projectRoot, "dist");

    return {
        name: "blog-static-assets",
        /** @param {any} server */
        configureServer(server) {
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

                    if (!parsed) {
                        next();
                        return;
                    }

                    for (const candidatePath of resolveAssetCandidates(parsed.lang, parsed.relativeAssetPath)) {
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
        },
    };
}

// https://astro.build/config
export default defineConfig({
    site: "https://www.keishis.me",
    integrations: [react(), sitemap()],
    i18n: {
        defaultLocale: "ja",
        locales: ["ja", "en"],
        routing: {
            prefixDefaultLocale: false,
        },
    },
    vite: {
        plugins: [tailwindcss(), createBlogAssetPlugin()],
    },
});
