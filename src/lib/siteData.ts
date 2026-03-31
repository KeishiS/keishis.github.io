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
    featured?: boolean;
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
    featured?: boolean;
    techStack?: {
        algorithm?: string[];
        frontend?: string[];
        backend?: string[];
        infra?: string[];
        observability?: string[];
        communication?: string[];
    };
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

export interface SiteInfo {
    title: string;
    description: string;
    copyright: string;
}

export interface SiteChrome {
    site: SiteInfo;
    socials: SocialLink[];
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

export function getFeaturedPublications(
    publications: SiteData["publications"],
): Publication[] {
    return [
        ...publications.journal_paper,
        ...publications.refereed_international_conference,
        ...publications.international_conference,
        ...publications.domestic_workshop,
    ]
        .filter((publication) => publication.featured === true)
        .sort((a, b) =>
            b.year !== a.year ? b.year - a.year : b.month - a.month,
        );
}

export function getFeaturedPortfolios(profile: Profile): Portfolio[] {
    return profile.portfolios.filter((portfolio) => portfolio.featured === true);
}

const INFO_PATH = "info.json";
const CHANGELOG_PATH = "CHANGELOG.toml";

async function loadRawSiteSources(): Promise<{ info: Info; changelog: Changelog }> {
    const [info, changelog] = await Promise.all([
        loadJsonFile(INFO_PATH),
        loadTomlFile(CHANGELOG_PATH),
    ]);

    return { info, changelog };
}

function buildSocialLinks(profile: Info["profile"]): SocialLink[] {
    return (
        Object.keys(profile.social) as (keyof Info["profile"]["social"])[]
    )
        .filter((key) => profile.social[key] !== undefined)
        .map(
            (key): SocialLink => ({
                key,
                url: profile.social[key] ?? "",
            }),
        );
}

function buildSiteInfo(site: Info["site"], locale: Locale): SiteInfo {
    return {
        title: locale === "ja" ? site.title_ja : site.title_en,
        description: locale === "ja" ? site.description_ja : site.description_en,
        copyright: site.copyright,
    };
}

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

export async function loadSiteChrome(locale: Locale = "ja"): Promise<SiteChrome> {
    const { info } = await loadRawSiteSources();

    return {
        site: buildSiteInfo(info.site, locale),
        socials: buildSocialLinks(info.profile),
    };
}

export async function loadPublications(): Promise<SiteData["publications"]> {
    const { info } = await loadRawSiteSources();

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
                featured: paper?.featured,
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
                    featured: paper?.featured,
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
                featured: paper?.featured,
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
                featured: paper?.featured,
            };
        },
    );

    return {
        journal_paper: journal_papers,
        refereed_international_conference: refereed_international_conferences,
        international_conference: international_conferences,
        domestic_workshop: domestic_workshops,
    };
}

export async function loadProfile(locale: Locale = "ja"): Promise<Profile> {
    const { info } = await loadRawSiteSources();
    const socials = buildSocialLinks(info.profile);
    const portfolios: Portfolio[] = info.profile.portfolio.map((item) => ({
        title: item.title,
        category: item.category,
        description:
            locale === "ja" ? item.description_ja : item.description_en,
        url: item.url,
        featured: item.featured,
        techStack: item.tech_stack,
    }));

    return {
        name: locale === "ja" ? info.profile.name_ja : info.profile.name_en,
        bio: locale === "ja" ? info.profile.bio_ja : info.profile.bio_en,
        avatar: info.profile.avatar,
        focus: locale === "ja" ? info.profile?.focus_ja : info.profile?.focus_en,
        base: locale === "ja" ? info.profile?.base_ja : info.profile?.base_en,
        email: info.profile.email,
        socials,
        educations: info.profile.education,
        experiences: info.profile.experience,
        portfolios,
        certifications: info.profile.certification,
    };
}

export async function loadChangelogEntries(): Promise<ChangelogEntry[]> {
    const { changelog } = await loadRawSiteSources();

    return changelog.versions.map((entry: Changelog["versions"][number]) => ({
        version: entry.version,
        date: entry.date,
        summary: entry.summary,
    }));
}

export async function loadSiteData(locale: Locale = "ja"): Promise<SiteData> {
    const [profile, publications, changelog, chrome] = await Promise.all([
        loadProfile(locale),
        loadPublications(),
        loadChangelogEntries(),
        loadSiteChrome(locale),
    ]);

    return {
        profile,
        publications,
        changelog,
        site: chrome.site,
    };
}
