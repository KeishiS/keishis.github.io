import {
    pipe,
    string,
    regex,
    object,
    optional,
    array,
    parse,
    type InferOutput,
} from "valibot";

const VersionSchema = object({
    version: string(),
    date: pipe(string(), regex(/^\d{4}-\d{2}-\d{2}/)),
    summary: string(),
    added: optional(array(string())),
    changed: optional(array(string())),
    fixed: optional(array(string())),
});

export const ChangelogSchema = object({
    versions: array(VersionSchema),
});
export type Changelog = InferOutput<typeof ChangelogSchema>;

export function parseChangelogToml(data: unknown): Changelog {
    return parse(ChangelogSchema, data);
}
