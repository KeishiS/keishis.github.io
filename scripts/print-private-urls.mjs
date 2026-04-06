import fg from "fast-glob";
import path from "node:path";
import { createHash } from "node:crypto";

const siteUrl = process.env.SITE_URL ?? "https://www.keishis.me";
const salt = process.env.PRIVATE_PAGE_SALT;

if (!salt) {
    throw new Error("PRIVATE_PAGE_SALT is required to print private page URLs.");
}

const files = await fg("*/*/index.adoc", { cwd: "src/data/private" });

if (files.length === 0) {
    console.log("No private pages found.");
    process.exit(0);
}

const entries = files
    .map((filePath) => {
        const [lang, pageId] = filePath.split(path.posix.sep);
        const hash = createHash("sha256")
            .update(`${pageId}${salt}`)
            .digest("hex")
            .slice(0, 20);

        return {
            lang,
            pageId,
            url: new URL(`/${lang}/private/${hash}/`, siteUrl).href,
        };
    })
    .sort((a, b) =>
        a.pageId === b.pageId
            ? a.lang.localeCompare(b.lang)
            : a.pageId.localeCompare(b.pageId),
    );

console.log("Private page URLs:");
for (const entry of entries) {
    console.log(`- ${entry.pageId} [${entry.lang}]: ${entry.url}`);
}
