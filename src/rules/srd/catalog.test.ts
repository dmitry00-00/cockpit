// @vitest-environment node
import { describe, expect, it } from 'vitest';
import characterAdvancementData from '../../../content/srd/character-advancement.json';
import abilityScoreData from '../../../content/srd/ability-scores.json';
import actionData from '../../../content/srd/actions.json';
import backgroundData from '../../../content/srd/backgrounds.json';
import alignmentData from '../../../content/srd/alignments.json';
import classData from '../../../content/srd/classes.json';
import classOptionData from '../../../content/srd/class-options.json';
import conditionData from '../../../content/srd/conditions.json';
import featData from '../../../content/srd/feats.json';
import featureData from '../../../content/srd/features.json';
import multiclassingData from '../../../content/srd/multiclassing.json';
import monsterChallengeData from '../../../content/srd/monster-challenge-ratings.json';
import ruleSectionData from '../../../content/srd/rules.json';
import raceData from '../../../content/srd/races.json';
import subclassData from '../../../content/srd/subclasses.json';
import subraceData from '../../../content/srd/subraces.json';
import skillData from '../../../content/srd/skills.json';
import traitData from '../../../content/srd/traits.json';
import {
  filterSrdCatalog,
  SRD_CATALOG,
  SRD_CATALOG_TYPE_COUNTS,
  SRD_CATALOG_TYPES,
  SRD_BOOK_SECTIONS,
} from './catalog';

describe('единый каталог SRD 5.1', () => {
  it('даёт каждой записи устойчивый тип, раздел, ID и ссылку на источник', () => {
    const ids = SRD_CATALOG.map(record => record.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const record of SRD_CATALOG) {
      expect(SRD_CATALOG_TYPES).toContain(record.type);
      expect(record.source).toBe('System Reference Document 5.1');
      expect(record.edition).toBe('D&D 5e / 2014');
      expect(record.license).toBe('CC BY 4.0');
      expect(record.layer).toBe('rules');
      expect(SRD_BOOK_SECTIONS).toContain(record.bookSection);
      expect(record.sourceRef.trim(), record.id).not.toBe('');
    }
  });

  it('индексирует основные локальные SRD-каталоги без потерь и книжных записей', () => {
    expect(SRD_CATALOG).toHaveLength(2115);
    expect(SRD_CATALOG_TYPE_COUNTS.monster).toBe(334);
    expect(SRD_CATALOG_TYPE_COUNTS.spell).toBe(319);
    expect(SRD_CATALOG_TYPE_COUNTS['magic-item']).toBe(239);
    expect(SRD_CATALOG_TYPE_COUNTS.equipment).toBe(122);
    expect(SRD_CATALOG_TYPE_COUNTS.race).toBe(9);
    expect(SRD_CATALOG_TYPE_COUNTS.class).toBe(12);
    expect(SRD_CATALOG_TYPE_COUNTS.subclass).toBe(12);
    expect(SRD_CATALOG_TYPE_COUNTS.feat).toBe(1);
    expect(SRD_CATALOG_TYPE_COUNTS.condition).toBe(15);
    expect(SRD_CATALOG_TYPE_COUNTS.action).toBe(10);
    expect(SRD_CATALOG_TYPE_COUNTS.background).toBe(1);
    expect(SRD_CATALOG_TYPE_COUNTS['class-feature']).toBeGreaterThan(0);
    expect(SRD_CATALOG_TYPE_COUNTS.rule).toBe(309);
    expect(SRD_CATALOG_TYPE_COUNTS['racial-trait']).toBe(65);
    expect(SRD_CATALOG_TYPE_COUNTS['class-feature']).toBe(573);
    expect(SRD_CATALOG_TYPE_COUNTS['class-option']).toBe(50);
    expect(SRD_CATALOG.every(record => !record.sourceRef.includes('influence.ts'))).toBe(true);
  });

  it('индексирует девять названий и сокращений раздела Alignment', () => {
    const alignments = SRD_CATALOG.filter(record => record.bookSection === 'Alignment');
    expect(alignments.map(record => record.name)).toEqual([
      'Lawful Good (LG)', 'Neutral Good (NG)', 'Chaotic Good (CG)',
      'Lawful Neutral (LN)', 'Neutral (N)', 'Chaotic Neutral (CN)',
      'Lawful Evil (LE)', 'Neutral Evil (NE)', 'Chaotic Evil (CE)',
    ]);
    expect(alignments.every(record => record.type === 'rule')).toBe(true);
    expect(alignments.every(record => record.sourceRef.startsWith('content/srd/alignments.json#alignments[id='))).toBe(true);
    expect(alignmentData.alignments.every(row => row.description.length > 0)).toBe(true);
  });

  it('указывает отдельный раздел Languages для всех локальных языков SRD', () => {
    const languages = SRD_CATALOG.filter(record => record.type === 'language');
    expect(languages).toHaveLength(16);
    expect(languages.every(record => record.bookSection === 'Languages')).toBe(true);
    expect(languages.every(record => record.sourceRef.startsWith('content/srd/languages.json#languages[id='))).toBe(true);
  });

  it('индексирует характеристики и навыки из снимков повторяемого API-импорта', () => {
    expect(abilityScoreData.abilityScores.map(row => row.id)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    expect(abilityScoreData.abilityScores.every(row => row.description.length > 0)).toBe(true);
    expect(skillData.skills).toHaveLength(18);
    expect(skillData.skills.every(row => row.description.length > 0)).toBe(true);
    for (const ability of abilityScoreData.abilityScores) {
      expect(SRD_CATALOG.find(row => row.type === 'ability' && row.id === `ability:${ability.id}`)?.sourceRef)
        .toBe(`content/srd/ability-scores.json#abilityScores[id=${ability.id}]`);
    }
    for (const skill of skillData.skills) {
      expect(SRD_CATALOG.find(row => row.type === 'skill' && row.id === `skill:${skill.id}`)?.sourceRef)
        .toBe(`content/srd/skills.json#skills[id=${skill.id}]`);
    }
  });

  it('указывает импортированные тексты состояний и действий', () => {
    expect(conditionData.conditions).toHaveLength(15);
    expect(conditionData.conditions.every(row => row.description.length > 0)).toBe(true);
    expect(actionData.actions).toHaveLength(10);
    expect(actionData.actions.every(row => row.description.length > 0)).toBe(true);
    expect(SRD_CATALOG.filter(row => row.type === 'condition').every(row => row.sourceRef.startsWith('content/srd/conditions.json#conditions[id='))).toBe(true);
    expect(SRD_CATALOG.filter(row => row.type === 'action').every(row => row.sourceRef.startsWith('content/srd/actions.json#actions[id='))).toBe(true);
  });

  it('индексирует расширенные семейства классов и рас из SRD API', () => {
    expect(backgroundData.backgrounds).toHaveLength(1);
    expect(classData.classes).toHaveLength(12);
    expect(classOptionData.classOptions).toHaveLength(25);
    expect(featData.feats).toHaveLength(1);
    expect(featureData.features).toHaveLength(407);
    expect(raceData.races).toHaveLength(9);
    expect(subclassData.subclasses).toHaveLength(12);
    expect(subraceData.subraces).toHaveLength(4);
    expect(traitData.traits).toHaveLength(38);
    for (const type of ['background', 'class', 'feat', 'race', 'subclass', 'subrace'] as const) {
      expect(SRD_CATALOG.filter(row => row.type === type).every(row => row.sourceRef.startsWith('content/srd/'))).toBe(true);
    }
    expect(SRD_CATALOG.filter(row => row.id.startsWith('class-feature:api/')).every(row => row.sourceRef.startsWith('content/srd/features.json#features[id='))).toBe(true);
    expect(SRD_CATALOG.filter(row => row.id.startsWith('racial-trait:api/')).every(row => row.sourceRef.startsWith('content/srd/traits.json#traits[id='))).toBe(true);
    expect(SRD_CATALOG.filter(row => row.id.startsWith('class-option:api/')).every(row => row.sourceRef.startsWith('content/srd/class-options.json#classOptions[id='))).toBe(true);
  });

  it('классифицирует локально подтверждённые базовые правила характеристик, мастерства и преимущества', () => {
    const byId = new Map(SRD_CATALOG.map(record => [record.id, record]));
    expect(byId.get('rule:ability-scores-and-modifiers')).toMatchObject({ bookSection: 'Using Ability Scores', sourceRef: 'src/campaign/derive.ts#abilityMod' });
    expect(byId.get('rule:proficiency-bonus')).toMatchObject({ bookSection: 'Using Ability Scores', sourceRef: 'src/campaign/derive.ts#proficiencyBonusOf' });
    expect(byId.get('rule:advantage-and-disadvantage')).toMatchObject({ bookSection: 'Using Ability Scores', sourceRef: 'src/rules/srd/odds.ts#ODDS_RULES.advantage' });
  });

  it('сохраняет таблицу Character Advancement SRD по всем 20 уровням', () => {
    const levels = characterAdvancementData.levels;
    expect(levels.map(row => row.level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(levels.map(row => row.experiencePoints)).toEqual([
      0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
      85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
    ]);
    expect(levels.map(row => row.proficiencyBonus)).toEqual([
      2, 2, 2, 2, 3, 3, 3, 3, 4, 4,
      4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
    ]);
    expect(SRD_CATALOG).toContainEqual(expect.objectContaining({
      id: 'rule:character-advancement',
      bookSection: 'Beyond 1st Level',
      sourceRef: 'content/srd/character-advancement.json#levels',
    }));
  });

  it('индексирует каждую строку Multiclassing и сохраняет таблицы без догадок', () => {
    expect(multiclassingData.prerequisites).toHaveLength(12);
    expect(multiclassingData.proficienciesGained).toHaveLength(12);
    expect(multiclassingData.spellSlots).toHaveLength(20);
    expect(multiclassingData.spellSlots.every(row => row.bySpellLevel.length === 9)).toBe(true);
    expect(multiclassingData.spellSlots[0].bySpellLevel).toEqual([2, null, null, null, null, null, null, null, null]);
    expect(multiclassingData.spellSlots[19].bySpellLevel).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    const multiclassRecords = SRD_CATALOG.filter(record => record.bookSection === 'Multiclassing');
    expect(multiclassRecords).toHaveLength(44);
    expect(multiclassRecords.every(record => record.sourceRef.startsWith('content/srd/multiclassing.json#'))).toBe(true);
  });

  it('индексирует таблицы костей хитов, бонуса мастерства и XP монстров по CR', () => {
    expect(monsterChallengeData.hitDiceBySize).toEqual([
      { id: 'tiny', size: 'Tiny', hitDie: 'd4', averageHpPerDie: 2.5 },
      { id: 'small', size: 'Small', hitDie: 'd6', averageHpPerDie: 3.5 },
      { id: 'medium', size: 'Medium', hitDie: 'd8', averageHpPerDie: 4.5 },
      { id: 'large', size: 'Large', hitDie: 'd10', averageHpPerDie: 5.5 },
      { id: 'huge', size: 'Huge', hitDie: 'd12', averageHpPerDie: 6.5 },
      { id: 'gargantuan', size: 'Gargantuan', hitDie: 'd20', averageHpPerDie: 10.5 },
    ]);
    expect(monsterChallengeData.challengeRatings).toHaveLength(34);
    expect(monsterChallengeData.challengeRatings[0]).toMatchObject({ challenge: '0', experiencePoints: [0, 10], proficiencyBonus: 2 });
    expect(monsterChallengeData.challengeRatings.find(row => row.challenge === '17')).toMatchObject({ experiencePoints: 18000, proficiencyBonus: 6 });
    expect(monsterChallengeData.challengeRatings[33]).toMatchObject({ challenge: '30', experiencePoints: 155000, proficiencyBonus: 9 });
    const records = SRD_CATALOG.filter(record => record.id.startsWith('rule:monster-hit-dice/')
      || record.id.startsWith('rule:monster-proficiency-bonus/') || record.id.startsWith('rule:monster-xp/'));
    expect(records).toHaveLength(74);
    expect(records.every(record => record.bookSection === 'Monsters' && record.sourceRef.startsWith('content/srd/monster-challenge-ratings.json#'))).toBe(true);
  });

  it('индексирует иерархию 137 правил API по шести корневым разделам', () => {
    expect(ruleSectionData.rules).toHaveLength(137);
    const ids = new Set(ruleSectionData.rules.map(rule => rule.id));
    expect(ids.size).toBe(137);
    const sections = Object.fromEntries(ruleSectionData.rules.reduce((counts, rule) => {
      counts.set(rule.bookSection, (counts.get(rule.bookSection) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()));
    expect(sections).toEqual({
      'Using Ability Scores': 18,
      Combat: 44,
      Equipment: 18,
      Adventuring: 26,
      Appendix: 13,
      Spellcasting: 18,
    });
    for (const rule of ruleSectionData.rules) {
      expect(SRD_BOOK_SECTIONS).toContain(rule.bookSection);
      if (rule.parentId) expect(ids.has(rule.parentId), `${rule.id} parent`).toBe(true);
      for (const childId of rule.childIds) expect(ids.has(childId), `${rule.id} child ${childId}`).toBe(true);
    }
    const indexed = SRD_CATALOG.filter(record => record.id.startsWith('rule:api/'));
    expect(indexed).toHaveLength(137);
    expect(indexed.every(record => record.sourceRef.startsWith('content/srd/rules.json#rules[id='))).toBe(true);
  });

  it('каталогизирует ключевые дословные правила листа и боя с локальными ссылками', () => {
    const byId = new Map(SRD_CATALOG.map(record => [record.id, record]));
    const expectedRules = [
      ['rule:skill-proficiency', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#skillProficiency'],
      ['rule:saving-throw-proficiency', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#saveProficiency'],
      ['rule:expertise', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#expertise'],
      ['rule:passive-checks', 'Using Ability Scores', 'src/rules/srd/sheetRules.ts#passive'],
      ['rule:initiative', 'Combat', 'src/rules/srd/sheetRules.ts#initiative'],
      ['rule:natural-1-and-20', 'Combat', 'src/rules/srd/odds.ts#ODDS_RULES.rolling1or20'],
      ['rule:critical-hit-damage', 'Combat', 'src/rules/srd/odds.ts#ODDS_RULES.criticalHits'],
      ['rule:resistance-and-vulnerability', 'Combat', 'src/rules/srd/odds.ts#ODDS_RULES.resistance'],
      ['rule:armor-categories', 'Equipment', 'src/rules/srd/armor.ts#ARMOR_RULES'],
      ['rule:coinage-and-exchange-rates', 'Equipment', 'src/rules/srd/coins.ts#COINS'],
      ['rule:class-hit-points', 'Classes', 'src/rules/srd/classes.ts#HIT_POINTS_RULE'],
      ['rule:ability-score-improvement', 'Beyond 1st Level', 'src/rules/srd/classes.ts#ASI_RULE'],
      ['rule:spell-save-dc', 'Spellcasting', 'src/rules/srd/sheetRules.ts#spellDcRule'],
      ['rule:spell-attack-modifier', 'Spellcasting', 'src/rules/srd/sheetRules.ts#spellAttackRule'],
    ] as const;
    for (const [id, bookSection, sourceRef] of expectedRules) {
      expect(byId.get(id), id).toMatchObject({ bookSection, sourceRef });
    }
  });

  it('фильтрует по типу и находит запись по имени, ID или разделу', () => {
    const spells = filterSrdCatalog(SRD_CATALOG, 'spell');
    expect(spells).toHaveLength(319);
    expect(spells.every(record => record.type === 'spell')).toBe(true);
    expect(filterSrdCatalog(SRD_CATALOG, 'spell', 'fireball').map(record => record.name)).toContain('Fireball');
    expect(filterSrdCatalog(SRD_CATALOG, 'condition', 'appendix ph-a')).toHaveLength(15);
    expect(filterSrdCatalog(SRD_CATALOG, 'all', 'not-a-real-srd-record')).toHaveLength(0);
  });
});
