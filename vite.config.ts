/// <reference types="vitest/config" />
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { splitTexts } from './src/rules/textSplit';
import { VttRelay } from './src/vtt/relay';

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

// Мост к MapTool (Q17): ретранслятор src/vtt/relay.ts. Аддон MapTool — POST /vtt/maptool/sync (токены → вид стола),
// страница стола — GET /vtt/desk/poll и POST /vtt/desk/view. Всё в памяти процесса; слушает только сервер разработки.
function vttRelay(): Plugin {
  const relay = new VttRelay(Date.now());
  const handle: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/vtt/')) return next();
    const reply = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && url === '/vtt/desk/poll') return reply(200, relay.deskPoll(Date.now()));
    if (req.method !== 'POST' || (url !== '/vtt/maptool/sync' && url !== '/vtt/desk/view')) return reply(404, { error: 'нет такого адреса моста' });
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { raw += chunk; });
    req.on('end', () => {
      try {
        const body: unknown = JSON.parse(raw || 'null');
        reply(200, url === '/vtt/maptool/sync' ? relay.maptoolSync(body, Date.now()) : relay.deskView(body));
      } catch (e) {
        reply(400, { error: e instanceof Error ? e.message : String(e) });
      }
    });
  };
  return { name: 'dm-vtt-relay', configureServer: server => void server.middlewares.use(handle) };
}

// Тексты справочников отдельным куском (ROADMAP 0.5): `x.json?split=core` — структура с пустыми текстами, в основной
// кусок; `x.json?split=texts` — тексты массивом, догружаются (src/rules/texts.ts); `x.json?split=full` — файл целиком.
// `&ids=a,b` и `&except=a,b` оставляют в записи `monsters` только эти блоки или все, кроме них (с `order` — порядком всех):
// блоки сида — в основной кусок, остальные SRD — догрузкой (rules/srd/monsters.ts). Делит src/rules/textSplit.ts из того же JSON на диске —
// импортёры пишут файлы как прежде, копий в репо нет. Виртуальный id кончается на .js, чтобы JSON-плагин Vite его не трогал.
const SPLIT = '\0dm-split:';
function textSplit(): Plugin {
  return {
    name: 'dm-text-split',
    enforce: 'pre',
    resolveId(source, importer) {
      const m = /^(.+\.json)\?(split=(?:core|texts|full)(?:&(?:ids|except)=[\w,-]+)?)$/.exec(source);
      if (!m || !importer) return null;
      return `${SPLIT}${m[2]}|${resolve(dirname(importer), m[1])}.js`;
    },
    load(id) {
      if (!id.startsWith(SPLIT)) return null;
      const [query, path] = id.slice(SPLIT.length).split('|');
      const file = path.replace(/\.js$/, '');
      this.addWatchFile(file);
      const q = new URLSearchParams(query);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const ids = q.get('ids')?.split(','), except = q.get('except')?.split(',');
      // Догружаемый остаток несёт порядок всех блоков: список «Добавить» — в порядке импортёра, а не «сид, потом остальное».
      if (except) data.order = Object.keys(data.monsters);
      if (ids || except) data.monsters = Object.fromEntries(Object.entries(data.monsters).filter(([k]) => (ids ? ids.includes(k) : !except!.includes(k))));
      const part = q.get('split');
      const out = part === 'full' ? data : splitTexts(data)[part === 'core' ? 'core' : 'texts'];
      return `export default ${JSON.stringify(out)};`;
    },
  };
}

export default defineConfig({
  plugins: [textSplit(), react(), tailwindcss(), mapTiles(), vttRelay()],
  server: { port: 5180, strictPort: true },
  // Библиотеки — своим куском (TASKS Q18): меняются реже кода стола, и браузер держит их в кэше между выпусками.
  // Грузятся на старте вместе с основным — сумму старта показывает scripts/bundle-report.mjs.
  // Справочники (компендиум, заклинания, снаряжение, космос) — отдельными кусками через await import() на верхнем
  // уровне модуля: потребители читают их как прежде, а загрузка идёт параллельно основному. Top-level await —
  // ES2022: Safari 15, Chrome 89, Firefox 89 и новее (планшет по --lan в их числе).
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: id => (/node_modules\/(react|react-dom|scheduler|@radix-ui|@floating-ui|immer|zustand|react-remove-scroll|react-remove-scroll-bar|aria-hidden|use-sidecar|use-callback-ref|react-style-singleton|get-nonce|detect-node-es|tslib)\//.test(id) ? 'vendor' : undefined),
      },
    },
  },
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
