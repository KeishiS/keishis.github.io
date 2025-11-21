// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import starlightBlog from "starlight-blog";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// https://astro.build/config
export default defineConfig({
    site: "https://www.keishis.me",
    integrations: [
        starlight({
            title: "KeishiS.github.io",
            logo: {
                src: "./public/logo.jpg",
            },
            head: [
                {
                    tag: "link",
                    attrs: {
                        rel: "stylesheet",
                        href: "https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css",
                        integrity:
                            "sha384-WcoG4HRXMzYzfCgiyfrySxx90XSl2rxY5mnVY5TwtWE6KLrArNKn0T/mOgNL0Mmi",
                        crossorigin: "anonymous",
                    },
                },
            ],
            defaultLocale: "root",
            locales: {
                root: {
                    label: "日本語",
                    lang: "ja-JP",
                },
                en: {
                    label: "English",
                },
            },
            social: [
                {
                    icon: "blueSky",
                    label: "Bluesky",
                    href: "https://bsky.app/profile/nobuta05.bsky.social",
                },
                {
                    icon: "github",
                    label: "GitHub",
                    href: "https://github.com/KeishiS",
                },
            ],
            sidebar: [],
            customCss: ["./src/styles/global.css", "./src/styles/custom.css"],
            favicon: "/favicon.ico",
            plugins: [
                starlightBlog({
                    title: "Blog",
                    prefix: "blog",
                    navigation: "header-start",
                    postCount: 10,
                    recentPostCount: 3,
                    authors: {
                        keishis: {
                            name: "Keishi Sando",
                            title: "Ph.D. Candidate in Machine Learning",
                            picture: "https://github.com/KeishiS.png", // Images in the `public` directory are supported.
                        },
                    },
                }),
            ],
            components: {
                SocialIcons: "./src/components/SocialIcons.astro",
                Footer: "./src/components/Footer.astro",
            },
        }),
    ],
    markdown: {
        remarkPlugins: [remarkMath],
        rehypePlugins: [rehypeKatex],
    },
    vite: {
        plugins: [tailwindcss()],
    },
});
