import { defineCollection, z } from "astro:content";
import { asciidocLoader } from "@/lib/asciidoc";

const blogCollection = defineCollection({
    loader: asciidocLoader({ base: "src/data/blog" }),
    schema: z.object({
        slug: z.string(), // カスタムスラッグ
        title: z.string(),
        date: z.date(),
        publishedAt: z.date(),
        updatedAt: z.date(),
        author: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).default([]),
        lang: z.enum(["ja", "en"]),
        restricted: z.boolean().default(false),
        bodyHtml: z.string(), // HTML文字列として受け取る
    }),
});

export const collections = {
    blog: blogCollection,
};
