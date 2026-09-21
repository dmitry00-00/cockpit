#!/usr/bin/env node
// Библиотека монстров SRD 5.1 из открытого API (https://www.dnd5eapi.co/api/2014/monsters/<index>, CC-BY-4.0):
// текст умений, действий и реакций дословно, числа — из блока, не пересчитаны. Пишет content/srd/monsters.json;
// руками не править — перезапустить: `node scripts/import-srd-monsters.mjs`. Набор — стартовый для Sword Coast
// пятого уровня (сид §13: бандиты, ликантропы, нежить Old Owl Well, головорезы Zhentarim, гоблиноиды, звери).
// Сеть нужна только импортёру; продукт читает JSON. Ошибка сети — ошибка импорта, частичный файл не пишется.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'content/srd/monsters.json');
const API = 'https://www.dnd5eapi.co/api/2014/monsters';

/** Индексы API в порядке показа: люди и NPC, гоблиноиды, звери, нежить, великаны и прочие. Формы ликантропа — три блока. */
const INDICES = [
  'commoner', 'acolyte', 'guard', 'noble', 'bandit', 'bandit-captain', 'thug', 'cultist', 'spy', 'scout', 'priest', 'berserker', 'veteran', 'knight', 'mage', 'druid',
  'kobold', 'goblin', 'hobgoblin', 'bugbear', 'orc', 'gnoll',
  'giant-rat', 'swarm-of-rats', 'wolf', 'worg', 'dire-wolf', 'black-bear', 'brown-bear', 'giant-spider', 'owlbear',
  'werewolf-human', 'werewolf-hybrid', 'werewolf-wolf', 'harpy',
  'skeleton', 'zombie', 'ghoul', 'ghast', 'shadow', 'specter', 'wight',
  'ogre', 'troll', 'hill-giant',
];

const ABILITY = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

/**
 * Поправки к API там, где оно расходится с печатным SRD 5.1 и с самим блоком. Каждая — со ссылкой на страницу SRD;
 * без поправки блок не сходится сам с собой (пассивное внимание 13 при WIS 12 требует Perception +3).
 */
const FIXES = {
  // SRD 5.1, Appendix MM-A, Black Bear: «Skills Perception +3», «Senses passive Perception 13» — API отдаёт proficiencies: [].
  'black-bear': m => { m.skills.perception = 3; },
};
const SENSE_ORDER = ['blindsight', 'darkvision', 'tremorsense', 'truesight'];

/** «10d8+20» → «10d8 + 20», «2d6-2» → «2d6 - 2» — как печатает SRD. */
const formula = s => s.replace(/([+-])/g, ' $1 ').replace(/\s+/g, ' ').trim();

const cr = n => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n));

function acOf(entries) {
  const first = entries[0];
  const source = first.type === 'natural' ? 'natural armor'
    : first.type === 'armor' ? (first.armor ?? []).map(a => a.name.toLowerCase()).join(', ')
      : first.type === 'spell' ? (first.spell?.name ?? 'spell').toLowerCase()
        : first.type === 'condition' ? (first.condition?.name ?? 'condition').toLowerCase()
          : first.type;
  return { value: first.value, source };
}

function speedOf(speed) {
  const walk = Number.parseInt(speed.walk ?? '0', 10);
  const text = Object.entries(speed).map(([k, v]) => (k === 'walk' ? v : `${k} ${v}`)).join(', ');
  return { walk, text };
}

function sensesOf(senses) {
  const parts = SENSE_ORDER.filter(k => senses[k]).map(k => `${k} ${senses[k]}`);
  parts.push(`passive Perception ${senses.passive_perception}`);
  return parts.join(', ');
}

function usageOf(u) {
  if (!u) return '';
  if (u.type === 'per day') return ` (${u.times}/Day)`;
  if (u.type === 'recharge on roll') return ` (Recharge ${u.min_value}${u.min_value < 6 ? '–6' : ''})`;
  if (u.type === 'recharge after rest') return ' (Recharges after a Short or Long Rest)';
  return '';
}

/** Абзац действия: имя с пометкой использования, текст дословно; у атаки — разобранные числа для стола. */
function actionOf(a) {
  const out = { name: `${a.name}${usageOf(a.usage)}`, text: a.desc };
  if (typeof a.attack_bonus === 'number') {
    const reach = /reach (\d+) ft\./.exec(a.desc);
    const range = /range (\d+)\/(\d+) ft\./.exec(a.desc);
    const hit = /Hit: (\d+) \(([^)]+)\) (\w+) damage/.exec(a.desc);
    const first = a.damage?.[0];
    const attack = { toHit: a.attack_bonus };
    if (reach) attack.reach = Number(reach[1]);
    if (range) attack.range = [Number(range[1]), Number(range[2])];
    // Атака без урона (паутина гигантского паука) — только бонус и дальность.
    if (hit || first) {
      attack.damage = formula(first?.damage_dice ?? hit?.[2] ?? '');
      attack.average = hit ? Number(hit[1]) : 0;
      attack.damageType = first?.damage_type?.index ?? hit?.[3] ?? '';
    }
    out.attack = attack;
  }
  return out;
}

function monsterOf(m) {
  const savingThrows = {};
  const skills = {};
  for (const p of m.proficiencies) {
    const idx = p.proficiency.index;
    if (idx.startsWith('saving-throw-')) savingThrows[idx.slice('saving-throw-'.length)] = p.value;
    else if (idx.startsWith('skill-')) skills[idx.slice('skill-'.length)] = p.value;
  }
  const speed = speedOf(m.speed);
  return {
    id: m.index,
    name: m.name,
    size: m.size,
    type: m.subtype ? `${m.type} (${m.subtype})` : m.type,
    alignment: m.alignment,
    ac: acOf(m.armor_class),
    hp: { average: m.hit_points, formula: formula(m.hit_points_roll) },
    speed: speed.walk,
    speedText: speed.text,
    abilities: Object.fromEntries(Object.entries(ABILITY).map(([k, v]) => [v, m[k]])),
    savingThrows,
    skills,
    damageVulnerabilities: m.damage_vulnerabilities,
    damageResistances: m.damage_resistances,
    damageImmunities: m.damage_immunities,
    conditionImmunities: m.condition_immunities.map(c => c.name.toLowerCase()),
    senses: sensesOf(m.senses),
    languages: m.languages,
    cr: cr(m.challenge_rating),
    xp: m.xp,
    proficiencyBonus: m.proficiency_bonus,
    traits: (m.special_abilities ?? []).map(actionOf),
    actions: (m.actions ?? []).map(actionOf),
    reactions: (m.reactions ?? []).map(actionOf),
    source: `SRD 5.1 (CC-BY-4.0) · ${API}/${m.index}`,
  };
}

async function fetchMonster(index) {
  const res = await fetch(`${API}/${index}`);
  if (!res.ok) throw new Error(`${index}: HTTP ${res.status}`);
  return res.json();
}

const monsters = {};
for (const index of INDICES) {
  const raw = await fetchMonster(index);
  monsters[index] = monsterOf(raw);
  FIXES[index]?.(monsters[index]);
  process.stdout.write(`${index} → ${monsters[index].name} (CR ${monsters[index].cr})\n`);
}
await mkdir(dirname(OUT), { recursive: true });
const out = {
  source: `SRD 5.1 (CC-BY-4.0) via ${API}`,
  fetchedAt: new Date().toISOString().slice(0, 10),
  monsters,
};
await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${INDICES.length} блоков → ${OUT}`);
