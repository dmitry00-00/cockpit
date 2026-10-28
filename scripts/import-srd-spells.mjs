#!/usr/bin/env node
// Заклинания SRD 5.1 из открытого API (https://www.dnd5eapi.co/api/2014/spells, CC-BY-4.0) — задача Q9.
// Пишет content/srd/spells.json: все 319 заклинаний SRD, текст дословно (абзацы desc и higher_level — как в SRD),
// английские имена — по ним ищут в книгах. Списки классов — из поля `classes` каждого заклинания (это списки
// заклинаний классов SRD); заклинания подклассов SRD (домен Жизни, клятва Преданности, круг Земли по местности,
// покровитель Исчадие) — из /subclasses/<id> с уровнем класса, с которого они даются.
// Руками не править — перезапустить: `node scripts/import-srd-spells.mjs`. Сеть нужна только импортёру;
// ошибка сети — ошибка импорта, частичный файл не пишется.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'content/srd/spells.json');
const API = 'https://www.dnd5eapi.co/api/2014';

/** Подклассы SRD с собственными списками заклинаний: индекс API → класс. */
const SUBCLASSES = { life: 'cleric', devotion: 'paladin', land: 'druid', fiend: 'warlock' };

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Пул запросов: API отвечает быстро, но 319 последовательных запросов — минута; по восемь разом. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

function spellOf(s) {
  const out = {
    id: s.index,
    name: s.name,
    level: s.level,
    school: s.school.index,
    castingTime: s.casting_time,
    range: s.range,
    components: s.components,
    duration: s.duration,
    concentration: s.concentration,
    ritual: s.ritual,
    text: s.desc.join('\n\n'),
    classes: s.classes.map(c => c.index).sort(),
    source: 'srd',
  };
  if (s.material) out.material = s.material;
  if (s.higher_level?.length) out.higherLevel = s.higher_level.join('\n\n');
  return out;
}

const list = await get('/spells');
const raw = await pool(list.results, 8, r => get(`/spells/${r.index}`));
const spells = raw.map(spellOf).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
process.stdout.write(`${spells.length} заклинаний\n`);

/** Заклинания подкласса: уровень класса из пререквизита «Cleric 3»; у круга Земли — ещё местность. */
const subclassSpells = {};
for (const [sub, cls] of Object.entries(SUBCLASSES)) {
  const data = await get(`/subclasses/${sub}`);
  subclassSpells[sub] = {
    class: cls,
    name: data.name,
    spells: data.spells.map(e => {
      const lvl = e.prerequisites.find(p => p.type === 'level');
      const feature = e.prerequisites.find(p => p.type === 'feature');
      const out = { id: e.spell.index, classLevel: Number(/(\d+)$/.exec(lvl?.index ?? '')?.[1] ?? 1) };
      if (feature) out.terrain = feature.index.replace(/^circle-of-the-land-/, '');
      return out;
    }),
  };
  process.stdout.write(`${sub}: ${subclassSpells[sub].spells.length}\n`);
}

/**
 * Поправки к API там, где оно расходится с печатным SRD 5.1 — каждая со ссылкой. Без поправки жрец Жизни 7-го
 * уровня недосчитался бы заклинания домена.
 */
const FIXES = {
  // SRD 5.1, Cleric, Life Domain, таблица Life Domain Spells: «7th — death ward, guardian of faith» — API отдаёт только death ward.
  life: v => { if (!v.spells.some(s => s.id === 'guardian-of-faith')) v.spells.splice(v.spells.findIndex(s => s.id === 'death-ward') + 1, 0, { id: 'guardian-of-faith', classLevel: 7 }); },
};
for (const [sub, fix] of Object.entries(FIXES)) fix(subclassSpells[sub]);

const ids = new Set(spells.map(s => s.id));
for (const [sub, v] of Object.entries(subclassSpells)) {
  for (const s of v.spells) if (!ids.has(s.id)) throw new Error(`${sub}: заклинания ${s.id} нет в списке SRD`);
}

await mkdir(dirname(OUT), { recursive: true });
const out = {
  source: `SRD 5.1 (CC-BY-4.0) via ${API}/spells`,
  fetchedAt: new Date().toISOString().slice(0, 10),
  spells,
  subclassSpells,
};
await writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`→ ${OUT}`);
