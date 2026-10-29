// Сид мок-кампании §13 поверх event log: начальное состояние + короткий лог. Одна команда — seedEngine().
// Текущие хиты (41/49 у Bo, 45/65 у капитана) — не начальные значения, а урон в логе: так сид проходит
// той же дорогой, что живая сессия, и Ctrl+Z работает на нём с первой секунды.
import type { DomainEvent } from '../engine/events';
import type { EventStore } from '../engine/persist';
import { emptyState, type Actor, type CharacterSheet, type State } from '../engine/state';
import { createEngineStore, type CreateEngineOptions, type EngineStoreApi } from '../engine/store';
import { MONSTERS, type MonsterId } from '../rules/srd/monsters';
import { secOf } from './calendar';
import { abilityMod, deriveCharacter, passivePerception, type DerivedCharacter, type PcSpec } from './derive';
import { PARTY } from './party';
import { THREAD, seedDeltas, seedFacts, seedWorld } from './world';

/** 15 Mirtul 1492 DR, утро (08:00), весна. */
export const SEED_SEC = secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 });

/** Броски инициативы §13 известны заранее; порядок из них строит ENCOUNTER_STARTED (store.startEncounter без аргументов). */
const INITIATIVE: Readonly<Record<string, number>> = {
  korrin: 18, bo: 15, captain: 14, lyra: 12, 'bandit-1': 11, aldric: 9, 'bandit-2': 8, 'bandit-3': 6,
};

/** Лист персонажа из спецификации и вывода: ссылки на компендиум и посчитанные числа. Поля редактора — только когда ведутся. */
export function sheetOf(spec: PcSpec, d: DerivedCharacter): CharacterSheet {
  return {
    level: spec.level,
    raceId: spec.raceId,
    subraceId: spec.subraceId,
    classId: spec.classId,
    subclassId: spec.subclassId,
    backgroundId: spec.backgroundId,
    abilities: d.abilities,
    proficiencyBonus: d.proficiencyBonus,
    skills: d.skills,
    features: d.features,
    traits: d.traits,
    armor: spec.armor ?? undefined,
    shield: spec.shield || undefined,
    ...(spec.mageArmor ? { mageArmor: true } : {}),
    speed: d.speed,
    alignment: spec.alignment,
    bio: spec.bio,
    ...(spec.deity ? { deity: spec.deity } : {}),
    // Поля редактора — только когда они ведутся: лист сида без них не меняется ни на байт.
    ...(d.expertise.length ? { expertise: d.expertise } : {}),
    ...(d.chosen.length ? { choices: d.chosen } : {}),
    ...(d.feats.length ? { feats: d.feats } : {}),
    ...(spec.spells && d.spellcasting ? { spellcasting: d.spellcasting } : {}),
    ...(spec.equipment ? { equipment: d.equipment, attacks: d.attacks } : {}),
  };
}

/** Персонаж игрока → актёр: числа выведены из листа, лист остаётся рядом для карточки. */
export function pcActor(spec: PcSpec): Actor {
  const d = deriveCharacter(spec);
  return {
    id: spec.id,
    name: spec.name,
    kind: 'pc',
    hp: { current: d.hpMax, max: d.hpMax, temp: 0 },
    ac: d.ac,
    passivePerception: d.passivePerception,
    conditions: {},
    initiative: INITIATIVE[spec.id],
    sheet: sheetOf(spec, d),
  };
}

/** Монстр → актёр: хиты и AC из блока SRD, пассивное внимание — по формуле (блок печатает то же число). */
export function monsterActor(id: string, monsterId: MonsterId, name = MONSTERS[monsterId].name): Actor {
  const m = MONSTERS[monsterId];
  return {
    id,
    name,
    kind: 'monster',
    hp: { current: m.hp.average, max: m.hp.average, temp: 0 },
    ac: m.ac.value,
    passivePerception: passivePerception(abilityMod(m.abilities.wis), 'perception' in m.skills, m.proficiencyBonus),
    conditions: {},
    initiative: INITIATIVE[id],
    monsterId,
  };
}

/**
 * Начальное состояние: все живы и целы, броски инициативы известны, но бой не начат (F1 — стол, исследование):
 * его начнёт ENCOUNTER_STARTED. Концентрация и предложения симуляции — не здесь, а в логе сида: это события.
 */
export function seedState(): State {
  const s = emptyState();
  s.time = { sec: SEED_SEC, tempo: 'hour' };
  const actors: Actor[] = [
    ...PARTY.map(pcActor),
    monsterActor('captain', 'bandit-captain'),
    monsterActor('bandit-1', 'bandit', 'Bandit 1'),
    monsterActor('bandit-2', 'bandit', 'Bandit 2'),
    monsterActor('bandit-3', 'bandit', 'Bandit 3'),
  ];
  const lyra = actors.find(a => a.id === 'lyra')!;
  // Mage Armor концентрации не требует и состоянием SRD не является — поэтому не в conditions (там только 15 id
  // SRD) и не в concentration, а в effects: срок через 7 часов из восьми. События для эффектов нет — данные сида.
  lyra.effects = [{ name: 'Mage Armor', untilSec: SEED_SEC + 7 * 3600, sourceId: 'lyra' }];

  s.actors = Object.fromEntries(actors.map(a => [a.id, a]));
  s.party = PARTY.map(p => p.id);
  s.facts = seedFacts();
  s.world = seedWorld(SEED_SEC);
  return s;
}

/**
 * Лог сида: четыре предложения симуляции (WORLD_DELTA_PROPOSED — они рождаются в логе, а не в данных),
 * первая запись сессии (NOTE_ADDED — партия пришла в город, нить каравана), концентрация Bo на Hunter's Mark
 * (ещё 38 минут из часа) и два удара, после которых Bo 41/49 и капитан 45/65. `at` = 0: время стены у сида не факт.
 */
export function seedLog(): DomainEvent[] {
  const base = { at: 0, worldSec: SEED_SEC } as const;
  const proposals: DomainEvent[] = Object.values(seedDeltas()).map((delta, i) => ({
    id: `seed-delta-${i + 1}`, seq: i, ...base, type: 'WORLD_DELTA_PROPOSED', payload: { delta },
  }));
  const n = proposals.length;
  return [
    ...proposals,
    { id: 'seed-note', seq: n, at: 0, worldSec: SEED_SEC - 20 * 60, type: 'NOTE_ADDED', payload: { text: 'Партия прибыла в Neverwinter через Triboar Trail', threadIds: [THREAD.missingCaravan], scale: 'settlement', visible: true } },
    { id: 'seed-conc', seq: n + 1, ...base, type: 'CONCENTRATION_STARTED', payload: { actorId: 'bo', spell: "Hunter's Mark", untilSec: SEED_SEC + 38 * 60 } },
    { id: 'seed-1', seq: n + 2, ...base, type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 8, type: 'slashing', sourceId: 'captain' } },
    { id: 'seed-2', seq: n + 3, ...base, type: 'DAMAGE_APPLIED', payload: { targetId: 'captain', amount: 20, type: 'piercing', sourceId: 'bo' } },
  ];
}

/**
 * Одна команда: партия, противники и мир из сида. Если в хранилище уже есть лог — поднимается он
 * (сид в нём первые две записи), иначе лог сида; всё, что стор запишет дальше, уходит в то же хранилище.
 *
 * Лог из хранилища может перестать реплеиться — сид изменился, формат другой, запись битая. Тогда стол
 * не должен падать навсегда: хранилище очищается, стор поднимается из сида, а причина уходит в `onRecover`
 * (по умолчанию — console.warn), чтобы потеря сессии не прошла молча.
 */
export function seedEngine(opts: SeedEngineOptions = {}): EngineStoreApi {
  const { persist, onRecover = reason => console.warn(`лог сессии не поднялся, стол собран из сида заново: ${reason}`), ...rest } = opts;
  const primed: EventStore = {
    load: () => persist?.load() ?? seedLog(),
    save: events => persist?.save(events),
    clear: () => persist?.clear(),
  };
  try {
    return createEngineStore(seedState(), { ...rest, persist: primed });
  } catch (err) {
    if (!persist) throw err;
    persist.clear();
    onRecover(err instanceof Error ? err.message : String(err));
    const store = createEngineStore(seedState(), { ...rest, persist: primed });
    persist.save(store.getState().events); // битого лога больше нет — на его месте сразу сид
    return store;
  }
}

export interface SeedEngineOptions extends CreateEngineOptions {
  /** Хранилище не поднялось и очищено: сюда — причина. Тесты и страница подставляют своё. */
  onRecover?: (reason: string) => void;
}
