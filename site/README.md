# Website

A static site built with [Astro](https://astro.build) from the digest's Markdown. It reads
`../diario`, `../articulos`, `../semanal`, `../paginas`, `../assets` and the public files in
`../config` at build time. Nothing is copied into `site/`, and the Markdown is not changed.
Adapted from the ai-library site.

## Pages

| Route | Content |
|---|---|
| `/` | Latest daily digest, earlier digests |
| `/diario/`, `/diario/YYYY/MM/YYYY-MM-DD/` | Archive by month; one digest with previous/next links |
| `/articulos/YYYY/MM/DD/<slug>/` | One article |
| `/areas/`, `/areas/<area>/` | Articles by area (areas from `config/categories.yaml`) |
| `/estado/<status>/` | Articles by verification status |
| `/paginas/<page>/` | Metodología, Política de fuentes (with tables from `config/`), Correcciones, Aviso IA |
| `/rss.xml`, `/sitemap-index.xml`, `/robots.txt` | Feed of digests, sitemap, robots |

Routes mirror the repository paths, so relative links between `.md` files resolve directly.
The validator's `<!-- auto:... -->` markers are HTML comments and are dropped when rendering.

All reading and rendering happens in `src/lib/news.ts`. **The build is strict:** a missing
field, invalid frontmatter or broken link fails a production build (set `NEWS_STRICT=0` to
override), so a bad build never replaces the live site. `newsdigest check` catches these
before commit; the site check is the last line of defence. The dev server only warns.

## Run locally

Requires Node 22.12 or later (`.nvmrc`). On the Pi, Node 22 is installed with nvm in the home
directory and is not the system default:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
cd site
npm install
npm run dev       # http://localhost:4321, rebuild on save
npm run build     # writes site/dist
npm run preview   # serves site/dist
```

The daily job does not need Node: the site is built by GitHub Actions.

## Deployment

The ai-news repo is private, so the site is published through a public mirror,
[ai-news-site](https://github.com/fjgarciahurtado/ai-news-site), on GitHub Pages:
<https://ai-news.fjgarciahurtado.com/> (custom domain
set in the ai-news-site Pages settings; DNS: CNAME `ai-news` → `fjgarciahurtado.github.io` in Route 53).

1. After each push, `scripts/update.sh` runs `scripts/publish_site.sh`. It copies the committed
   `diario/`, `articulos/`, `semanal/`, `paginas/`, `assets/`, `site/` and four public config
   files into a local clone of the public repo (`SITE_REPO_DIR`, default
   `~/source/ai-news-site`), adds `scripts/publish/README.md` and `scripts/publish/pages.yml`
   (as `.github/workflows/pages.yml`), and pushes over an SSH deploy key (host alias
   `github-ai-news-site`) if anything changed. `data/` (outlet extracts) is never published.
2. The workflow in the public repo builds with Node from `.nvmrc` and deploys to Pages.

`SITE_URL` sets the public address. Its path becomes Astro's `base`, so every internal link
goes through `url()` in `src/lib/news.ts`.
