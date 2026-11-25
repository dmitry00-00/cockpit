#!/usr/bin/env node
// Снаряжение и старт классов SRD 5.1 из открытого API (https://www.dnd5eapi.co/api/2014, CC-BY-4.0).
// Пишет content/srd/equipment.json:
//   items      — всё оружие и доспехи SRD, наборы снаряжения с содержимым и всё, на что ссылаются стартовые наборы
//                и категории выбора (фокусировки, священные символы, музыкальные инструменты, инструменты);
//   categories — категории «любое простое оружие», «любое воинское рукопашное», «священный символ»… → id предметов;
//   classes    — по классу SRD: стартовое снаряжение (обязательное + выборы а/б/в как в SRD, с текстом SRD дословно),
//                владение оружием (категории и отдельные виды), заклинательная характеристика и по уровням —
//                известные заговоры и заклинания (то, чего в таблицах компендиума нет числом: заговоры колдуна);
//                умения 1–2-го уровня с выбором из SRD (избранный враг, исследователь природы, предок дракона).
// Руками не править — перезапустить: `npm run import:srd -- equipment`. Ошибка сети — ошибка импорта.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const API = getSrdImportDefinition('equipment').apiBase;
const CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
/** Категории, из которых стартовые наборы предлагают «любое …»; плюс все оружие и доспехи целиком. */
const CATEGORIES = [
  'simple-weapons', 'martial-weapons', 'simple-melee-weapons', 'martial-melee-weapons', 'simple-ranged-weapons', 'martial-ranged-weapons',
  'holy-symbols', 'druidic-foci', 'arcane-foci', 'musical-instruments', 'armor', 'weapon',
];
/** Умения с выбором из SRD, которые нужны при создании (уровень ≤ 2), — индекс API. Боевые стили — из таблиц владельца. */
const CHOICE_FEATURES = ['favored-enemy-1-type', 'natural-explorer-1-terrain-type', 'dragon-ancestor'];

const cache = new Map();
async function get(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const json = await res.json();
  cache.set(path, json);
  return json;
}

const cost = c => (c ? `${c.quantity} ${c.unit}` : undefined);

/** Предмет SRD → запись: числа как в таблицах SRD, текст (desc) дословно, если есть. */
function itemOf(e) {
  const out = { id: e.index, name: e.name, kind: 'gear' };
  if (e.weapon_category) {
    out.kind = 'weapon';
    out.weapon = {
      category: e.weapon_category.toLowerCase(),
      range: e.weapon_range.toLowerCase(),
      damage: e.damage?.damage_dice ?? null,
      damageType: e.damage?.damage_type?.index ?? null,
      properties: (e.properties ?? []).map(p => p.index),
    };
    if (e.two_handed_damage) out.weapon.versatile = e.two_handed_damage.damage_dice;
    if (e.weapon_range === 'Ranged' || e.throw_range) {
      const r = e.weapon_range === 'Ranged' ? e.range : e.throw_range;
      if (r?.long) out.weapon.rangeFt = [r.normal, r.long];
    }
  } else if (e.armor_category) {
    out.kind = e.armor_category === 'Shield' ? 'shield' : 'armor';
    out.armor = { category: e.armor_category.toLowerCase(), baseAc: e.armor_class.base, strength: e.str_minimum || null, stealthDisadvantage: e.stealth_disadvantage };
  } else if (e.gear_category?.index === 'equipment-packs') {
    out.kind = 'pack';
    out.contents = e.contents.map(c => ({ id: c.item.index, qty: c.quantity }));
  } else if (e.tool_category) {
    out.kind = 'tool';
  } else if (['arcane-foci', 'druidic-foci', 'holy-symbols'].includes(e.gear_category?.index)) {
    out.kind = 'focus';
  }
  if (cost(e.cost)) out.cost = cost(e.cost);
  if (typeof e.weight === 'number') out.weight = e.weight;
  if (e.desc?.length) out.text = e.desc.join('\n\n');
  return out;
}

/** Вариант выбора API → части: предмет с количеством или «выбрать N из категории». */
function partsOf(opt) {
  switch (opt.option_type) {
    case 'counted_reference': {
      const part = { item: opt.of.index, qty: opt.count };
      if (opt.prerequisites?.some(p => p.type === 'proficiency')) part.ifProficient = true;
      return [part];
    }
    case 'reference':
      return [{ item: opt.item.index, qty: 1 }];
    case 'multiple':
      return opt.items.flatMap(partsOf);
    case 'choice': {
      const from = opt.choice.from;
      if (from.option_set_type !== 'equipment_category') throw new Error(`выбор без категории: ${JSON.stringify(opt).slice(0, 200)}`);
      return [{ pick: from.equipment_category.index, qty: opt.choice.choose }];
    }
    default:
      throw new Error(`неизвестный вид варианта ${opt.option_type}`);
  }
}

function choiceOf(o) {
  const from = o.from;
  if (from.option_set_type === 'equipment_category') return { text: o.desc, options: [[{ pick: from.equipment_category.index, qty: o.choose }]] };
  if (o.choose !== 1) throw new Error(`выбор ${o.desc}: choose ${o.choose}`);
  return { text: o.desc, options: from.options.map(partsOf) };
}

const items = {};
async function addItem(index) {
  if (items[index]) return;
  const e = await get(`/equipment/${index}`);
  items[index] = itemOf(e);
  for (const c of items[index].contents ?? []) await addItem(c.id);
}

const categories = {};
for (const cat of CATEGORIES) {
  const data = await get(`/equipment-categories/${cat}`);
  // В категории попадают и магические предметы (/magic-items) — их не берём: стартовое снаряжение немагическое.
  const ids = data.equipment.filter(e => e.url.includes('/equipment/')).map(e => e.index);
  for (const id of ids) await addItem(id);
  categories[cat] = ids;
}

/** Владение оружием по классу: категории (simple / martial) и отдельные виды — id предметов. */
async function weaponProfOf(cls) {
  const out = { categories: [], items: [] };
  for (const p of cls.proficiencies) {
    if (p.index === 'simple-weapons') out.categories.push('simple');
    else if (p.index === 'martial-weapons') out.categories.push('martial');
    else {
      const prof = await get(`/proficiencies/${p.index}`);
      if (prof.type === 'Weapons' && prof.reference?.url.includes('/equipment/')) out.items.push(prof.reference.index);
    }
  }
  return out;
}

const classes = {};
for (const c of CLASSES) {
  const cls = await get(`/classes/${c}`);
  const levels = await get(`/classes/${c}/levels`);
  const fixed = cls.starting_equipment.map(e => ({ item: e.equipment.index, qty: e.quantity }));
  const choices = cls.starting_equipment_options.map(choiceOf);
  for (const part of [...fixed, ...choices.flatMap(ch => ch.options.flat())]) if (part.item) await addItem(part.item);
  const entry = { name: cls.name, equipment: { fixed, choices }, weapons: await weaponProfOf(cls) };
  if (cls.spellcasting) {
    const sc = await get(`/classes/${c}/spellcasting`);
    entry.spellcasting = { ability: sc.spellcasting_ability.index, level: sc.level };
  }
  const byLevel = {};
  for (const l of levels.filter(x => !x.subclass)) {
    const s = l.spellcasting;
    if (!s) continue;
    const row = {};
    if (typeof s.cantrips_known === 'number') row.cantrips = s.cantrips_known;
    if (typeof s.spells_known === 'number') row.known = s.spells_known;
    if (Object.keys(row).length) byLevel[l.level] = row;
  }
  if (Object.keys(byLevel).length) entry.spellsByLevel = byLevel;
  classes[c] = entry;
  process.stdout.write(`${c}: ${fixed.length} обязательных, ${choices.length} выборов\n`);
}

/** Умения с выбором: текст SRD дословно, варианты — строками API (типы врагов, местности) или подумениями (предки). */
const features = {};
for (const idx of CHOICE_FEATURES) {
  const f = await get(`/features/${idx}`);
  const spec = Object.values(f.feature_specific ?? {})[0];
  const from = spec.from.options;
  const options = [];
  for (const o of from) {
    if (typeof o === 'string') options.push({ id: o, name: o });
    else {
      const sub = await get(`/features/${o.item.index}`);
      options.push({ id: o.item.index, name: sub.name.replace(/^[^:]+:\s*/, ''), text: sub.desc.join('\n\n') });
    }
  }
  features[idx] = { name: f.name, class: f.class.index, subclass: f.subclass?.index, level: f.level, choose: spec.choose, text: f.desc.join('\n\n'), options };
  process.stdout.write(`${idx}: ${options.length} вариантов\n`);
}

/** Поправки к API там, где оно расходится с печатным SRD 5.1 — со ссылкой; текст выбора — SRD, вариант чинится под него. */
const FIXES = {
  // SRD 5.1, Paladin, Equipment: «(a) five javelins or (b) any simple melee weapon» — API предлагает любое простое (simple-weapons).
  paladin: c => { c.equipment.choices.find(ch => ch.text.includes('simple melee')).options[1][0].pick = 'simple-melee-weapons'; },
};
for (const [c, fix] of Object.entries(FIXES)) fix(classes[c]);
// Сторож: текст «simple melee» / «martial melee» должен совпадать с категорией выбора.
for (const [c, v] of Object.entries(classes)) {
  for (const ch of v.equipment.choices) {
    for (const part of ch.options.flat()) {
      if (!part.pick) continue;
      const melee = part.pick.endsWith('melee-weapons');
      if (/(simple|martial) melee weapon/.test(ch.text) !== melee && /weapon/.test(part.pick)) throw new Error(`${c}: «${ch.text}» ↔ ${part.pick}`);
    }
  }
}

const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b)));
await writeSrdImport('equipment', { items: sorted, categories, classes, features });
console.log(`${Object.keys(items).length} предметов обработано`);
