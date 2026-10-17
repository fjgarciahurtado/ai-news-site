import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getNews, SITE_NAME, url } from '../lib/news';

export function GET(context: APIContext) {
  const news = getNews();
  const items = news.daily.slice(0, 30).map((page) => ({
    title: page.title,
    link: url(page.route),
    pubDate: new Date(`${page.date}T05:30:00+02:00`),
    description: page.description,
    content: page.html.replace(/(href|src)="\//g, `$1="${context.site!.origin}/`),
  }));
  return rss({
    title: SITE_NAME,
    description: 'Resumen diario de las noticias más importantes de España.',
    site: new URL(url('/'), context.site).href,
    customData: '<language>es-es</language>',
    items,
  });
}
