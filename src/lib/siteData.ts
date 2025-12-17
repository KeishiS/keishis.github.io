import { readFile } from "fs/promises";
import * as t from "@iarna/toml";
import {
    parseInfoJson,
    parseIssued,
    parseAuthorName,
    type Info,
} from "./infoSchema";
import { type Publication as InfoPub } from "./infoSchema";
import { parseChangelogToml, type Changelog } from "./changelogSchema";
import * as v from "valibot";

type Locale = InfoPub["locale"];
export type Publication = Omit<
    InfoPub,
    | "container-title"
    | "container-title-short"
    | "event-title"
    | "issued"
    | "author"
> & {
    author: string[];
    container: string;
    year: number;
    month: number;
    custom?: {
        award?: string;
    };
};

export interface SocialLink {
    key: string;
    url: string;
}

export interface Portfolio {
    title: string;
    category: string;
    description: string;
    url: string;
}

export interface Profile {
    name: string;
    bio: string;
    avatar: string;
    focus?: string;
    base?: string;
    email?: string;
    socials: SocialLink[];
    educations: Info["profile"]["education"];
    experiences: Info["profile"]["experience"];
    portfolios: Portfolio[];
    certifications: Info["profile"]["certification"];
}

export interface ChangelogEntry {
    version: string;
    date: string;
    summary: string;
}

interface SiteInfo {
    title: string;
    description: string;
    copyright: string;
}

export interface SiteData {
    profile: Profile;
    publications: {
        journal_paper: Publication[];
        refereed_international_conference: Publication[];
        international_conference: Publication[];
        domestic_workshop: Publication[];
    };
    changelog: ChangelogEntry[];
    site: SiteInfo;
}

const INFO_PATH = "info.json";
const CHANGELOG_PATH = "CHANGELOG.toml";

async function loadJsonFile(path: string): Promise<Info> {
    const raw = await readFile(path, "utf-8");

    // JSON文字列をobjectとしてパース
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (e) {
        throw new Error(`JSON parse error in ${path}: ${(e as Error).message}`);
    }

    // バリデーション
    try {
        return parseInfoJson(json);
    } catch (e) {
        if (e instanceof v.ValiError) {
            const issues = e.issues
                .map((i) => `- ${i.path?.join(".") ?? ""}: ${i.message}`)
                .join("\n");
            throw new Error(`Config validation failed for ${path}:\n${issues}`);
        } else {
            throw e;
        }
    }
}

async function loadTomlFile(path: string): Promise<Changelog> {
    const raw = await readFile(path, "utf-8");

    // TOML文字列をobjectとしてパース
    let toml: unknown;
    try {
        toml = t.parse(raw);
    } catch (e) {
        throw new Error(`TOML parse error in ${path}: ${(e as Error).message}`);
    }

    // バリデーション
    try {
        return parseChangelogToml(toml);
    } catch (e) {
        if (e instanceof v.ValiError) {
            const issues = e.issues
                .map((i) => `- ${i.path?.join(".") ?? ""}: ${i.message}`)
                .join("\n");
            throw new Error(`Config validation failed for ${path}:\n${issues}`);
        } else {
            throw e;
        }
    }
}

const formatContainerName = (paper: InfoPub): string => {
    let container: string;
    if (paper["container-title"] && paper["container-title-short"]) {
        container = `${paper["container-title"]} (${paper["container-title-short"]})`;
    } else if (paper["container-title"]) {
        container = paper["container-title"];
    } else if (paper["event-title"]) {
        container = paper["event-title"];
    } else {
        container = paper["container-title-short"] ?? "";
    }
    return container;
};

export async function loadSiteData(locale: Locale = "ja"): Promise<SiteData> {
    // info.json
    const info: Info = await loadJsonFile(INFO_PATH);
    // changelog
    const changelog: Changelog = await loadTomlFile(CHANGELOG_PATH);

    const journal_papers = info.journal_paper.map(
        (paper: InfoPub): Publication => {
            return {
                id: paper.id,
                type: paper.type,
                title: paper.title,
                locale: paper.locale,
                author: parseAuthorName(paper),
                abstract: paper.abstract,
                URL: paper?.URL,
                DOI: paper?.DOI,
                container: formatContainerName(paper),
                year: parseIssued(paper).year,
                month: parseIssued(paper).month,
                custom: paper?.custom,
            };
        },
    );

    const refereed_international_conferences =
        info.refereed_international_conference.map(
            (paper: InfoPub): Publication => {
                return {
                    id: paper.id,
                    type: paper.type,
                    title: paper.title,
                    locale: paper.locale,
                    author: parseAuthorName(paper),
                    abstract: paper.abstract,
                    URL: paper?.URL,
                    DOI: paper?.DOI,
                    container: formatContainerName(paper),
                    year: parseIssued(paper).year,
                    month: parseIssued(paper).month,
                    custom: paper?.custom,
                };
            },
        );

    const international_conferences = info.international_conference.map(
        (paper: InfoPub): Publication => {
            return {
                id: paper.id,
                type: paper.type,
                title: paper.title,
                locale: paper.locale,
                author: parseAuthorName(paper),
                abstract: paper.abstract,
                URL: paper?.URL,
                DOI: paper?.DOI,
                container: formatContainerName(paper),
                year: parseIssued(paper).year,
                month: parseIssued(paper).month,
                custom: paper?.custom,
            };
        },
    );

    const domestic_workshops = info.domestic_workshop.map(
        (paper: InfoPub): Publication => {
            return {
                id: paper.id,
                type: paper.type,
                title: paper.title,
                locale: paper.locale,
                author: parseAuthorName(paper),
                abstract: paper.abstract,
                URL: paper?.URL,
                DOI: paper?.DOI,
                container: formatContainerName(paper),
                year: parseIssued(paper).year,
                month: parseIssued(paper).month,
                custom: paper?.custom,
            };
        },
    );

    const socials = (
        Object.keys(info.profile.social) as (keyof Info["profile"]["social"])[]
    )
        .filter((key) => info.profile.social[key] !== undefined)
        .map(
            (key): SocialLink => ({
                key,
                url: info.profile.social[key] ?? "",
            }),
        );
    const portfolios: Portfolio[] = info.profile.portfolio.map((item) => ({
        title: item.title,
        category: item.category,
        description:
            locale === "ja" ? item.description_ja : item.description_en,
        url: item.url,
    }));

    const profile: Profile = {
        name: locale === "ja" ? info.profile.name_ja : info.profile.name_en,
        bio: locale === "ja" ? info.profile.bio_ja : info.profile.bio_en,
        avatar: info.profile.avatar,
        focus:
            locale === "ja" ? info.profile?.focus_ja : info.profile?.focus_en,
        base: locale === "ja" ? info.profile?.base_ja : info.profile?.base_en,
        email: info.profile.email,
        socials,
        educations: info.profile.education,
        experiences: info.profile.experience,
        portfolios,
        certifications: info.profile.certification,
    };

    const changelogEntries: ChangelogEntry[] = changelog.versions.map(
        (entry: Changelog["versions"][number]) => ({
            version: entry.version,
            date: entry.date,
            summary: entry.summary,
        }),
    );

    const site: SiteInfo = {
        title: locale === "ja" ? info.site.title_ja : info.site.title_en,
        description:
            locale === "ja"
                ? info.site.description_ja
                : info.site.description_en,
        copyright: info.site.copyright,
    };

    return {
        profile,
        publications: {
            journal_paper: journal_papers,
            refereed_international_conference:
                refereed_international_conferences,
            international_conference: international_conferences,
            domestic_workshop: domestic_workshops,
        },
        changelog: changelogEntries,
        site,
    };
}
