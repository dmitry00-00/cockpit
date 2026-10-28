/// <reference types="vitest/config" />
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Тайлы карт мира (scripts/tile-map.py → maps/tiles/) в бандл не идут: сотня мегабайт на карту. Сервер
// разработки и preview отдают их с диска по /maps/tiles/…; каталог можно вынести — DM_TILES_DIR.
const TILES_DIR = resolve(process.env.DM_TILES_DIR ?? 'maps/tiles');
const TILE_TYPES: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' };

const serveTiles: Connect.NextHandleFunction = (req, res, next) => {
  const url = (req.url ?? '').split('?')[0];
  if (!url.startsWith('/maps/tiles/')) return next();
  const file = resolve(TILES_DIR, decodeURIComponent(url.slice('/maps/tiles/'.length)));
  if (!file.startsWith(TILES_DIR + sep)) return next();
  try {
    const st = statSync(file);
    if (!st.isFile()) return next();
    res.setHeader('Content-Type', TILE_TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end();
  }
};

function mapTiles(): Plugin {
  return {
    name: 'dm-map-tiles',
    configureServer: server => void server.middlewares.use(serveTiles),
    configurePreviewServer: server => void server.middlewares.use(serveTiles),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mapTiles()],
  server: { port: 5180, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // Не больше четырёх воркеров (решение владельца 28.10.2026): при работающей локальной LLM полный прогон
    // с воркером на ядро ловил таймауты 5 с в тяжёлых тестах стола.
    maxWorkers: 4,
  },
});
