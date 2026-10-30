// И5: снимок песочницы без GPU — Chromium в headless с программной отрисовкой (SwiftShader), чтобы не мешать
// фоновой очистке карты на видеокарте. Запуск: node research/instruments/shot.mjs <url> <out.png> [ширина] [высота] [reduced]
// Playwright в кокпите не установлен: путь к пакету — переменной PW (на этой машине — из соседнего проекта).
const { chromium } = (await import(process.env.PW ?? 'playwright')).default ?? (await import(process.env.PW ?? 'playwright'));
const [url, out, w = '1500', h = '1000', reduced] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: out });
console.log(JSON.stringify({ errors }));
await browser.close();
