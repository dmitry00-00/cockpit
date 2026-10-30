// Повышение уровня (Q10, Д8): следующий лист из нынешнего, без описания персонажа (в логе лежит лист). По SRD: бонус
// мастерства из таблицы класса; хиты — среднее кости (Hit Points: «take the fixed value») или бросок, плюс модификатор
// CON; выросший CON поднимает максимум задним числом («your hit point maximum increases by 1 for each level»);
// увеличение характеристик на уровнях SRD — +2 к одной или +1 к двум, не выше 20. Умения класса и подкласса уровня — из
// таблицы владельца; AC, пассивное внимание, атаки, Сл и атака заклинаний — пересчитаны по новому листу. Новые
// заклинания не выбираются здесь: список прежний, старший круг — по таблице. Чистые функции; событие пишет стол.
import type { Actor, CharacterLeveled, CharacterSheet } from '../engine';
import { classById, raceById, type CharacterClass, type Subclass } from '../rules/compendium';
import { ABILITIES, ABILITY_IDS, type AbilityId } from '../rules/srd/abilities';
import { srdRaceSize } from '../rules/srd/races';
import { attacksOf, spellcastingOf, srdIdOf } from './build';
import { ARCHERY_STYLE, DRACONIC_SUBCLASS, TRAIT_EFFECTS, abilityMod, passivePerception, proficiencyBonusOf, srdClassOf } from './derive';
import { sheetAc } from './explain';

export interface LevelUpPlan {
  level: number;
  die: number;
  /** SRD: среднее кости хитов — die/2 + 1. */
  average: number;
  conMod: number;
  /** Подкласс выбирается на этом уровне — варианты; не выбирается — null. */
  subclasses: readonly Subclass[] | null;
  /** Уровень SRD с увеличением характеристик. */
  asi: boolean;
  /** Что даёт уровень по таблице: имена умений класса (и подкласса, если он выбран). */
  features: readonly string[];
}

export interface LevelUpChoice {
  hp: { method: 'average' } | { method: 'roll'; roll: number };
  subclassId?: string;
  /** +2 к одной или +1 к двум — только на уровне увеличения. */
  asi?: Partial<Record<AbilityId, number>>;
}

/** Повысить нельзя: причина словами (класса нет в SRD — нет кости хитов; 20-й уровень). */
export class LevelUpError extends Error {}

function classOf(sheet: CharacterSheet): CharacterClass {
  const cls = classById(sheet.classId);
  if (!cls) throw new LevelUpError(`класса ${sheet.classId} нет в компендиуме`);
  return cls;
}

/** Что даст следующий уровень и что в нём выбрать. */
export function levelUpPlan(actor: Actor): LevelUpPlan {
  const sheet = actor.sheet;
  if (!sheet) throw new LevelUpError(`${actor.name}: листа нет`);
  if (sheet.level >= 20) throw new LevelUpError(`${actor.name}: 20-й уровень — выше нет`);
  const cls = classOf(sheet);
  let srd;
  try { srd = srdClassOf(cls); } catch { throw new LevelUpError(`${cls.nameRu}: класса нет в SRD — нет кости хитов`); }
  const level = sheet.level + 1;
  const row = cls.levels.find(l => l.level === level);
  const sub = cls.subclasses.find(s => s.id === sheet.subclassId);
  const picks = !sub && cls.subclasses.some(s => s.gainedAt === level) ? cls.subclasses.filter(s => s.gainedAt === level) : null;
  return {
    level,
    die: srd.hitDie,
    average: srd.hitDie / 2 + 1,
    conMod: abilityMod(sheet.abilities.con),
    subclasses: picks,
    asi: srd.asiLevels.includes(level),
    features: [...(row?.features ?? []).map(f => f.name), ...(sub?.features ?? []).filter(f => f.level === level).map(f => f.name)],
  };
}

/** Событие повышения: лист после, хиты, AC, пассивное внимание и что дал уровень словами. */
export function levelUp(actor: Actor, choice: LevelUpChoice): CharacterLeveled {
  const plan = levelUpPlan(actor);
  const sheet = actor.sheet!;
  const cls = classOf(sheet);
  const srdId = srdIdOf(cls);
  if (plan.subclasses && !plan.subclasses.some(s => s.id === choice.subclassId)) throw new LevelUpError(`${actor.name}: на ${plan.level}-м уровне выбирается подкласс`);
  const asi = choice.asi ?? {};
  const asiSum = Object.values(asi).reduce((n, v) => n + (v ?? 0), 0);
  if (asiSum && !plan.asi) throw new LevelUpError(`${actor.name}: на ${plan.level}-м уровне увеличения характеристик нет`);
  if (plan.asi && asiSum !== 0 && (asiSum !== 2 || Object.values(asi).some(v => v !== 1 && v !== 2))) throw new LevelUpError('увеличение — +2 к одной или +1 к двум');
  const abilities = Object.fromEntries(ABILITY_IDS.map(ab => [ab, sheet.abilities[ab] + (asi[ab] ?? 0)])) as Record<AbilityId, number>;
  const over = ABILITY_IDS.find(ab => abilities[ab] > 20 && asi[ab]);
  if (over) throw new LevelUpError(`${ABILITIES[over].code} выше 20 не поднять (SRD)`);
  if (choice.hp.method === 'roll' && (!Number.isInteger(choice.hp.roll) || choice.hp.roll < 1 || choice.hp.roll > plan.die)) throw new LevelUpError(`бросок d${plan.die} — от 1 до ${plan.die}`);

  const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(abilities[ab])])) as Record<AbilityId, number>;
  const pb = proficiencyBonusOf(cls, plan.level);
  const subclassId = sheet.subclassId ?? choice.subclassId;
  const sub = cls.subclasses.find(s => s.id === subclassId);
  const row = cls.levels.find(l => l.level === plan.level);
  const newFeatures = [
    ...(row?.features ?? []).map(f => ({ id: f.id, name: f.name, level: plan.level })),
    ...(sub?.features ?? []).filter(f => f.level === plan.level).map(f => ({ id: f.id, name: f.name, level: plan.level })),
  ];
  const perLevel = sheet.traits.reduce((n, t) => n + (TRAIT_EFFECTS[t.id]?.hpPerLevel ?? 0), 0) + (subclassId === DRACONIC_SUBCLASS ? 1 : 0);
  const die = choice.hp.method === 'roll' ? choice.hp.roll : plan.average;
  const gain = Math.max(1, die + mods.con) + perLevel + (mods.con - plan.conMod) * sheet.level;

  const style = sheet.choices?.find(c => c.id === 'fighting-style')?.values[0]?.id;
  const race = raceById(sheet.raceId);
  const plan2 = sheet.spellcasting ? spellcastingOf(cls, plan.level, subclassId, mods) : undefined;
  const next: CharacterSheet = {
    ...sheet,
    level: plan.level,
    ...(subclassId ? { subclassId } : {}),
    abilities,
    proficiencyBonus: pb,
    features: [...sheet.features, ...newFeatures],
    ...(sheet.spellcasting ? {
      spellcasting: {
        ...sheet.spellcasting,
        saveDc: 8 + pb + mods[sheet.spellcasting.ability],
        attack: pb + mods[sheet.spellcasting.ability],
        ...(plan2?.kind === 'plan' ? { maxLevel: plan2.maxLevel } : {}),
      },
    } : {}),
    ...(sheet.equipment ? {
      attacks: attacksOf(sheet.equipment, {
        mods, proficiencyBonus: pb, srdClass: srdId, extraWeapons: sheet.traits.flatMap(t => TRAIT_EFFECTS[t.id]?.weapons ?? []),
        archery: style === ARCHERY_STYLE, small: race ? srdRaceSize(race.name) === 'Small' : false,
      }),
    } : {}),
  };
  // AC и внимание — приращением: если лист и раньше расходился с правилами (правка руками), расхождение остаётся видным.
  const ppOf = (sh: CharacterSheet) => passivePerception(abilityMod(sh.abilities.wis), sh.skills.includes('perception'), sh.proficiencyBonus) + (sh.expertise?.includes('perception') ? sh.proficiencyBonus : 0);
  const ac = actor.ac + sheetAc({ ...actor, sheet: next }) - sheetAc(actor);
  const pp = actor.passivePerception + ppOf(next) - ppOf(sheet);
  const gained = [
    ...(sub && !sheet.subclassId ? [`подкласс ${sub.name}`] : []),
    ...newFeatures.map(f => f.name),
    ...Object.entries(asi).filter(([, v]) => v).map(([ab, v]) => `+${v} ${ABILITIES[ab as AbilityId].code}`),
  ];
  return {
    actorId: actor.id,
    sheet: next,
    hpMax: actor.hp.max + gain,
    ac,
    passivePerception: pp,
    hp: { method: choice.hp.method, value: die },
    gained,
  };
}
