import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let envLoaded = false;

function parseEnvLine(line) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
        return null;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
        return null;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }

    return { key, value };
}

function getEnvFileCandidates(mode) {
    const suffix = mode === "production" ? ".production" : "";

    return [`.env${suffix}.local`, `.env${suffix}`, ".env.local", ".env"];
}

export function loadLocalEnv(mode = process.env.NODE_ENV ?? "development") {
    if (envLoaded) {
        return;
    }

    for (const fileName of getEnvFileCandidates(mode)) {
        const filePath = path.resolve(process.cwd(), fileName);

        if (!existsSync(filePath)) {
            continue;
        }

        const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

        for (const line of lines) {
            const parsed = parseEnvLine(line);
            if (!parsed) {
                continue;
            }

            if (process.env[parsed.key] === undefined) {
                process.env[parsed.key] = parsed.value;
            }
        }
    }

    envLoaded = true;
}
