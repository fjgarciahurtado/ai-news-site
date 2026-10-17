import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import newsAssets from './src/integrations/news-assets.mjs';

// The digest's Markdown lives one level up (../diario, ../articulos, ../paginas, ../assets).
process.env.NEWS_ROOT ??= path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// SITE_URL is the full public address, e.g. https://fjgarciahurtado.github.io/ai-news-site/.
// Its origin becomes `site` and its path becomes `base`, so the site can live under a subpath.
const siteUrl = new URL(process.env.SITE_URL || 'http://localhost:4321/');

export default defineConfig({
  site: siteUrl.origin,
  base: siteUrl.pathname.replace(/\/*$/, '/'),
  trailingSlash: 'always',
  integrations: [sitemap(), newsAssets(path.join(process.env.NEWS_ROOT, 'assets'))],
});
