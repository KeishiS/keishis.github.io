import {
    array,
    literal,
    object,
    optional,
    parse,
    string,
    union,
    number,
    type InferOutput,
    minLength,
    maxLength,
    pipe,
    check,
} from "valibot";

const AuthorSchema = object({
    family: string(),
    given: string(),
});

const YearMonth = pipe(array(number()), minLength(2), maxLength(2));

const IssuedSchema = object({
    "date-parts": pipe(array(YearMonth), minLength(1), maxLength(1)),
});

const PublicationSchema = pipe(
    object({
        id: number(),
        type: union([
            literal("article-journal"),
            literal("paper-conference"),
            literal("software"),
            literal("webpage"),
        ]),
        locale: union([literal("ja"), literal("en")]),
        title: string(),
        author: pipe(array(AuthorSchema), minLength(1)),
        "container-title": optional(string()),
        "container-title-short": optional(string()),
        "event-title": optional(string()),
        issued: IssuedSchema,
        URL: optional(string()),
        DOI: optional(string()),
        abstract: string(),
    }),
    check(
        (publication) =>
            publication["container-title"] !== undefined ||
            publication["container-title-short"] !== undefined ||
            publication["event-title"] !== undefined,
    ),
);

const SiteSchema = object({
    title_ja: string(),
    title_en: string(),
    description_ja: string(),
    description_en: string(),
    copyright: string(),
});

const AffiliationSchema = object({
    role: string(),
    affiliation: string(),
    duration: string(),
});

const ProfileSchema = object({
    name_ja: string(),
    name_en: string(),
    bio_ja: string(),
    bio_en: string(),
    focus_ja: optional(string()),
    focus_en: optional(string()),
    base_ja: optional(string()),
    base_en: optional(string()),
    email: optional(string()),
    avatar: string(),
    social: object({
        keybase: optional(string()),
        orcid: optional(string()),
        github: optional(string()),
        bluesky: optional(string()),
        x: optional(string()),
    }),
    education: array(AffiliationSchema),
    experience: array(AffiliationSchema),
});

export const InfoSchema = object({
    journal_paper: array(PublicationSchema),
    refereed_international_conference: array(PublicationSchema),
    international_conference: array(PublicationSchema),
    domestic_workshop: array(PublicationSchema),
    profile: ProfileSchema,
    site: SiteSchema,
});

export type Issued = InferOutput<typeof IssuedSchema>;
export type Publication = InferOutput<typeof PublicationSchema>;
export type Info = InferOutput<typeof InfoSchema>;

export function parseInfoJson(data: unknown): Info {
    return parse(InfoSchema, data);
}

export const parseIssued = (
    publication: Publication,
): { year: number; month: number } => {
    const issued = publication.issued["date-parts"][0];
    return { year: issued[0], month: issued[1] };
};

export const parseAuthorName = (publication: Publication): string[] => {
    return publication.author.map((author) =>
        publication.locale === "ja"
            ? `${author.family}${author.given}`
            : `${author.given} ${author.family}`,
    );
};
