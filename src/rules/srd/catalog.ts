import equipmentData from '../../../content/srd/equipment.json';
import abilityScoreData from '../../../content/srd/ability-scores.json';
import actionData from '../../../content/srd/actions.json';
import backgroundData from '../../../content/srd/backgrounds.json';
import alignmentData from '../../../content/srd/alignments.json';
import classData from '../../../content/srd/classes.json';
import classOptionData from '../../../content/srd/class-options.json';
import conditionData from '../../../content/srd/conditions.json';
import featData from '../../../content/srd/feats.json';
import featureData from '../../../content/srd/features.json';
import languageData from '../../../content/srd/languages.json';
import multiclassingData from '../../../content/srd/multiclassing.json';
import monsterChallengeData from '../../../content/srd/monster-challenge-ratings.json';
import ruleSectionData from '../../../content/srd/rules.json';
import raceData from '../../../content/srd/races.json';
import subclassData from '../../../content/srd/subclasses.json';
import subraceData from '../../../content/srd/subraces.json';
import magicItemData from '../../../content/srd/magic-items.json';
import monsterData from '../../../content/srd/monsters.json';
import spellData from '../../../content/srd/spells.json';
import skillData from '../../../content/srd/skills.json';
import traitData from '../../../content/srd/traits.json';
import { BACKGROUNDS, CLASSES, FEATS, RACES } from '../compendium';
import { COVER, DIFFICULTY_CLASSES, LIGHT } from './checks';
import { TRAVEL_PACE_IDS } from './travel';

export const SRD_CATALOG_TYPES = [
  'monster', 'spell', 'magic-item', 'equipment', 'class', 'class-feature', 'class-option', 'subclass',
  'race', 'subrace', 'racial-trait', 'language', 'feat', 'background', 'condition', 'action', 'ability', 'skill', 'rule',
] as const;

export type SrdCatalogType = (typeof SRD_CATALOG_TYPES)[number];
export type SrdCatalogFilterType = SrdCatalogType | 'all';

export const SRD_BOOK_SECTIONS = [
  'Monsters', 'Spells', 'Magic Items', 'Equipment', 'Classes', 'Races', 'Languages', 'Feats', 'Backgrounds',
  'Appendix PH-A: Conditions', 'Combat', 'Combat: Actions in Combat', 'Alignment', 'Using Ability Scores', 'Spellcasting',
  'Using Ability Scores: Skills', 'Using Ability Scores: Ability Checks',
  'Spellcasting: Casting a Spell', 'Combat: Cover',
  'Adventuring: The Environment: Vision and Light', 'Adventuring: Time and Movement: Travel Pace',
  'Beyond 1st Level', 'Multiclassing', 'Adventuring', 'Appendix',
] as const;

export type SrdBookSection = (typeof SRD_BOOK_SECTIONS)[number];

export const SRD_CATALOG_TYPE_LABELS: Readonly<Record<SrdCatalogType, string>> = {
  monster: 'Монстр',
  spell: 'Заклинание',
  'magic-item': 'Магический предмет',
  equipment: 'Снаряжение',
  class: 'Класс',
  'class-feature': 'Черта класса',
  'class-option': 'Выбор класса',
  subclass: 'Подкласс',
  race: 'Раса',
  subrace: 'Подраса',
  'racial-trait': 'Черта расы',
  language: 'Язык',
  feat: 'Черта',
  background: 'Предыстория',
  condition: 'Состояние',
  action: 'Действие',
  ability: 'Характеристика',
  skill: 'Навык',
  rule: 'Правило',
};

export interface SrdCatalogRecord {
  /** Устойчивый ID в индексе: тип включён, поэтому одноимённые сущности разных типов не конфликтуют. */
  id: string;
  name: string;
  type: SrdCatalogType;
  /** Заголовок раздела SRD 5.1, откуда взята запись. */
  bookSection: SrdBookSection;
  /** Файл и устойчивый ключ исходной записи; каталог не хранит вторую копию правила. */
  sourceRef: string;
  source: 'System Reference Document 5.1';
  edition: 'D&D 5e / 2014';
  license: 'CC BY 4.0';
  layer: 'rules';
}

type NamedRecord = { id: string; name: string };
type DataMap<T extends NamedRecord> = { [key: string]: T };

const records: SrdCatalogRecord[] = [];

function add(type: SrdCatalogType, id: string, name: string, bookSection: SrdBookSection, sourceRef: string) {
  records.push({
    id: `${type}:${id}`,
    name,
    type,
    bookSection,
    sourceRef,
    source: 'System Reference Document 5.1',
    edition: 'D&D 5e / 2014',
    license: 'CC BY 4.0',
    layer: 'rules',
  });
}

function uniqueApiRecord(records: readonly NamedRecord[], name: string, context: string): NamedRecord {
  const matches = records.filter(record => record.name === name);
  if (matches.length !== 1) throw new Error(`${context}: ожидалась одна запись API с именем «${name}», найдено ${matches.length}`);
  return matches[0];
}

const monsters = monsterData.monsters as DataMap<NamedRecord>;
for (const monster of Object.values(monsters)) {
  add('monster', monster.id, monster.name, 'Monsters', `content/srd/monsters.json#monsters[id=${monster.id}]`);
}

for (const spell of spellData.spells) {
  if (spell.source !== 'srd') continue;
  add('spell', spell.id, spell.name, 'Spells', `content/srd/spells.json#spells[id=${spell.id}]`);
}

const magicItems = magicItemData.items as DataMap<NamedRecord>;
for (const item of Object.values(magicItems)) {
  add('magic-item', item.id, item.name, 'Magic Items', `content/srd/magic-items.json#items[id=${item.id}]`);
}

const equipment = equipmentData.items as DataMap<NamedRecord>;
for (const item of Object.values(equipment)) {
  add('equipment', item.id, item.name, 'Equipment', `content/srd/equipment.json#items[id=${item.id}]`);
}

for (const language of languageData.languages as NamedRecord[]) {
  add('language', language.id, language.name, 'Languages', `content/srd/languages.json#languages[id=${language.id}]`);
}

for (const alignment of alignmentData.alignments as Array<NamedRecord & { abbreviation: string }>) {
  add('rule', `alignment/${alignment.id}`, `${alignment.name} (${alignment.abbreviation})`, 'Alignment', `content/srd/alignments.json#alignments[id=${alignment.id}]`);
}
add('rule', 'character-advancement', 'Character Advancement', 'Beyond 1st Level', 'content/srd/character-advancement.json#levels');
for (const entry of multiclassingData.prerequisites) {
  add('rule', `multiclass-prerequisite/${entry.id}`, `Multiclass Prerequisite: ${entry.className}`, 'Multiclassing', `content/srd/multiclassing.json#prerequisites[id=${entry.id}]`);
}
for (const entry of multiclassingData.proficienciesGained) {
  add('rule', `multiclass-proficiencies/${entry.id}`, `Multiclass Proficiencies: ${entry.className}`, 'Multiclassing', `content/srd/multiclassing.json#proficienciesGained[id=${entry.id}]`);
}
for (const entry of multiclassingData.spellSlots) {
  add('rule', `multiclass-spell-slots/${entry.characterLevel}`, `Multiclass Spell Slots: Character Level ${entry.characterLevel}`, 'Multiclassing', `content/srd/multiclassing.json#spellSlots[characterLevel=${entry.characterLevel}]`);
}
for (const entry of monsterChallengeData.hitDiceBySize) {
  add('rule', `monster-hit-dice/${entry.id}`, `Monster Hit Die by Size: ${entry.size}`, 'Monsters', `content/srd/monster-challenge-ratings.json#hitDiceBySize[id=${entry.id}]`);
}
for (const entry of monsterChallengeData.challengeRatings) {
  add('rule', `monster-proficiency-bonus/${entry.id}`, `Monster Proficiency Bonus: CR ${entry.challenge}`, 'Monsters', `content/srd/monster-challenge-ratings.json#challengeRatings[id=${entry.id}]`);
  add('rule', `monster-xp/${entry.id}`, `Monster Experience Points: CR ${entry.challenge}`, 'Monsters', `content/srd/monster-challenge-ratings.json#challengeRatings[id=${entry.id}]`);
}
for (const entry of ruleSectionData.rules) {
  add('rule', `api/${entry.id}`, entry.name, entry.bookSection as SrdBookSection, `content/srd/rules.json#rules[id=${entry.id}]`);
}

for (const background of BACKGROUNDS) {
  if (background.source !== 'srd') continue;
  const source = uniqueApiRecord(backgroundData.backgrounds, background.name, `background ${background.id}`);
  add('background', background.id, background.name, 'Backgrounds', `content/srd/backgrounds.json#backgrounds[id=${source.id}]`);
}

for (const race of RACES) {
  if (race.source !== 'srd') continue;
  const apiRace = uniqueApiRecord(raceData.races, race.name, `race ${race.id}`);
  add('race', race.id, race.name, 'Races', `content/srd/races.json#races[id=${apiRace.id}]`);
  race.traits.forEach((trait, traitIndex) => {
    add('racial-trait', `${race.id}/${trait.id}/entry-${traitIndex}`, trait.name, 'Races', `content/compendium/races.json#race:${race.id}/traits/${trait.id}/entry-${traitIndex}`);
  });
  for (const subrace of race.subraces) {
    if (subrace.source !== 'srd') continue;
    const apiSubraceIdByName: Readonly<Record<string, string>> = {
      'High Elf': 'high-elf', 'Hill Dwarf': 'hill-dwarf', 'Rock Gnome': 'rock-gnome', Lightfoot: 'lightfoot-halfling',
    };
    const apiSubraceId = apiSubraceIdByName[subrace.name];
    const apiSubrace = subraceData.subraces.find(record => record.id === apiSubraceId);
    if (!apiSubrace) throw new Error(`subrace ${race.id}/${subrace.id}: нет точной записи в SRD API`);
    add('subrace', `${race.id}/${subrace.id}`, subrace.name, 'Races', `content/srd/subraces.json#subraces[id=${apiSubrace.id}]`);
    subrace.traits.forEach((trait, traitIndex) => {
      add('racial-trait', `${race.id}/${subrace.id}/${trait.id}/entry-${traitIndex}`, trait.name, 'Races', `content/compendium/races.json#race:${race.id}/subraces/${subrace.id}/traits/${trait.id}/entry-${traitIndex}`);
    });
  }
}

for (const cls of CLASSES) {
  if (cls.source !== 'srd') continue;
  const apiClass = uniqueApiRecord(classData.classes, cls.name, `class ${cls.id}`);
  add('class', cls.id, cls.name, 'Classes', `content/srd/classes.json#classes[id=${apiClass.id}]`);
  for (const level of cls.levels) {
    level.features.forEach((feature, featureIndex) => {
      add('class-feature', `${cls.id}/${feature.id}/level-${level.level}/entry-${featureIndex}`, feature.name, 'Classes', `content/compendium/classes.json#class:${cls.id}/levels/${level.level}/features/${feature.id}/entry-${featureIndex}`);
    });
  }
  for (const block of cls.options ?? []) {
    for (const option of block.items) {
      if (option.source !== 'srd') continue;
      add('class-option', `${cls.id}/${block.id}/${option.id}`, option.name, 'Classes', `content/compendium/classes.json#/classes/${cls.id}/options/${block.id}/${option.id}`);
    }
  }
  for (const subclass of cls.subclasses) {
    if (subclass.source !== 'srd') continue;
    const matches = subclassData.subclasses.filter(record => record.class?.index === apiClass.id);
    if (matches.length !== 1) throw new Error(`subclass ${cls.id}/${subclass.id}: ожидался один SRD-подкласс для ${apiClass.id}, найдено ${matches.length}`);
    const apiSubclass = matches[0];
    add('subclass', `${cls.id}/${subclass.id}`, subclass.name, 'Classes', `content/srd/subclasses.json#subclasses[id=${apiSubclass.id}]`);
    subclass.features.forEach((feature, featureIndex) => {
      add('class-feature', `${cls.id}/${subclass.id}/${feature.id}/level-${feature.level}/entry-${featureIndex}`, feature.name, 'Classes', `content/compendium/classes.json#class:${cls.id}/subclasses/${subclass.id}/features/${feature.id}/entry-${featureIndex}`);
    });
  }
}

for (const feat of FEATS) {
  if (feat.source !== 'srd') continue;
  const source = uniqueApiRecord(featData.feats, feat.name, `feat ${feat.id}`);
  add('feat', feat.id, feat.name, 'Feats', `content/srd/feats.json#feats[id=${source.id}]`);
}

for (const feature of featureData.features) {
  add('class-feature', `api/${feature.id}`, feature.name, 'Classes', `content/srd/features.json#features[id=${feature.id}]`);
}

for (const trait of traitData.traits) {
  add('racial-trait', `api/${trait.id}`, trait.name, 'Races', `content/srd/traits.json#traits[id=${trait.id}]`);
}

for (const option of classOptionData.classOptions) {
  add('class-option', `api/${option.id}`, option.name, 'Classes', `content/srd/class-options.json#classOptions[id=${option.id}]`);
}

for (const condition of conditionData.conditions) {
  add('condition', condition.id, condition.name, 'Appendix PH-A: Conditions', `content/srd/conditions.json#conditions[id=${condition.id}]`);
}

for (const action of actionData.actions) {
  add('action', action.id, action.name, 'Combat: Actions in Combat', `content/srd/actions.json#actions[id=${action.id}]`);
}

for (const ability of abilityScoreData.abilityScores) {
  add('ability', ability.id, ability.name, 'Using Ability Scores', `content/srd/ability-scores.json#abilityScores[id=${ability.id}]`);
}

for (const skill of skillData.skills) {
  add('skill', skill.id, skill.name, 'Using Ability Scores: Skills', `content/srd/skills.json#skills[id=${skill.id}]`);
}

for (const dc of DIFFICULTY_CLASSES) {
  add('rule', `ability-check-dc/${dc.dc}`, `${dc.label} (${dc.dc})`, 'Using Ability Scores: Ability Checks', 'src/rules/srd/checks.ts#DIFFICULTY_CLASSES');
}
add('rule', 'concentration', 'Concentration', 'Spellcasting: Casting a Spell', 'src/rules/srd/checks.ts#CONCENTRATION');
add('rule', 'cover/general', 'Cover', 'Combat: Cover', 'src/rules/srd/checks.ts#COVER_GENERAL');
for (const cover of Object.values(COVER)) {
  add('rule', `cover/${cover.id}`, cover.name, 'Combat: Cover', `src/rules/srd/checks.ts#COVER/${cover.id}`);
}
for (const light of Object.values(LIGHT)) {
  add('rule', `light/${light.id}`, light.name, 'Adventuring: The Environment: Vision and Light', `src/rules/srd/checks.ts#LIGHT/${light.id}`);
}
for (const id of TRAVEL_PACE_IDS) {
  const name = `${id[0].toUpperCase()}${id.slice(1)} Pace`;
  add('rule', `travel-pace/${id}`, name, 'Adventuring: Time and Movement: Travel Pace', `src/rules/srd/travel.ts#${id}`);
}

add('rule', 'ability-scores-and-modifiers', 'Ability Scores and Modifiers', 'Using Ability Scores', 'src/campaign/derive.ts#abilityMod');
add('rule', 'proficiency-bonus', 'Proficiency Bonus', 'Using Ability Scores', 'src/campaign/derive.ts#proficiencyBonusOf');
add('rule', 'advantage-and-disadvantage', 'Advantage and Disadvantage', 'Using Ability Scores', 'src/rules/srd/odds.ts#ODDS_RULES.advantage');
add('rule', 'skill-proficiency', 'Skill Proficiency', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#skillProficiency');
add('rule', 'saving-throw-proficiency', 'Saving Throw Proficiency', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#saveProficiency');
add('rule', 'expertise', 'Expertise', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#expertise');
add('rule', 'passive-checks', 'Passive Checks', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#passive');
add('rule', 'initiative', 'Initiative', 'Combat', 'src/rules/srd/sheetRules.ts#initiative');
add('rule', 'weapon-attack-ability', 'Ability for Weapon Attacks', 'Combat', 'src/rules/srd/sheetRules.ts#attackAbility');
add('rule', 'weapon-and-spell-attack-proficiency', 'Weapon and Spell Attack Proficiency', 'Combat', 'src/rules/srd/sheetRules.ts#weaponProficiency');
add('rule', 'natural-1-and-20', 'Natural 1 and 20', 'Combat', 'src/rules/srd/odds.ts#ODDS_RULES.rolling1or20');
add('rule', 'critical-hit-damage', 'Critical Hits', 'Combat', 'src/rules/srd/odds.ts#ODDS_RULES.criticalHits');
add('rule', 'resistance-and-vulnerability', 'Resistance and Vulnerability', 'Combat', 'src/rules/srd/odds.ts#ODDS_RULES.resistance');
add('rule', 'armor-class-from-armor', 'Armor Class from Armor', 'Equipment', 'src/rules/srd/sheetRules.ts#armorBase');
add('rule', 'armor-categories', 'Armor Categories', 'Equipment', 'src/rules/srd/armor.ts#ARMOR_RULES');
add('rule', 'shield', 'Shields', 'Equipment', 'src/rules/srd/armor.ts#ARMOR_RULES.shield');
add('rule', 'heavy-weapon-small-creature', 'Heavy Weapons and Small Creatures', 'Equipment', 'src/campaign/build.ts#HEAVY_RULE');
add('rule', 'coinage-and-exchange-rates', 'Coinage and Exchange Rates', 'Equipment', 'src/rules/srd/coins.ts#COINS');
add('rule', 'barbarian-unarmored-defense', 'Unarmored Defense (Barbarian)', 'Classes', 'src/rules/srd/sheetRules.ts#unarmoredBarbarian');
add('rule', 'monk-unarmored-defense', 'Unarmored Defense (Monk)', 'Classes', 'src/rules/srd/sheetRules.ts#unarmoredMonk');
add('rule', 'class-hit-points', 'Class Hit Points', 'Classes', 'src/rules/srd/classes.ts#HIT_POINTS_RULE');
add('rule', 'fixed-hit-point-gain', 'Fixed Hit Point Gain', 'Beyond 1st Level', 'src/rules/srd/sheetRules.ts#hpFixed');
add('rule', 'constitution-and-hit-points', 'Constitution Modifier and Hit Points', 'Beyond 1st Level', 'src/rules/srd/sheetRules.ts#conChange');
add('rule', 'ability-score-improvement', 'Ability Score Improvement', 'Beyond 1st Level', 'src/rules/srd/classes.ts#ASI_RULE');
add('rule', 'ability-score-cap', 'Ability Score Cap', 'Beyond 1st Level', 'src/rules/srd/classes.ts#ABILITY_SCORE_CAP');
add('rule', 'spell-save-dc', 'Spell Save DC', 'Spellcasting', 'src/rules/srd/sheetRules.ts#spellDcRule');
add('rule', 'spell-attack-modifier', 'Spell Attack Modifier', 'Spellcasting', 'src/rules/srd/sheetRules.ts#spellAttackRule');

export const SRD_CATALOG: readonly SrdCatalogRecord[] = Object.freeze(records);

export const SRD_CATALOG_TYPE_COUNTS: Readonly<Record<SrdCatalogType, number>> = Object.freeze(
  Object.fromEntries(SRD_CATALOG_TYPES.map(type => [type, records.filter(record => record.type === type).length])) as Record<SrdCatalogType, number>,
);

export function filterSrdCatalog(
  entries: readonly SrdCatalogRecord[],
  type: SrdCatalogFilterType = 'all',
  query = '',
): SrdCatalogRecord[] {
  const needle = query.trim().toLowerCase();
  return entries.filter(record =>
    (type === 'all' || record.type === type)
    && (!needle || `${record.name} ${record.id} ${record.bookSection}`.toLowerCase().includes(needle)),
  );
}
