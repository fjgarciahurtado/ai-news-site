// Publishes the repository's assets/ folder at <base>/assets/ without copying it into site/.
// Build: copied into the output after the build. Dev: served straight from the folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

export default function newsAssets(assetsDir) {
  let base = '/';
  return {
    name: 'news-assets',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base.replace(/\/?$/, '/');
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(`${base}assets/`, (req, res, next) => {
          const file = path.join(assetsDir, decodeURIComponent((req.url ?? '').split('?')[0]));
          if (!file.startsWith(assetsDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
          res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': ({ dir, logger }) => {
        if (!fs.existsSync(assetsDir)) {
          logger.warn(`${assetsDir} not found; no assets published`);
          return;
        }
        const target = path.join(fileURLToPath(dir), 'assets');
        fs.cpSync(assetsDir, target, { recursive: true, filter: (src) => path.basename(src) !== '.gitkeep' });
        logger.info(`copied assets/ to ${target}`);
      },
    },
  };
}
