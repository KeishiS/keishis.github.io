import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function getStaticPaths() {
  return [
    { params: { lang: 'ja' } },
    { params: { lang: 'en' } },
  ];
}

export async function GET(context: APIContext) {
  const lang = context.params.lang as string;
  const posts = await getCollection('blog');
  
  // 言語でフィルタリングし、日付順にソート
  const filteredPosts = posts
    .filter((post) => post.data.restricted !== true && post.data.lang === lang) // restricted: true の記事を除外
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());

  const title = lang === 'ja' ? 'Researcher Name のブログ' : "Researcher Name's Blog";
  const description = lang === 'ja' ? '研究と開発に関する記事' : 'Articles about research and development';

  return rss({
    title: title,
    description: description,
    site: context.site!, // astro.config.mjs に site が設定されている前提
    items: filteredPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      // リンク形式: /ja/blog/slug/
      link: `/${lang}/blog/${post.data.slug}/`,
    })),
    customData: `<language>${lang}</language>`,
  });
}
