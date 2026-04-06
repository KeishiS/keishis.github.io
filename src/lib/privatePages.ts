import { createHash } from "node:crypto";
import { loadLocalEnv } from "./loadLocalEnv.js";

export const PRIVATE_PAGE_SALT_ENV = "PRIVATE_PAGE_SALT";
export const PRIVATE_HASH_LENGTH = 20;

export function getPrivatePageHash(pageId: string, salt: string): string {
    return createHash("sha256")
        .update(`${pageId}${salt}`)
        .digest("hex")
        .slice(0, PRIVATE_HASH_LENGTH);
}

export function getPrivatePagePath(lang: string, pageId: string, salt: string): string {
    return `/${lang}/private/${getPrivatePageHash(pageId, salt)}/`;
}

export function getRequiredPrivatePageSalt(): string {
    loadLocalEnv();
    const salt = process.env[PRIVATE_PAGE_SALT_ENV];

    if (!salt) {
        throw new Error(
            `${PRIVATE_PAGE_SALT_ENV} is required to build private pages.`,
        );
    }

    return salt;
}

export function getOptionalPrivatePageSalt(): string | undefined {
    loadLocalEnv();
    return process.env[PRIVATE_PAGE_SALT_ENV];
}
