import satori from "satori";
import type { ReactNode } from "react";
import { Resvg } from "@resvg/resvg-js";
import { html } from "satori-html";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export async function getStaticPaths() {
    const posts = await getCollection("blog");
    return posts.map((post) => ({
        params: { lang: post.data.lang, slug: post.data.slug },
        props: { post },
    }));
}

export const GET: APIRoute = async ({ params, props }) => {
    const { post } = props;
    const title = post.data.title;
    const date = post.data.date.toLocaleDateString(params.lang, {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    // Google Fonts から Noto Sans JP をフェッチするためのヘルパー
    // (簡略化のため、ビルド環境からインターネットアクセスが必要)
    const fontData = await fetch(
        "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf",
    ).then((res) => res.arrayBuffer());

    // satori 用のマークアップ (Tailwind CSS ライクなスタイルが一部使える)
    const markup = html`
        <div
            style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; width: 100%; background-color: #1e293b; color: white; padding: 40px;"
        >
            <div
                style="display: flex; flex-direction: column; border: 4px solid #3b82f6; border-radius: 20px; padding: 40px; width: 90%; height: 90%; justify-content: space-between; background-color: #0f172a;"
            >
                <div style="display: flex; flex-direction: column;">
                    <div
                        style="font-size: 24px; color: #94a3b8; margin-bottom: 20px;"
                    >
                        ${date}
                    </div>
                    <div
                        style="font-size: 48px; font-weight: bold; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;"
                    >
                        ${title}
                    </div>
                </div>
            </div>
        </div>
    ` as unknown as ReactNode;

    const svg = await satori(markup, {
        width: 1200,
        height: 630,
        fonts: [
            {
                name: "Noto Sans JP",
                data: fontData,
                style: "normal",
                weight: 700,
            },
        ],
    });

    const resvg = new Resvg(svg);
    const png = resvg.render().asPng();
    const uint8 = png instanceof Uint8Array ? png : new Uint8Array(png);
    const arrayBuffer: ArrayBuffer = Uint8Array.from(uint8).buffer;

    return new Response(arrayBuffer, {
        headers: {
            "Content-Type": "image/png",
        },
    });
};
