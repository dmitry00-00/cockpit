#!/usr/bin/env node
// Магические предметы SRD 5.1 из открытого API (https://www.dnd5eapi.co/api/2014/magic-items/<index>, CC-BY-4.0):
// строка вида и редкости и текст — дословно. Пишет content/srd/magic-items.json; руками не править — перезапустить:
// `node scripts/import-srd-magic-items.mjs`. Варианты API («Armor, +1», «Potion of Greater Healing») — не отдельные
// записи: SRD печатает один предмет («Armor, +1, +2, or +3»), имена вариантов лежат в нём списком.
// Сеть нужна только импортёру; продукт читает JSON. Ошибка сети — ошибка импорта, частичный файл не пишется.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'content/srd/magic-items.json');
const API = 'https://www.dnd5eapi.co/api/2014/magic-items';

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/**
 * «Ring, rare (requires attunement by a cleric)» → настройка и кто может; «(requires attunement outdoors at night)» —
 * условие (Ring of Shooting Stars); без «requires» — без настройки.
 */
function attunementOf(typeLine) {
  const m = /\(requires attunement(?: by ([^)]+)| ([^)]+))?\)/.exec(typeLine);
  if (!m) return { required: false };
  return { required: true, ...(m[1] ? { by: m[1] } : {}), ...(m[2] ? { when: m[2] } : {}) };
}

function itemOf(m) {
  const [typeLine, ...text] = m.desc;
  return {
    id: m.index,
    name: m.name,
    category: m.equipment_category.index,
    typeLine,
    rarity: m.rarity.name.toLowerCase(),
    attunement: attunementOf(typeLine),
    variants: m.variants.map(v => v.name),
    text: text.join('\n\n'),
    source: `SRD 5.1 (CC-BY-4.0) · ${API}/${m.index}`,
  };
}

const list = await get(API);
const items = {};
for (const { index } of list.results) {
  const raw = await get(`${API}/${index}`);
  if (raw.variant) continue;
  items[index] = itemOf(raw);
  process.stdout.write(`${index} → ${items[index].name} (${items[index].rarity})\n`);
}
await mkdir(dirname(OUT), { recursive: true });
const out = { source: `SRD 5.1 (CC-BY-4.0) via ${API}`, fetchedAt: new Date().toISOString().slice(0, 10), items };
await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${Object.keys(items).length} предметов → ${OUT}`);
