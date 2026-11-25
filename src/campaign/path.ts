// Персонаж как путь (Д8, DESIGN): 20 уровней класса дорогой — бонус мастерства, умения класса, умения выбранного
// подкласса, увеличение характеристик SRD, ресурсы таблицы; «следующий уровень даст…». Партия по уровням: лечение,
// тёмное зрение, снятие ловушек — у кого есть и с какого уровня класса придёт. Как узнать возможность — правило стола
// (ниже, поимённо): таблицы держат умения прозой. Чистые функции над листом актёра (в логе лежит лист).
import type { Actor, CharacterSheet } from '../engine';
import { classById, raceById, type CharacterClass, type ClassFeature, type ClassOptionBlock, type Source, type Subclass } from '../rules/compendium';
import { SRD_CLASSES } from '../rules/srd/classes';
import { SPELLS } from '../rules/srd/spells';
import { srdIdOf } from './build';

export type PathState = 'past' | 'now' | 'next' | 'later';

export interface PathStep {
  level: number;
  proficiencyBonus: number | null;
  features: readonly ClassFeature[];
  /** Умения выбранного подкласса на этом уровне. */
  subclass: readonly ClassFeature[];
  /** Здесь выбирают подкласс (gainedAt), а он ещё не выбран. */
  subclassPick: boolean;
  /** Сколько других подклассов дают умения на этом уровне — «подклассы рядом». */
  others: number;
  /** Увеличение характеристик SRD (или черта). */
  asi: boolean;
  resources: Readonly<Record<string, string>>;
  state: PathState;
}

export interface CharacterPath {
  classId: string; className: string; source: Source;
  subclassId?: string; subclassName?: string;
  level: number; steps: readonly PathStep[];
  branches: readonly Subclass[]; options: readonly ClassOptionBlock[];
  learned: readonly { id: string; level: number }[];
}

/** Подтверждено листом, а не предположено по одному достигнутому уровню. */
export function pathFeatureState(path: CharacterPath, feature: ClassFeature, level: number, branchId?: string) {
  if (branchId && branchId !== path.subclassId) return 'comparison' as const;
  if (level > path.level) return level === path.level + 1 ? 'next' as const : 'future' as const;
  return path.learned.some(f => f.id === feature.id && f.level === level) ? 'acquired' as const : 'unconfirmed' as const;
}

/** Текстовый выбор ещё не является машиночитаемой схемой выдачи. */
export function pathFeatureKind(feature: ClassFeature): 'choice' | 'review' | 'level' {
  if (feature.choice) return 'choice';
  if (feature.name.includes('/') || /выб(?:ор|ер|ир)|одно из следующих|один из следующих/i.test(feature.text)) return 'review';
  return 'level';
}

/** Дорога класса по листу; класса нет в компендиуме — undefined. */
export function pathOf(sheet: CharacterSheet): CharacterPath | undefined {
  const cls = classById(sheet.classId);
  if (!cls) return undefined;
  return classPath(cls, sheet.level, sheet.subclassId, sheet.features);
}

/** Просмотр в редакторе до появления листа; не требует придумывать характеристики или хиты. */
export function classPath(cls: CharacterClass, level: number, subclassId?: string, learned: CharacterPath['learned'] = []): CharacterPath {
  const srd = srdIdOf(cls);
  const asiLevels: readonly number[] = srd ? SRD_CLASSES[srd].asiLevels : [];
  const sub = cls.subclasses.find(s => s.id === subclassId);
  const steps = cls.levels.map((l): PathStep => ({
    level: l.level,
    proficiencyBonus: l.proficiencyBonus,
    features: l.features,
    subclass: (sub?.features ?? []).filter(f => f.level === l.level),
    subclassPick: !sub && cls.subclasses.some(s => s.gainedAt === l.level),
    others: cls.subclasses.filter(s => s !== sub && s.features.some(f => f.level === l.level)).length,
    asi: asiLevels.includes(l.level),
    resources: l.resources,
    state: l.level < level ? 'past' : l.level === level ? 'now' : l.level === level + 1 ? 'next' : 'later',
  }));
  return { classId: cls.id, className: cls.nameRu, source: cls.source,
    ...(sub ? { subclassId: sub.id, subclassName: sub.name } : {}), level, steps,
    branches: cls.subclasses, options: cls.options ?? [], learned };
}

/** «Следующий уровень (5-й) даст: Дополнительная атака · бонус мастерства +3»; 20-й — дороги дальше нет. */
export function nextLevelText(path: CharacterPath): string | null {
  const next = path.steps.find(s => s.state === 'next');
  if (!next) return null;
  const now = path.steps.find(s => s.state === 'now');
  const parts = [
    ...next.features.map(f => f.name), ...next.subclass.map(f => f.name),
    ...(next.subclassPick ? ['выбор подкласса'] : []),
    ...(next.asi ? ['увеличение характеристик или черта'] : []),
    ...(next.proficiencyBonus !== null && next.proficiencyBonus !== now?.proficiencyBonus ? [`бонус мастерства +${next.proficiencyBonus}`] : []),
  ];
  return `Следующий уровень (${next.level}-й) даст: ${parts.length ? parts.join(' · ') : 'хиты и ресурсы таблицы'}`;
}

/* ---------- Партия по уровням ---------- */

export type Capability = 'healing' | 'darkvision' | 'traps';
export const CAPABILITY_LABEL: Readonly<Record<Capability, string>> = { healing: 'Лечение', darkvision: 'Тёмное зрение', traps: 'Снятие ловушек' };
/**
 * Правило стола — как узнать возможность: лечение — Cure Wounds или Healing Word в списке класса SRD и ячейки 1-го
 * круга в таблице класса, или умение «Наложение рук»; тёмное зрение — черта расы с этим именем или отметка «vision» в колонках зрения таблицы рас; ловушки — воровские
 * инструменты во владениях класса.
 */
export const CAPABILITY_RULE = 'правило стола: лечение — Cure Wounds или Healing Word в списке класса SRD с ячейками 1-го круга или «Наложение рук»; тёмное зрение — черта или колонка зрения таблицы рас; ловушки — воровские инструменты во владениях класса';

const HEALING_SPELLS = ['cure-wounds', 'healing-word'] as const;

/** С какого уровня класса возможность у персонажа; никогда — null. */
function capabilityLevel(cls: CharacterClass, sheet: CharacterSheet, cap: Capability): number | null {
  if (cap === 'darkvision') return sheet.traits.some(t => /т[её]мное зрение/i.test(t.name)) || raceById(sheet.raceId)?.facetMarks.includes('vision') ? 1 : null;
  if (cap === 'traps') return /воровск/i.test(cls.proficiencies.tools ?? '') || sheet.expertise?.includes('thieves-tools') ? 1 : null;
  const srd = srdIdOf(cls);
  const listed = srd !== undefined && HEALING_SPELLS.some(id => SPELLS[id]?.classes.includes(srd));
  const byHands = cls.levels.find(l => l.features.some(f => /наложение рук/i.test(f.name)))?.level ?? null;
  const bySlots = listed ? cls.levels.find(l => l.resources['1'] !== undefined)?.level ?? null : null;
  const all = [byHands, bySlots].filter((x): x is number => x !== null);
  return all.length ? Math.min(...all) : null;
}

export interface PartyGap {
  capability: Capability;
  /** У кого и с какого уровня класса; now — уже есть. */
  who: readonly { actorId: string; name: string; from: number; now: boolean }[];
  /** Есть у партии сейчас. */
  covered: boolean;
}

/** Пробелы партии: по каждой возможности — кто и с какого уровня; у кого нет листа или класса — не в счёт. */
export function partyGaps(party: readonly Actor[]): PartyGap[] {
  return (Object.keys(CAPABILITY_LABEL) as Capability[]).map(capability => {
    const who = party.flatMap(a => {
      const cls = a.sheet ? classById(a.sheet.classId) : undefined;
      const from = cls && a.sheet ? capabilityLevel(cls, a.sheet, capability) : null;
      return from === null || !a.sheet ? [] : [{ actorId: a.id, name: a.name, from, now: from <= a.sheet.level }];
    });
    return { capability, who, covered: who.some(w => w.now) };
  });
}
