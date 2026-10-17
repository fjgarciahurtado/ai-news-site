// Loads the digest's Markdown (../diario, ../articulos, ../semanal, ../paginas) and the
// public config (../config/*.yaml) at build time. Files are read in place, never copied.
//
// Strict: any problem (missing file, bad frontmatter, broken link) is collected, and a
// production build fails if there is any, so a bad build never replaces the live site.
// The dev server only prints the warnings.

import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';

export const SITE_NAME = 'Resumen de noticias';

export const ROOT = process.env.NEWS_ROOT ?? path.resolve(process.cwd(), '..');

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const DAILY_PATH = /^diario\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})\.md$/;
const WEEKLY_PATH = /^semanal\/(\d{4}-W\d{2})\.md$/;
const ARTICLE_PATH = /^articulos\/(\d{4})\/(\d{2})\/(\d{2})\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export const STATUS: Record<string, { emoji: string; label: string; plural: string }> = {
  verificada: { emoji: '✅', label: 'Verificada', plural: 'Verificadas' },
  'sin-confirmar': { emoji: '⚠️', label: 'Sin confirmar', plural: 'Sin confirmar' },
  disputada: { emoji: '❓', label: 'Disputada', plural: 'Disputadas' },
  falsa: { emoji: '❌', label: 'Falsa', plural: 'Falsas' },
};

export type Kind = 'daily' | 'weekly' | 'article' | 'page';

export interface Page {
  kind: Kind;
  file: string; // repo-relative path, e.g. articulos/2026/10/17/slug.md
  route: string; // web path, e.g. /articulos/2026/10/17/slug/
  meta: Record<string, any>;
  title: string;
  date: string; // YYYY-MM-DD (weekly: date of its last day, if set)
  description: string;
  html: string;
}

export interface Outlet {
  id: string;
  name: string;
  group: string;
  lean: string;
  kind: string;
  scope: string;
  enabled: boolean;
  note: string;
}

export interface News {
  daily: Page[]; // newest first
  weekly: Page[]; // newest first
  articles: Page[]; // newest first
  pages: Page[];
  byRoute: Map<string, Page>;
  areas: { id: string; title: string }[];
  outlets: Outlet[];
  blocked: { domain: string; reason: string; evidence_url: string | null }[];
  factcheckers: { name: string; domains: string[]; enabled: boolean }[];
}

const problems: string[] = [];
export function warn(message: string) {
  if (problems.includes(message)) return;
  problems.push(message);
  console.warn(`[news] WARNING ${message}`);
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Adds the site's base path to a root-relative route (a no-op at a domain root, `/sub/diario/` under a subpath). */
export function url(route: string): string {
  return BASE + route;
}

/** Web route for a repo-relative Markdown path: `a/b.md` -> `/a/b/`, `a/README.md` -> `/a/`. */
export function routeFor(file: string): string {
  const stem = file.replace(/\.md$/, '').replace(/(^|\/)README$/, '');
  return '/' + (stem ? stem.replace(/\/$/, '') + '/' : '');
}

function listMarkdown(dir: string, required = true): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) {
    if (required) warn(`folder ${dir}/ not found; no pages generated from it`);
    return [];
  }
  return fs
    .readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => path.posix.join(dir, path.relative(abs, path.join(e.parentPath, e.name)).split(path.sep).join('/')))
    .sort();
}

function readYaml(file: string): any {
  try {
    return yaml.load(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch (err) {
    warn(`${file}: cannot be read (${(err as Error).message.split('\n')[0]})`);
    return {};
  }
}

function parseFile(file: string): { meta: Record<string, any>; body: string } | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  } catch (err) {
    warn(`${file}: cannot be read (${(err as Error).message}); skipped`);
    return null;
  }
  const match = text.match(FRONTMATTER);
  if (!match) return { meta: {}, body: text };
  let meta: unknown = {};
  try {
    meta = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    warn(`${file}: invalid frontmatter (${(err as Error).message.split('\n')[0]})`);
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    if (meta) warn(`${file}: frontmatter is not a mapping`);
    meta = {};
  }
  return { meta: meta as Record<string, any>, body: text.slice(match[0].length) };
}

function asString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function asList(value: unknown): any[] {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/** Split off a leading `# Heading` so the layout can show it as the page title. */
function takeH1(body: string): { h1: string; body: string } {
  const match = body.match(/^(?:\s*<!--[\s\S]*?-->)*\s*# (.+)\n/);
  return match ? { h1: match[1].trim(), body: body.slice(match[0].length) } : { h1: '', body };
}

function plainText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First paragraph under the preferred section heading, or the first paragraph at all. */
function describe(body: string, headings: string[]): string {
  const sections = body.split(/^## /m);
  const preferred = sections.find((s) => headings.some((h) => s.startsWith(h)));
  const text = preferred ? preferred.slice(preferred.indexOf('\n') + 1) : body;
  const paragraph = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('**Estado'));
  const plain = plainText(paragraph ?? '');
  return plain.length > 220 ? plain.slice(0, 217).replace(/\s+\S*$/, '') + '…' : plain;
}

// ---------------------------------------------------------------------------
// Link resolution

const ASSET_PREFIX = 'assets/';

/**
 * Rewrites relative links in rendered HTML: `.md` targets become web routes, files in
 * assets/ become /assets/..., anything else is reported (and fails the build).
 */
function rehypeNewsLinks(options: { file: string; routes: Set<string> }) {
  const { file, routes } = options;
  const dir = path.posix.dirname(file);

  function resolve(href: string): string | null {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
    const [target, hash = ''] = href.split(/#(.*)/s, 2);
    const fragment = hash ? `#${hash}` : '';
    let decoded = target;
    try {
      decoded = decodeURI(target);
    } catch {
      // keep the raw target
    }
    const repoPath = path.posix.normalize(path.posix.join(dir, decoded));
    if (repoPath.startsWith('..')) {
      warn(`${file}: link '${href}' points outside the repository`);
      return null;
    }
    const exists = fs.existsSync(path.join(ROOT, repoPath));
    if (repoPath.startsWith(ASSET_PREFIX)) {
      if (!exists) warn(`${file}: broken link '${href}'`);
      return url('/' + repoPath.split('/').map(encodeURIComponent).join('/'));
    }
    const route = routeFor(repoPath.endsWith('.md') ? repoPath : repoPath.replace(/\/?$/, '/'));
    if (routes.has(route)) return url(route) + fragment;
    warn(exists ? `${file}: link '${href}' targets a file that is not published` : `${file}: broken link '${href}'`);
    return null;
  }

  function walk(node: any) {
    if (node.type === 'element') {
      const attr = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : null;
      const value = attr && node.properties?.[attr];
      if (typeof value === 'string') {
        const resolved = resolve(value);
        if (resolved === null) {
          if (node.tagName === 'a') {
            node.tagName = 'span';
            node.properties = { className: ['broken-link'], title: `Enlace no disponible: ${value}` };
          }
        } else {
          node.properties[attr] = resolved;
          if (node.tagName === 'a' && /^https?:/.test(resolved)) node.properties.rel = ['noopener'];
          if (node.tagName === 'img') {
            node.properties.loading = 'lazy';
            node.properties.referrerPolicy = 'no-referrer'; // hotlinked press photos
          }
        }
      }
    }
    for (const child of node.children ?? []) walk(child);
  }

  return (tree: any) => walk(tree);
}

function render(file: string, markdown: string, routes: Set<string>): string {
  try {
    return String(
      unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype) // raw HTML (the validator's <!-- auto --> markers) is dropped
        .use(rehypeSlug)
        .use(rehypeNewsLinks, { file, routes })
        .use(rehypeStringify)
        .processSync(markdown),
    );
  } catch (err) {
    warn(`${file}: could not be rendered (${(err as Error).message})`);
    return '<p class="broken-link">No se ha podido mostrar esta página.</p>';
  }
}

// ---------------------------------------------------------------------------
// Loading

function load(): News {
  const pending: { page: Page; body: string }[] = [];

  function add(kind: Kind, file: string, date: string) {
    const parsed = parseFile(file);
    if (!parsed) return;
    const { h1, body } = takeH1(parsed.body);
    const meta = parsed.meta;
    const page: Page = {
      kind, file, meta, route: routeFor(file), date,
      title: asString(meta.title) || h1 || path.posix.basename(file, '.md'),
      description: '', html: '',
    };
    if (kind === 'daily') {
      page.title = h1 || `Resumen diario del ${formatDate(date)}`;
      if (asString(meta.date) !== date) warn(`${file}: 'date' ${meta.date} differs from the file name`);
      page.description = describe(body, ['🔴 Lo más importante']);
    } else if (kind === 'weekly') {
      page.title = h1 || `Semana ${date}`;
      page.date = asString(meta.date) || '';
      page.description = describe(body, ['Resumen']);
    } else if (kind === 'article') {
      for (const field of ['title', 'date', 'area', 'status']) {
        if (!asString(meta[field])) warn(`${file}: missing '${field}'`);
      }
      if (asString(meta.date) !== date) warn(`${file}: 'date' ${meta.date} differs from the path`);
      if (meta.status && !(meta.status in STATUS)) warn(`${file}: unknown status '${meta.status}'`);
      page.description = describe(body, ['Resumen']);
    } else {
      page.description = describe(body, []);
    }
    pending.push({ page, body });
  }

  for (const file of listMarkdown('diario')) {
    const m = file.match(DAILY_PATH);
    if (m) add('daily', file, m[1]);
    else warn(`${file}: path must be diario/YYYY/MM/YYYY-MM-DD.md; skipped`);
  }
  for (const file of listMarkdown('semanal', false)) {
    const m = file.match(WEEKLY_PATH);
    if (m) add('weekly', file, m[1]);
    else warn(`${file}: path must be semanal/YYYY-Www.md; skipped`);
  }
  for (const file of listMarkdown('articulos')) {
    const m = file.match(ARTICLE_PATH);
    if (m) add('article', file, `${m[1]}-${m[2]}-${m[3]}`);
    else warn(`${file}: path must be articulos/YYYY/MM/DD/slug.md; skipped`);
  }
  for (const file of listMarkdown('paginas')) add('page', file, '');

  const all = pending.map((p) => p.page);
  const byRoute = new Map(all.map((p) => [p.route, p]));
  // Index pages the site generates, so links to folders and READMEs resolve too.
  const routes = new Set([...byRoute.keys(), '/', '/diario/', '/semanal/', '/areas/', '/estado/']);
  for (const { page, body } of pending) page.html = render(page.file, body, routes);

  const categories = readYaml('config/categories.yaml') ?? {};
  const areas = Object.entries(categories.areas ?? {}).map(([id, spec]: [string, any]) => ({ id, title: asString(spec?.title) || id }));
  const areaIds = new Set(areas.map((a) => a.id));
  for (const page of all) {
    if (page.kind === 'article' && page.meta.area && !areaIds.has(page.meta.area)) warn(`${page.file}: unknown area '${page.meta.area}'`);
  }

  const sources = readYaml('config/sources.yaml') ?? {};
  const outlets: Outlet[] = asList(sources.outlets).map((o: any) => ({
    id: asString(o.id), name: asString(o.name), group: asString(o.group), lean: asString(o.lean),
    kind: asString(o.kind), scope: asString(o.scope), enabled: o.enabled !== false, note: '',
  }));
  const blocked = asList(readYaml('config/blocklist.yaml')?.blocked).map((b: any) => ({
    domain: asString(b.domain), reason: asString(b.reason), evidence_url: b.evidence_url ? asString(b.evidence_url) : null,
  }));
  const factcheckers = asList(readYaml('config/factcheckers.yaml')?.factcheckers).map((f: any) => ({
    name: asString(f.name), domains: asList(f.domains).map(asString), enabled: f.enabled !== false,
  }));

  if (problems.length && !import.meta.env.DEV && process.env.NEWS_STRICT !== '0') {
    throw new Error(`[news] ${problems.length} problem(s) in the content; build stopped:\n${problems.join('\n')}`);
  }

  const newest = (a: Page, b: Page) => b.date.localeCompare(a.date) || a.file.localeCompare(b.file);
  return {
    daily: all.filter((p) => p.kind === 'daily').sort(newest),
    weekly: all.filter((p) => p.kind === 'weekly').sort((a, b) => b.file.localeCompare(a.file)),
    articles: all.filter((p) => p.kind === 'article').sort(newest),
    pages: all.filter((p) => p.kind === 'page'),
    byRoute, areas, outlets, blocked, factcheckers,
  };
}

let cached: News | undefined;
export function getNews(): News {
  return (cached ??= load());
}

// ---------------------------------------------------------------------------
// Helpers for pages

export function areaTitle(id: string): string {
  return getNews().areas.find((a) => a.id === id)?.title ?? id;
}

export function outletName(id: string): string {
  return getNews().outlets.find((o) => o.id === id)?.name ?? id;
}

export function formatDate(date: string, withWeekday = false): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('es-ES', {
    ...(withWeekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
