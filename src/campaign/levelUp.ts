// Повышение уровня (Q10, Д8): следующий лист из нынешнего, без описания персонажа (в логе лежит лист). По SRD: бонус
// мастерства из таблицы класса; хиты — среднее кости (Hit Points: «take the fixed value») или бросок, плюс модификатор
// CON; выросший CON поднимает максимум задним числом («your hit point maximum increases by 1 for each level»);
// увеличение характеристик на уровнях SRD — +2 к одной или +1 к двум (либо SRD-черта, если доступна), не выше 20.
// Умения класса/подкласса и прирост известных SRD-заклинаний выбираются по таблицам; AC, внимание, атаки и Сл
// пересчитаны. Изменение листа хранится в событии целиком, поэтому отмена повышения возвращает все выборы.
import type { Actor, CharacterLeveled, CharacterSheet } from '../engine';
import { bySource, classById, FEATS, raceById, type CharacterClass, type Feat, type Source, type Subclass } from '../rules/compendium';
import { ABILITIES, ABILITY_IDS, type AbilityId, type SkillId } from '../rules/srd/abilities';
import { srdRaceSize } from '../rules/srd/races';
import { attacksOf, classChoicesOf, maxSlotLevel, spellcastingOf, srdIdOf, type FeatureChoice } from './build';
import { ARCHERY_STYLE, DRACONIC_SUBCLASS, TRAIT_EFFECTS, abilityMod, classArmorProficiency, featBlocked, passivePerception, proficiencyBonusOf, srdClassOf } from './derive';
import { SPELLS } from '../rules/srd/spells';
import { CLASS_START } from '../rules/srd/equipment';
import { sheetAc } from './explain';
import { importedChoicesOf, OWNER_TABLES_PROVENANCE, type AdaptedChoice } from './importedChoice';
import { BOOK_CLASS_RULES, bookCantripCatalog, bookSpellcastingAt } from '../rules/compendium/bookClassRules';
import { levelUpFeatEffectOf, ongoingFeatHpPerLevel } from './featEffects';

export interface LevelUpFeatureChoice extends FeatureChoice {
  /** Новые варианты, которые выбираются именно на этом уровне. */
  required: number;
  /** Варианты без проверенного эффекта сохраняются и явно предупреждаются. */
  mechanicalSupport: 'supported' | 'informational';
  unavailableReason?: string;
  /** Provenance for curated imported choices; options keep their individual source. */
  source?: Source;
  ruleset?: { id: string; version: string; layer: string };
  notes?: readonly string[];
  adapter?: AdaptedChoice['adapter'];
  sourceCells?: AdaptedChoice['sourceCells'];
  cumulativeCount?: number;
  /** Optional one-for-one replacement explicitly allowed by a curated source adapter. */
  replacement?: AdaptedChoice['replacement'];
  /** Imported choices with source-defined categories enforce one count per group. */
  selectionGroups?: AdaptedChoice['selectionGroups'];
}

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
  /** Source-aware SRD and explicitly curated imported choices. */
  featureChoices: readonly LevelUpFeatureChoice[];
  /** Imported placeholders without a supported schema cannot be confirmed as acquired. */
  unsupportedChoices: readonly string[];
  /** Черты SRD, чьи требования выполнены по текущему листу. */
  feats: readonly Feat[];
  /** Новые выборы заклинаний по таблице: для prepared-классов это только заговоры. */
  spells?: { list: 'known' | 'prepared' | 'spellbook'; options: readonly { id: string; name: string; level: number }[]; cantrips: number; spells: number };
  /** Заклинания подкласса, открывающиеся на этом уровне; текстовые имена не подменяются неподтверждёнными SRD-id. */
  subclassSpellNotes?: readonly { level: number; name: string; progression: 'class' | 'spell'; source: Source }[];
  /** Для классов known: необязательная замена одного уже известного заклинания 1-го круга и выше. */
  replacement?: { known: readonly { id: string; name: string; level: number }[]; options: readonly { id: string; name: string; level: number }[] };
  /** Пересчитанный лимит подготовки. Изменение характеристики не меняет подготовленный список. */
  prepared?: { current: number; limit: number; ability: AbilityId; base: number };
  /** Confirmed book progression values when the exact book spell list is not in the local catalog. */
  bookSpellcasting?: {
    ability: AbilityId;
    cantrips: number | null;
    cantripsConfirmedThrough: number;
    newCantrips: number | null;
    cantripOptions: readonly { id: string; name: string; level: number }[];
    unavailableCantripNames: readonly string[];
    cantripReplacement: {
      known: readonly { id: string; name: string; level: number }[];
      options: readonly { id: string; name: string; level: number }[];
    };
    maxSpellLevel: number;
    ruleset: { id: string; version: string; layer: 'book' };
    reference: string;
    spellListReference: string;
  };
}

export interface LevelUpChoice {
  hp: { method: 'average' } | { method: 'roll'; roll: number };
  subclassId?: string;
  /** +2 к одной или +1 к двум — только на уровне увеличения. */
  asi?: Partial<Record<AbilityId, number>>;
  /** Черта вместо ASI на соответствующем уровне. */
  featId?: string;
  /** Выбор +1 характеристики для черт, у которых таблица перечисляет варианты. */
  featAbility?: AbilityId;
  /** Новые заклинания, которые выбираются при повышении. */
  spells?: readonly string[];
  /** Необязательная замена для классов со списком known. */
  replaceSpell?: { from: string; to: string };
  /** Изобретатель может заменить один известный заговор при получении уровня (Tasha's, p. 12). */
  replaceCantrip?: { from: string; to: string };
  /** Выборы class/subclass features для текущего уровня; ключи — id из общего каталога choices. */
  featureChoices?: Readonly<Record<string, readonly string[]>>;
  /** Замена ранее выбранного значения для источников, где таблица прямо разрешает замену. */
  featureChoiceReplacements?: Readonly<Record<string, { from: string; to: string }>>;
}

/** Повысить нельзя: причина словами (класса нет в SRD — нет кости хитов; 20-й уровень). */
export class LevelUpError extends Error {}

function classOf(sheet: CharacterSheet): CharacterClass {
  const cls = classById(sheet.classId);
  if (!cls) throw new LevelUpError(`класса ${sheet.classId} нет в компендиуме`);
  return cls;
}

/** Что даст следующий уровень и что в нём выбрать. */
export function levelUpPlan(actor: Actor, proposedSubclassId?: string): LevelUpPlan {
  const sheet = actor.sheet;
  if (!sheet) throw new LevelUpError(`${actor.name}: листа нет`);
  if (sheet.level >= 20) throw new LevelUpError(`${actor.name}: 20-й уровень — выше нет`);
  const cls = classOf(sheet);
  let srd: ReturnType<typeof srdClassOf> | undefined;
  try { srd = srdClassOf(cls); } catch { srd = undefined; }
  const bookRule = BOOK_CLASS_RULES[cls.id];
  if (!srd && !bookRule) throw new LevelUpError(`${cls.nameRu}: нет подтверждённой кости хитов для этого источника`);
  const level = sheet.level + 1;
  const row = cls.levels.find(l => l.level === level);
  const subclassId = sheet.subclassId ?? proposedSubclassId;
  const sub = cls.subclasses.find(s => s.id === subclassId);
  const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(sheet.abilities[ab])])) as Record<AbilityId, number>;
  const casting = spellcastingOf(cls, level, subclassId, mods);
  const bookCasting = bookSpellcastingAt(cls.id, level, mods.int, maxSlotLevel(row));
  const bookCantrips = bookCantripCatalog(cls.id);
  const previousBookCantrips = bookCasting
    ? bookSpellcastingAt(cls.id, level - 1, mods.int, maxSlotLevel(cls.levels.find(item => item.level === level - 1)))?.cantrips ?? 0
    : 0;
  const newBookCantrips = bookCasting && bookCasting.cantrips !== null
    ? Math.max(0, bookCasting.cantrips - previousBookCantrips)
    : null;
  const bookCantripOptions = bookCantrips.options.filter(spell => !sheet.spellcasting?.cantrips.includes(spell.id));
  const bookSpellChoices = newBookCantrips && newBookCantrips > 0
    ? { list: 'prepared' as const, options: bookCantripOptions, cantrips: newBookCantrips, spells: 0 }
    : undefined;
  const previousMaxSlotLevel = maxSlotLevel(cls.levels.find(l => l.level === level - 1));
  const currentMaxSlotLevel = maxSlotLevel(row);
  const subclassSpellNotes = sub?.source === 'book' && sub.spells?.length
    ? sub.spells.filter(spell => sub.spellLevel === 'spell'
      ? spell.level > previousMaxSlotLevel && spell.level <= currentMaxSlotLevel
      : spell.level === level).map(spell => ({
        level: spell.level, name: spell.name, progression: sub.spellLevel ?? 'class', source: sub.source,
      }))
    : [];
  const spellOptions = casting?.kind === 'plan' ? casting.options.filter(s => !casting.always.includes(s.id) && !sheet.spellcasting?.cantrips.includes(s.id) && !sheet.spellcasting?.spells.includes(s.id)) : [];
  const armorProf = new Set(classArmorProficiency(cls));
  const srdId = srdIdOf(cls);
  const martial = srdId ? CLASS_START[srdId].weapons.categories.includes('martial') : false;
  const availableFeats = bySource(FEATS, ['srd', 'book']).filter(feat => !featBlocked(feat, {
    abilities: sheet.abilities, level, armorProf, martial,
    casts: Boolean(sheet.spellcasting), cantrips: Boolean(sheet.spellcasting?.cantrips.length),
  })).filter(feat => feat.id !== 'krepkiy' || !sheet.feats?.some(pick => pick.id === feat.id));
  const picks = !sub && cls.subclasses.some(s => s.gainedAt === level) ? cls.subclasses.filter(s => s.gainedAt === level) : null;
  const previousChoices = classChoicesOf(cls, sheet.level, sheet.subclassId, sheet.skills as readonly SkillId[]);
  const currentChoices = classChoicesOf(cls, level, subclassId, sheet.skills as readonly SkillId[]);
  const featureChoices: LevelUpFeatureChoice[] = currentChoices.flatMap(fc => {
    // Level-up choices use the SRD rules layer explicitly. Book options remain visible in the class path,
    // but are not silently mixed into this SRD progression contract.
    const recordedChoices = sheet.choices?.find(choice => choice.id === fc.id)?.values.map(value => value.id) ?? [];
    const existingExpertise = fc.id === 'expertise' ? sheet.expertise ?? [] : [];
    const alreadyPicked = new Set([...recordedChoices, ...existingExpertise]);
    const options = fc.options.filter(option => option.source === 'srd' && !alreadyPicked.has(option.id));
    const previousCount = previousChoices.find(previous => previous.id === fc.id)?.count ?? 0;
    const required = Math.max(0, fc.count - previousCount);
    if (required === 0) return [];
    return [{ ...fc, options, required, source: 'srd' as const, mechanicalSupport: fc.id === 'expertise' ? 'supported' : 'informational',
      ...(options.length < required ? { unavailableReason: 'Недостаточно доступных вариантов SRD для этого выбора. Проверьте слой источника и данные персонажа.' } : {}),
    }];
  });
  const importedFeatureChoices: LevelUpFeatureChoice[] = importedChoicesOf(cls, level, subclassId, sheet.choices).map(fc => ({
    ...fc, required: fc.count, mechanicalSupport: 'informational',
  }));
  featureChoices.push(...importedFeatureChoices);
  const choiceFeatures = [...(row?.features ?? []), ...(sub?.features ?? []).filter(f => f.level === level)];
  const unsupportedChoices = choiceFeatures.filter(feature => {
    if (!feature.choice) return false;
    const block = cls.options?.find(option => option.id === feature.choice);
    const label = (block?.name ?? feature.name).toLocaleLowerCase('ru').replace(/[·\s]/g, '');
    return !featureChoices.some(fc => fc.label.toLocaleLowerCase('ru').replace(/[·\s]/g, '') === label);
  }).map(feature => `«${feature.name}»: для выбора нет подключённой схемы на этом уровне.`);
  return {
    level,
    die: srd?.hitDie ?? bookRule!.hitDie,
    average: (srd?.hitDie ?? bookRule!.hitDie) / 2 + 1,
    conMod: abilityMod(sheet.abilities.con),
    subclasses: picks,
    asi: srd ? srd.asiLevels.includes(level) : Boolean(bookRule?.asiLevels?.includes(level)),
    features: [...(row?.features ?? []).map(f => f.name), ...(sub?.features ?? []).filter(f => f.level === level).map(f => f.name)],
    featureChoices,
    unsupportedChoices,
    feats: availableFeats,
    ...(subclassSpellNotes.length ? { subclassSpellNotes } : {}),
    ...(casting?.kind === 'plan' && (casting.gainedCantrips > 0 || casting.gainedLeveledSpells > 0) ? { spells: {
      list: casting.leveledKind,
      options: spellOptions,
      cantrips: casting.gainedCantrips,
      spells: casting.gainedLeveledSpells,
    } } : {}),
    ...(bookSpellChoices ? { spells: bookSpellChoices } : {}),
    ...(casting?.kind === 'plan' && casting.leveledKind === 'known' ? { replacement: {
      known: sheet.spellcasting?.spells.map(id => SPELLS[id]).filter((spell): spell is NonNullable<typeof spell> => Boolean(spell)).map(({ id, name, level }) => ({ id, name, level })) ?? [],
      options: casting.options.filter(spell => spell.level > 0 && !casting.always.includes(spell.id)).map(({ id, name, level }) => ({ id, name, level })),
    } } : {}),
    ...(casting?.kind === 'plan' && casting.leveledKind === 'prepared' ? { prepared: {
      current: sheet.spellcasting?.spells.length ?? 0, limit: casting.leveled, ability: casting.ability,
      base: srd?.id === 'paladin' ? Math.floor(level / 2) : level,
    } } : {}),
    ...(bookCasting ? {
      bookSpellcasting: {
        ability: bookCasting.ability,
        cantrips: bookCasting.cantrips,
        cantripsConfirmedThrough: bookCasting.cantripsConfirmedThrough,
        newCantrips: newBookCantrips,
        cantripOptions: bookCantrips.options,
        unavailableCantripNames: bookCantrips.unavailableNames,
        cantripReplacement: {
          known: bookCantrips.options.filter(spell => sheet.spellcasting?.cantrips.includes(spell.id)),
          options: bookCantrips.options.filter(spell => !sheet.spellcasting?.cantrips.includes(spell.id)),
        },
        maxSpellLevel: bookCasting.maxSpellLevel,
        ruleset: bookCasting.ruleset,
        reference: bookCasting.reference,
        spellListReference: bookCasting.spellListReference,
      },
      prepared: {
        current: sheet.spellcasting?.spells.length ?? 0,
        limit: bookCasting.prepared,
        ability: bookCasting.ability,
        base: Math.floor(level / 2),
      },
    } : {}),
  };
}

/** Событие повышения: лист после, хиты, AC, пассивное внимание и что дал уровень словами. */
export function levelUp(actor: Actor, choice: LevelUpChoice): CharacterLeveled {
  const plan = levelUpPlan(actor);
  const sheet = actor.sheet!;
  const cls = classOf(sheet);
  const srdId = srdIdOf(cls);
  if (plan.subclasses && !plan.subclasses.some(s => s.id === choice.subclassId)) throw new LevelUpError(`${actor.name}: на ${plan.level}-м уровне выбирается подкласс`);
  const subclassId = sheet.subclassId ?? choice.subclassId;
  const activePlan = levelUpPlan(actor, subclassId);
  if (activePlan.unsupportedChoices.length) throw new LevelUpError(activePlan.unsupportedChoices.join(' '));
  const asi = choice.asi ?? {};
  const feat = choice.featId ? plan.feats.find(f => f.id === choice.featId) : undefined;
  if (choice.featId && (!plan.asi || !feat)) throw new LevelUpError(`${actor.name}: черта не подходит для этого повышения`);
  if (feat && Object.keys(asi).length) throw new LevelUpError('при выборе черты увеличение характеристик отдельно не применяется');
  if (feat && feat.asi.length && (!choice.featAbility || !feat.asi.includes(choice.featAbility))) throw new LevelUpError(`${feat.nameRu}: выберите допустимую характеристику для +1`);
  if ((!feat || !feat.asi.length) && choice.featAbility) throw new LevelUpError('эта черта не даёт выбора характеристики');
  const asiSum = Object.values(asi).reduce((n, v) => n + (v ?? 0), 0);
  if (asiSum && !plan.asi) throw new LevelUpError(`${actor.name}: на ${plan.level}-м уровне увеличения характеристик нет`);
  if (plan.asi && asiSum !== 0 && (asiSum !== 2 || Object.values(asi).some(v => v !== 1 && v !== 2))) throw new LevelUpError('увеличение — +2 к одной или +1 к двум');
  if (plan.asi && asiSum === 0 && !feat) throw new LevelUpError('выберите увеличение характеристик или черту');
  const abilityIncreases = { ...asi, ...(feat && choice.featAbility ? { [choice.featAbility]: 1 } : {}) };
  const abilities = Object.fromEntries(ABILITY_IDS.map(ab => [ab, sheet.abilities[ab] + (abilityIncreases[ab] ?? 0)])) as Record<AbilityId, number>;
  const over = ABILITY_IDS.find(ab => abilities[ab] > 20 && abilityIncreases[ab]);
  if (over) throw new LevelUpError(`${ABILITIES[over].code} выше 20 не поднять (SRD)`);
  const chosenSpells = [...new Set(choice.spells ?? [])];
  if (chosenSpells.length !== (activePlan.spells?.cantrips ?? 0) + (activePlan.spells?.spells ?? 0)) throw new LevelUpError('выберите новые заклинания по числу вариантов уровня');
  for (const id of chosenSpells) if (!activePlan.spells?.options.some(s => s.id === id)) throw new LevelUpError(`заклинание ${id} недоступно по списку выбранного источника`);
  if (activePlan.spells && (chosenSpells.filter(id => SPELLS[id]?.level === 0).length !== activePlan.spells.cantrips || chosenSpells.filter(id => (SPELLS[id]?.level ?? 0) > 0).length !== activePlan.spells.spells)) throw new LevelUpError('проверьте число новых заговоров и заклинаний');
  const replacement = choice.replaceSpell;
  if (replacement && (!activePlan.replacement || replacement.from === replacement.to
    || !activePlan.replacement.known.some(s => s.id === replacement.from)
    || !activePlan.replacement.options.some(s => s.id === replacement.to)
    || sheet.spellcasting?.spells.includes(replacement.to)
    || chosenSpells.includes(replacement.to))) throw new LevelUpError('замена заклинания недоступна по SRD');
  const cantripReplacement = choice.replaceCantrip;
  if (cantripReplacement && (!activePlan.bookSpellcasting?.cantripReplacement
    || cantripReplacement.from === cantripReplacement.to
    || !activePlan.bookSpellcasting.cantripReplacement.known.some(spell => spell.id === cantripReplacement.from)
    || !activePlan.bookSpellcasting.cantripReplacement.options.some(spell => spell.id === cantripReplacement.to)
    || chosenSpells.includes(cantripReplacement.to))) throw new LevelUpError('замена заговора недоступна по Tasha’s');
  if (choice.hp.method === 'roll' && (!Number.isInteger(choice.hp.roll) || choice.hp.roll < 1 || choice.hp.roll > plan.die)) throw new LevelUpError(`бросок d${plan.die} — от 1 до ${plan.die}`);

  const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(abilities[ab])])) as Record<AbilityId, number>;
  const pb = proficiencyBonusOf(cls, plan.level);
  const requestedChoices = choice.featureChoices ?? {};
  const requestedReplacements = choice.featureChoiceReplacements ?? {};
  const requiredChoiceIds = new Set(activePlan.featureChoices.map(fc => fc.id));
  for (const id of Object.keys(requestedChoices)) if (!requiredChoiceIds.has(id)) throw new LevelUpError(`выбор ${id} не даётся на ${plan.level}-м уровне`);
  const selectedFeatureChoices = activePlan.featureChoices.map(fc => {
    if (fc.unavailableReason) throw new LevelUpError(fc.unavailableReason);
    const ids = [...(requestedChoices[fc.id] ?? [])];
    if (new Set(ids).size !== ids.length) throw new LevelUpError(`в «${fc.label}» нельзя выбрать один вариант дважды`);
    if (ids.length !== fc.required) throw new LevelUpError(`выберите ${fc.required} вариант(а) для «${fc.label}»`);
    for (const id of ids) if (!fc.options.some(option => option.id === id)) throw new LevelUpError(`вариант ${id} недоступен для «${fc.label}» по источнику ${fc.source ?? 'SRD'}`);
    if (fc.selectionGroups) {
      const groupedIds = new Set(fc.selectionGroups.flatMap(group => group.options.map(option => option.id)));
      if (ids.some(id => !groupedIds.has(id)) || fc.selectionGroups.some(group => ids.filter(id => group.options.some(option => option.id === id)).length !== group.required)) {
        throw new LevelUpError(`соблюдайте категории выбора для «${fc.label}»`);
      }
    }
    return { ...fc, values: ids.map(id => fc.options.find(option => option.id === id)!) };
  });
  for (const id of Object.keys(requestedReplacements)) {
    if (!requiredChoiceIds.has(id)) throw new LevelUpError(`замена ${id} не даётся на ${plan.level}-м уровне`);
    const fc = activePlan.featureChoices.find(item => item.id === id)!;
    const replacement = requestedReplacements[id];
    if (!fc.replacement || !fc.replacement.known.some(option => option.id === replacement.from)
      || !fc.replacement.options.some(option => option.id === replacement.to)
      || (requestedChoices[id] ?? []).includes(replacement.to)) {
      throw new LevelUpError(`замена варианта для «${fc.label}» недоступна по источнику`);
    }
  }
  for (const fc of activePlan.featureChoices) {
    if (!requestedChoices[fc.id] && fc.required > 0) throw new LevelUpError(`выберите варианты для «${fc.label}»`);
  }
  if (Object.keys(requestedChoices).some(id => !activePlan.featureChoices.some(fc => fc.id === id))) {
    throw new LevelUpError('проверьте выборы умений для этого уровня и подкласса');
  }
  const sub = cls.subclasses.find(s => s.id === subclassId);
  const row = cls.levels.find(l => l.level === plan.level);
  const newFeatures = [
    ...(row?.features ?? []).map(f => ({ id: f.id, name: f.name, level: plan.level })),
    ...(sub?.features ?? []).filter(f => f.level === plan.level).map(f => ({ id: f.id, name: f.name, level: plan.level })),
  ];
  const perLevel = sheet.traits.reduce((n, t) => n + (TRAIT_EFFECTS[t.id]?.hpPerLevel ?? 0), 0)
    + (subclassId === DRACONIC_SUBCLASS ? 1 : 0) + ongoingFeatHpPerLevel(sheet.feats);
  const die = choice.hp.method === 'roll' ? choice.hp.roll : plan.average;
  const featHp = feat ? levelUpFeatEffectOf(feat)?.hp : undefined;
  const featHpOnAcquisition = (featHp?.onAcquisitionPerCharacterLevel ?? 0) * plan.level;
  const gain = Math.max(1, die + mods.con) + perLevel + (mods.con - plan.conMod) * sheet.level + featHpOnAcquisition;

  const styleValues = [...(sheet.choices?.find(c => c.id === 'fighting-style')?.values ?? []),
    ...(selectedFeatureChoices.find(fc => fc.id === 'fighting-style')?.values.map(option => ({ id: option.id, name: option.name, at: plan.level, source: option.source, ...(option.source === 'srd' ? { ruleset: { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' } } : {}) })) ?? [])];
  const style = styleValues[0]?.id;
  const nextChoices = [...(sheet.choices ?? [])];
  for (const [id, replacement] of Object.entries(requestedReplacements)) {
    const existing = nextChoices.find(item => item.id === id);
    if (!existing?.values.some(value => value.id === replacement.from)) {
      throw new LevelUpError(`заменяемый вариант ${replacement.from} не найден в листе`);
    }
    const index = nextChoices.indexOf(existing);
    nextChoices[index] = { ...existing, values: existing.values.filter(value => value.id !== replacement.from) };
  }
  for (const selected of selectedFeatureChoices) {
    const existing = nextChoices.find(item => item.id === selected.id);
    const replacement = requestedReplacements[selected.id];
    const replacementOption = replacement ? selected.options.find(option => option.id === replacement.to) : undefined;
    const values = [...selected.values, ...(replacementOption ? [replacementOption] : [])].map(option => ({
      id: option.id, name: option.name, at: plan.level, source: (selected.source ?? option.source) as Source,
      ...(selected.ruleset ? { ruleset: selected.ruleset }
        : option.source === 'srd' ? { ruleset: { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' } }
        : option.source === 'book' ? { ruleset: OWNER_TABLES_PROVENANCE } : {}),
    }));
    if (existing) {
      const merged = [...existing.values];
      for (const value of values) if (!merged.some(v => v.id === value.id)) merged.push(value);
      const index = nextChoices.indexOf(existing);
      nextChoices[index] = { ...existing, values: merged };
    } else nextChoices.push({ id: selected.id, label: selected.label, values });
  }
  const race = raceById(sheet.raceId);
  const plan2 = spellcastingOf(cls, plan.level, subclassId, mods);
  const bookCasting2 = bookSpellcastingAt(cls.id, plan.level, mods.int, maxSlotLevel(row));
  const baseSpellcasting = sheet.spellcasting ?? (plan2?.kind === 'plan' ? {
    ability: plan2.ability,
    saveDc: 8 + pb + mods[plan2.ability],
    attack: pb + mods[plan2.ability],
    kind: plan2.leveledKind,
    maxLevel: plan2.maxLevel,
    cantrips: [] as string[],
    spells: [] as string[],
    always: [] as string[],
  } : undefined);
  const nextSpellcasting = plan2?.kind === 'plan' && baseSpellcasting ? {
    ...baseSpellcasting,
    ability: plan2.ability,
    saveDc: 8 + pb + mods[plan2.ability],
    attack: pb + mods[plan2.ability],
    kind: plan2.leveledKind,
    maxLevel: plan2.maxLevel,
    cantrips: [...baseSpellcasting.cantrips, ...chosenSpells.filter(id => SPELLS[id]?.level === 0)],
    spells: [
      ...baseSpellcasting.spells.filter(id => id !== replacement?.from),
      ...(replacement ? [replacement.to] : []),
      ...chosenSpells.filter(id => (SPELLS[id]?.level ?? 0) > 0),
    ],
    always: plan2.always,
    ...(plan2.leveledKind === 'prepared' ? { preparedLimit: plan2.leveled } : {}),
  } : bookCasting2 ? {
    ...(sheet.spellcasting ?? {
      ability: bookCasting2.ability,
      saveDc: 8 + pb + mods[bookCasting2.ability],
      attack: pb + mods[bookCasting2.ability],
      kind: 'prepared' as const,
      maxLevel: bookCasting2.maxSpellLevel,
      cantrips: [] as string[],
      spells: [] as string[],
      always: [] as string[],
    }),
    ability: bookCasting2.ability,
    saveDc: 8 + pb + mods[bookCasting2.ability],
    attack: pb + mods[bookCasting2.ability],
    kind: 'prepared' as const,
    maxLevel: bookCasting2.maxSpellLevel,
    cantrips: [
      ...(sheet.spellcasting?.cantrips ?? []).filter(id => id !== cantripReplacement?.from),
      ...(cantripReplacement ? [cantripReplacement.to] : []),
      ...chosenSpells,
    ],
    preparedLimit: bookCasting2.prepared,
  } : sheet.spellcasting;
  const next: CharacterSheet = {
    ...sheet,
    level: plan.level,
    ...(subclassId ? { subclassId } : {}),
    abilities,
    proficiencyBonus: pb,
    ...(nextChoices.length ? { choices: nextChoices } : {}),
    ...(selectedFeatureChoices.some(fc => fc.id === 'expertise') ? {
      expertise: [...new Set([...(sheet.expertise ?? []), ...(selectedFeatureChoices.find(fc => fc.id === 'expertise')?.values.map(option => option.id) ?? [])])],
    } : {}),
    features: [...sheet.features, ...newFeatures],
    ...(feat ? { feats: [...(sheet.feats ?? []), {
      id: feat.id, name: feat.nameRu, at: plan.level, source: feat.source,
      ruleset: feat.source === 'srd'
        ? { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' }
        : { id: 'owner-tables', version: '2026.10.31', layer: 'content-compendium-feats-json' },
      ...(choice.featAbility ? { asi: choice.featAbility } : {}),
    }] } : {}),
    ...(nextSpellcasting ? { spellcasting: nextSpellcasting } : {}),
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
    ...selectedFeatureChoices.flatMap(fc => fc.values.map(option => `${fc.label}: ${option.name}`)),
    ...selectedFeatureChoices.flatMap(fc => {
      const replacement = requestedReplacements[fc.id];
      const to = replacement ? fc.options.find(option => option.id === replacement.to) : undefined;
      return to ? [`${fc.label}: ${to.name} (замена)`] : [];
    }),
    ...(feat ? [`черта ${feat.nameRu}`] : []),
    ...(featHpOnAcquisition ? [`+${featHpOnAcquisition} к максимуму хитов (${feat!.nameRu})`] : []),
    ...chosenSpells.map(id => `заклинание ${SPELLS[id]?.name ?? id}`),
    ...(replacement ? [`замена: ${SPELLS[replacement.from]?.name ?? replacement.from} → ${SPELLS[replacement.to]?.name ?? replacement.to}`] : []),
    ...(cantripReplacement ? [`замена заговора: ${SPELLS[cantripReplacement.from]?.name ?? cantripReplacement.from} → ${SPELLS[cantripReplacement.to]?.name ?? cantripReplacement.to}`] : []),
    ...Object.entries(asi).filter(([, v]) => v).map(([ab, v]) => `+${v} ${ABILITIES[ab as AbilityId].code}`),
    ...(feat && choice.featAbility ? [`+1 ${ABILITIES[choice.featAbility].code} (черта)`] : []),
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
