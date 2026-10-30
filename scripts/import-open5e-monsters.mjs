#!/usr/bin/env node
// Блоки монстров не из SRD 5.1 с открытой лицензией — через Open5e API v2 (https://api.open5e.com/v2/creatures/):
//   bf  — Black Flag SRD (Kobold Press, CC BY 4.0), 360 блоков → content/bf/monsters.json;
//   a5e — A5E SRD, Monstrous Menagerie (EN Publishing, CC BY 4.0 по a5esrd.com), 586 блоков → content/a5e/monsters.json.
// Решение владельца 27.10.2026: «монстры Black Flag и A5E для разнообразия встреч». Форма — как у SRD
// (src/rules/srd/monsters.ts), текст умений дословно, разметка Markdown Open5e («_Hit:_», «**…**») снята; числа атак —
// из разобранных полей API. Id — с приставкой библиотеки («bf-bandit», «a5e-bandit»): имена совпадают с SRD, блоки — нет.
// Руками не править — перезапустить: `node scripts/import-open5e-monsters.mjs bf` (или a5e). Ошибка сети — ошибка импорта.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.open5e.com/v2/creatures/';
const LIBS = {
  bf: { doc: 'bfrd', v1: 'blackflag', out:'content/bf/monsters.json', label: 'Black Flag SRD (CC-BY-4.0)',
    attribution: 'This work includes material from the Black Flag Reference Document (https://koboldpress.com/black-flag-reference-document/) by Open Design LLC d/b/a Kobold Press, available under the Creative Commons Attribution 4.0 License (https://creativecommons.org/licenses/by/4.0/).' },
  a5e: { doc: 'a5e-mm', out: 'content/a5e/monsters.json', label: 'A5E SRD Monstrous Menagerie (CC-BY-4.0)',
    attribution: 'This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing and available at A5ESRD.com, based on Level Up: Advanced 5th Edition, available at www.levelup5e.com. The A5ESRD is licensed under the Creative Commons Attribution 4.0 International License.' },
};
const lib = LIBS[process.argv[2]];
if (!lib) throw new Error(`библиотека: ${Object.keys(LIBS).join(' | ')}`);
const prefix = process.argv[2];

const ABILITY = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const cr = n => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n));
const pb = n => Math.max(2, Math.ceil(n / 4) + 1);
/**
 * Разметка Markdown Open5e → текст блока: «_Melee Weapon Attack:_» → «Melee Weapon Attack:». В блоках A5E Open5e
 * потерял запятые — на их месте двойной пробел («If the target is a creature  it makes…»): возвращаем запятую.
 * Потерянные апострофы («creatures saving throw») так не восстановить — они остаются как есть.
 */
const plain = s => (s ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1$2').replace(/\*([^*]+)\*/g, '$1')
  .replace(/(\S) {2}(?=\S)/g, '$1, ').trim();
const formula = s => s.replace(/([+-])/g, ' $1 ').replace(/\s+/g, ' ').trim();

function usageOf(u) {
  if (!u) return '';
  if (u.type === 'RECHARGE_ON_ROLL') return ` (Recharge ${u.param}${u.param < 6 ? '–6' : ''})`;
  if (u.type === 'PER_DAY') return ` (${u.param}/Day)`;
  if (u.type === 'RECHARGE_AFTER_REST') return ' (Recharges after a Short or Long Rest)';
  return '';
}

function actionOf(a) {
  const cost = a.legendary_action_cost > 1 ? ` (Costs ${a.legendary_action_cost} Actions)` : '';
  const out = { name: `${a.name}${usageOf(a.usage_limits)}${cost}`, text: plain(a.desc) };
  const atk = a.attacks?.[0];
  // Легендарное «uses its Bite attack» несёт в API разбор атаки, но текста атаки в нём нет — числа только там, где «to hit».
  if (atk && typeof atk.to_hit_mod === 'number' && /to hit/.test(out.text)) {
    const attack = { toHit: atk.to_hit_mod };
    if (atk.reach) attack.reach = atk.reach;
    if (atk.range) attack.range = [atk.range, atk.long_range ?? atk.range];
    // Урон — из текста блока, как печатает книга: у Open5e тип первого урона часто пуст, а «extra» — второй урон.
    const hit = /Hit: (\d+) \(([^)]+)\) (\w+) damage/.exec(out.text);
    const flat = hit ? null : /Hit: (\d+) (\w+) damage/.exec(out.text);
    if (hit) {
      attack.damage = formula(hit[2]);
      attack.average = Number(hit[1]);
      attack.damageType = hit[3];
    } else if (flat) {
      attack.damage = flat[1];
      attack.average = Number(flat[1]);
      attack.damageType = flat[2];
    } else if (atk.damage_die_count && atk.damage_die_type) {
      const die = Number(atk.damage_die_type.slice(1));
      const bonus = atk.damage_bonus ?? 0;
      attack.damage = formula(`${atk.damage_die_count}d${die}${bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : ''}`);
      attack.average = Math.floor((atk.damage_die_count * (die + 1)) / 2) + bonus;
      attack.damageType = (atk.damage_type ?? atk.extra_damage_type)?.key ?? '';
    }
    out.attack = attack;
  }
  return out;
}

function speedOf(sp) {
  const walk = sp.walk ?? 0;
  const parts = [`${walk} ft.`];
  for (const k of ['burrow', 'climb', 'fly', 'swim']) if (sp[k]) parts.push(`${k} ${sp[k]} ft.${k === 'fly' && sp.hover ? ' (hover)' : ''}`);
  return { walk, text: parts.join(', ') };
}

function sensesOf(c) {
  const parts = [];
  for (const k of ['blindsight', 'darkvision', 'tremorsense', 'truesight']) if (c[`${k}_range`]) parts.push(`${k} ${c[`${k}_range`]} ft.`);
  parts.push(`passive Perception ${c.passive_perception}`);
  return parts.join(', ');
}

/** Вводный абзац A5E, отданный как действие: «The aboleth can take 2 legendary actions», «The medusa queen has one legendary action…». */
const LEGENDARY_HEAD = /^The .+ (?:can take|has) \w+ legendary actions?\b/;
/** Вводные абзацы Black Flag из Open5e v1 по имени блока; у A5E — пусто (он в самом блоке). */
const INTROS = {};
if (lib.v1) {
  for (let url = `https://api.open5e.com/v1/monsters/?document__slug=${lib.v1}&limit=400&format=json`; url;) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open5e v1 ${lib.v1}: HTTP ${res.status}`);
    const page = await res.json();
    for (const c of page.results) if (c.legendary_desc) INTROS[c.name] = c.legendary_desc;
    url = page.next;
  }
}

const listOf = s => (s ? [s] : []);
const byOrder = (a, b) => (a.order_in_statblock ?? 0) - (b.order_in_statblock ?? 0);

function monsterOf(c) {
  const id = `${prefix}-${c.key.replace(/^[^_]+_/, '')}`;
  const ri = c.resistances_and_immunities ?? {};
  const acts = [...(c.actions ?? [])].sort(byOrder);
  const kind = t => acts.filter(a => a.action_type === t).map(actionOf);
  const speed = speedOf(c.speed ?? {});
  const legendary = kind('LEGENDARY_ACTION');
  const bonus = kind('BONUS_ACTION');
  // Вводный абзац легендарных действий (Q13): у A5E Open5e v2 кладёт его первым «действием» — имя «The dragon can take
  // 3 legendary actions», текст «Only one legendary action… regains…»; склеиваем точкой обратно в абзац. У Black Flag
  // v2 его нет — он в Open5e v1 (документ blackflag, legendary_desc), по имени блока.
  const head = legendary[0] && LEGENDARY_HEAD.test(legendary[0].name) ? legendary.shift() : null;
  const legendaryIntro = !legendary.length ? null : head ? `${head.name}. ${head.text}` : INTROS[c.name];
  if (legendary.length && !legendaryIntro) throw new Error(`${c.name}: нет вводного абзаца легендарных действий`);
  return {
    id,
    name: c.name,
    size: c.size.name,
    type: c.subcategory ? `${c.type.name.toLowerCase()} (${c.subcategory})` : c.type.name.toLowerCase(),
    alignment: c.alignment ?? '',
    ac: { value: c.armor_class, source: c.armor_detail ?? '' },
    hp: { average: c.hit_points, formula: c.hit_dice ? formula(c.hit_dice) : '' },
    speed: speed.walk,
    speedText: speed.text,
    abilities: Object.fromEntries(Object.entries(ABILITY).map(([k, v]) => [v, c.ability_scores[k]])),
    // Black Flag в Open5e несёт спасброски всех шести, в том числе без владения (= модификатор) — блок печатает только отличные.
    savingThrows: Object.fromEntries(Object.entries(c.saving_throws ?? {})
      .filter(([k, v]) => v !== Math.floor((c.ability_scores[k] - 10) / 2)).map(([k, v]) => [ABILITY[k], v])),
    skills: Object.fromEntries(Object.entries(c.skill_bonuses ?? {}).map(([k, v]) => [k.replace(/_/g, '-'), v])),
    damageVulnerabilities: listOf(ri.damage_vulnerabilities_display),
    damageResistances: listOf(ri.damage_resistances_display),
    damageImmunities: listOf(ri.damage_immunities_display),
    conditionImmunities: ri.condition_immunities_display ? ri.condition_immunities_display.split(/,\s*/).map(s => s.toLowerCase()) : [],
    senses: sensesOf(c),
    languages: c.languages?.as_string ?? '',
    cr: cr(c.challenge_rating),
    xp: c.experience_points ?? 0,
    proficiencyBonus: c.proficiency_bonus ?? pb(c.challenge_rating),
    traits: (c.traits ?? []).map(t => ({ name: t.name, text: plain(t.desc) })),
    actions: kind('ACTION'),
    reactions: kind('REACTION'),
    ...(bonus.length ? { bonusActions: bonus } : {}),
    ...(legendary.length ? { legendaryIntro, legendary } : {}),
    origin: prefix,
    source: `${lib.label} · ${API}${c.key}/`,
  };
}

const all = [];
let url = `${API}?document__key=${lib.doc}&limit=200&format=json`;
while (url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const page = await res.json();
  all.push(...page.results);
  url = page.next;
}
all.sort((a, b) => a.name.localeCompare(b.name));
const monsters = {};
for (const c of all) {
  const m = monsterOf(c);
  if (monsters[m.id]) throw new Error(`повтор id ${m.id}`);
  monsters[m.id] = m;
}
const OUT = resolve(ROOT, lib.out);
await mkdir(dirname(OUT), { recursive: true });
const out = { source: `${lib.label} via ${API}?document__key=${lib.doc}`, attribution: lib.attribution, fetchedAt: new Date().toISOString().slice(0, 10), monsters };
await writeFile(OUT, `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(monsters).length} блоков → ${OUT}`);
