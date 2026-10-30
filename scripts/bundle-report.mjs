// Что лежит в основном куске (TASKS Q18): сборка Vite с плагином, который печатает размеры после минификации —
// основной кусок, всё, что грузится на старте (он и его статические импорты), — и модули основного куска по размеру
// до минификации (renderedLength) со сводкой по каталогам. Ничего не пишет в dist сверх обычной сборки.
// Бюджет меряется по основному куску, но «меньше» не должно значить «переехало в соседний кусок, грузящийся
// тут же»: поэтому рядом — сумма старта. Старт — всё, без чего нет первой отрисовки: основной кусок, его статические
// импорты и куски под await import() на верхнем уровне модуля (справочники, vite.config.ts), с их импортами.
//
//   node scripts/bundle-report.mjs [--top 40] [--budget 500]   — с --budget выход 1, если основной кусок больше N КБ
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const arg = name => (process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : undefined);
const top = arg('--top') ?? 40;
const budget = arg('--budget');
let mainBytes = 0;
const report = {
  name: 'bundle-report',
  async generateBundle(_, bundle) {
    const entry = Object.values(bundle).find(c => c.type === 'chunk' && c.isEntry);
    const mods = Object.entries(entry.modules).map(([id, m]) => ({ id: id.replace(process.cwd() + '/', '').replace(/^\0/, ''), size: m.renderedLength }));
    const total = mods.reduce((a, m) => a + m.size, 0);
    const byDir = new Map();
    for (const m of mods) {
      const d = m.id.startsWith('node_modules/') ? m.id.split('/').slice(0, m.id.split('/')[1].startsWith('@') ? 3 : 2).join('/') : m.id.split('/').slice(0, 2).join('/');
      byDir.set(d, (byDir.get(d) ?? 0) + m.size);
    }
    const kb = n => `${(n / 1024).toFixed(1)} КБ`.padStart(10);
    const start = new Set([entry.fileName]);
    const visit = f => { for (const i of bundle[f]?.imports ?? []) if (!start.has(i)) { start.add(i); visit(i); } };
    visit(entry.fileName);
    const chunkOf = new Map(Object.values(bundle).filter(c => c.type === 'chunk').flatMap(c => c.moduleIds.map(id => [id, c.fileName])));
    // Оператор верхнего уровня (с начала строки или после «;» — Vite приклеивает свой импорт к первой строке) с await: import() в нём ждёт модуль до своего исполнения.
    const awaited = /(?:^|;)(?:export )?(?:const|let|var)\b[^\n]*\bawait\b[\s\S]*?;$/gm;
    for (const seen = new Set(); ;) {
      const fresh = [...start].filter(f => !seen.has(f));
      if (!fresh.length) break;
      for (const f of fresh) {
        seen.add(f);
        for (const id of bundle[f].moduleIds) {
          for (const stmt of this.getModuleInfo(id)?.code?.match(awaited) ?? []) {
            for (const [, spec] of stmt.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
              const file = chunkOf.get((await this.resolve(spec, id))?.id);
              if (file && !start.has(file)) { start.add(file); visit(file); }
            }
          }
        }
      }
    }
    const bytes = f => Buffer.byteLength(bundle[f].code ?? bundle[f].source ?? '');
    // По сети (планшет по --lan) идёт gzip: рядом с размером — сжатый, как его отдаёт сервер.
    const gz = f => gzipSync(bundle[f].code ?? bundle[f].source ?? '').length;
    const sum = fn => [...start].reduce((a, f) => a + fn(f), 0);
    console.log(`\nпосле минификации: основной кусок ${kb(bytes(entry.fileName))} (gzip ${kb(gz(entry.fileName)).trim()}); старт (до первой отрисовки, ${start.size} кусков) ${kb(sum(bytes))} (gzip ${kb(sum(gz)).trim()})`);
    mainBytes = bytes(entry.fileName);
    for (const f of start) if (f !== entry.fileName) console.log(`${kb(bytes(f))}  ${f}`);
    console.log(`\nосновной кусок ${entry.fileName}: ${kb(total)} в ${mods.length} модулях (до сжатия, без обвязки)\n\nпо каталогам:`);
    for (const [d, s] of [...byDir].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${kb(s)}  ${d}`);
    console.log(`\nмодули, первые ${top}:`);
    for (const m of mods.sort((a, b) => b.size - a.size).slice(0, top)) console.log(`${kb(m.size)}  ${m.id}`);
  },
};
await build({ logLevel: 'warn', plugins: [report] });
if (budget !== undefined && mainBytes > budget * 1024) {
  console.error(`\nосновной кусок ${(mainBytes / 1024).toFixed(1)} КБ — больше бюджета ${budget} КБ`);
  process.exit(1);
}
