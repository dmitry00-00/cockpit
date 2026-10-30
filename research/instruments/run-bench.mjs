// И5: прогон замера кадра. Сначала собрать bench.html (vite.bench.config.ts) в каталог DIST, потом:
//   PW=<путь к playwright/index.mjs> node research/instruments/run-bench.mjs <DIST> [повторов=3] > research/instruments/bench-results.json
// Chromium — головной без окна (headless), GPU выключен: растр и WebGL идут на CPU через SwiftShader. Так задумано:
// видеокарту на этой машине занимает фоновая очистка карты, а Chromium с Metal здесь уже зависал. Поэтому цифры —
// оценка сверху для слабой машины без ускорения, а не время кадра на GPU.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const { chromium } = (await import(process.env.PW ?? 'playwright')).default ?? (await import(process.env.PW ?? 'playwright'));

const DIST = process.argv[2];
const REPS = Number(process.argv[3] ?? 3);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer((req, res) => {
  const p = normalize(join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0])));
  if (!p.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  try { statSync(p); res.setHeader('Content-Type', TYPES[extname(p)] ?? 'application/octet-stream'); res.end(readFileSync(p)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const RENDERERS = ['svg-flat', 'svg-flat&grain=0', 'svg-layered', 'canvas-full', 'canvas-cached', 'webgl'];
// Две машины: Mac с Retina (плотность 2) и слабый ноутбук на Windows (плотность 1.25, процессор в 4 раза медленнее).
const PROFILES = [{ name: 'mac-dpr2', dpr: 2, throttle: 1 }, { name: 'win-dpr1.25-cpu4x', dpr: 1.25, throttle: 4 }];
const TRACE = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu'];
const NAMES = ['Paint', 'RasterTask', 'Layout', 'UpdateLayoutTree', 'PrePaint', 'Layerize', 'Commit', 'FunctionCall', 'GPUTask', 'ImageDecodeTask'];

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = { date: new Date().toISOString(), chromium: browser.version(), note: 'headless, --disable-gpu, SwiftShader; цифры не годятся для GPU', runs: [] };
for (const prof of PROFILES) {
  for (const r of RENDERERS) {
    for (let rep = 0; rep < REPS; rep++) {
      const ctx = await browser.newContext({ viewport: { width: 640, height: 640 }, deviceScaleFactor: prof.dpr });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });
      await browser.startTracing(page, { categories: TRACE });
      await page.goto(`http://127.0.0.1:${port}/bench.html?r=${r}&n=300&size=400`);
      await page.waitForFunction(() => document.title === 'done', null, { timeout: 120000 });
      const res = await page.evaluate(() => window.__bench);
      const trace = JSON.parse((await browser.stopTracing()).toString());
      const sums = {};
      let paints = 0;
      for (const e of trace.traceEvents) {
        if (!NAMES.includes(e.name) || e.ph !== 'X' || typeof e.dur !== 'number') continue;
        sums[e.name] = (sums[e.name] ?? 0) + e.dur / 1000;
        if (e.name === 'Paint') paints++;
      }
      for (const k of Object.keys(sums)) sums[k] = +sums[k].toFixed(1);
      // Что ещё заметного в трассе — первые восемь событий по сумме длительности (кроме обёрток задач).
      const all = {};
      for (const e of trace.traceEvents) if (e.ph === 'X' && typeof e.dur === 'number' && !/^(ThreadControllerImpl|RunTask|TaskQueue|SequenceManager|ThreadPool)/.test(e.name)) all[e.name] = (all[e.name] ?? 0) + e.dur / 1000;
      const top = Object.entries(all).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k, +v.toFixed(1)]);
      out.runs.push({ profile: prof.name, rep, variant: r, ...res, traceMs: sums, paints, top });
      process.stderr.write(`${prof.name} ${r} #${rep}: mount ${res.mountMs?.toFixed?.(1)} · work p50 ${res.work?.p50} p95 ${res.work?.p95} · gap p95 ${res.interval?.p95} · >20мс ${res.over20ms} · paint ${paints} · raster ${sums.RasterTask ?? 0} мс\n`);
      await ctx.close();
    }
  }
}
await browser.close();
server.close();
console.log(JSON.stringify(out, null, 1));
