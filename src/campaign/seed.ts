// Сид мок-кампании §13 поверх event log: начальное состояние + короткий лог. Одна команда — seedEngine().
// Текущие хиты (41/49 у Bo, 45/65 у капитана) — не начальные значения, а урон в логе: так сид проходит
// той же дорогой, что живая сессия, и Ctrl+Z работает на нём с первой секунды.
import type { CampaignProfile, DomainEvent } from '../engine/events';
import { EventStoreReadError, memoryStore, type EventStore } from '../engine/persist';
import { emptyState, SECONDS_PER_DAY, type Actor, type CharacterSheet, type State } from '../engine/state';
import { ref, type EntityKind } from '../entities/ref';
import { migrateLegacyInventory } from '../engine/inventory';
import { createEngineStore, type CreateEngineOptions, type EngineStoreApi } from '../engine/store';
import { settingDataFor } from '../packages/registry';
import { builtInCampaignContent, builtInCampaignForId } from '../packages/campaigns';
import { parseAdventureBundle } from '../packages/adventure';
import { parseCalendarProfile, parseScaleLadderProfile } from '../packages/settingData';
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
    ...(spec.portrait ? { portrait: spec.portrait } : {}),
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
  return migrateLegacyInventory(s);
}

/** Build a clean campaign profile from its setting and optional authored scenario; rules remain independent. */
export function createCampaignProfile(settingPackageId: string, campaignPackageId?: string): CampaignProfile {
  const campaign = builtInCampaignForId(campaignPackageId);
  if (campaignPackageId && !campaign) throw new Error(`Пакет кампании не найден: ${campaignPackageId}`);
  if (campaign && campaign.settingPackageId !== settingPackageId) throw new Error(`Кампания ${campaignPackageId} требует сеттинг ${campaign.settingPackageId}.`);
  const ladder = parseScaleLadderProfile(settingDataFor(settingPackageId, 'ladder'), settingPackageId);
  const calendar = parseCalendarProfile(settingDataFor(settingPackageId, 'calendar'));
  let defaultEntryLocationId: string | undefined;
  let entryRank = -1;
  for (const root of ladder.roots) {
    const rank = ladder.rankOrder.indexOf(root.scale);
    if (rank > entryRank) { entryRank = rank; defaultEntryLocationId = root.id; }
  }
  const entryLocationId = campaign?.entryLocationId ?? defaultEntryLocationId;
  if (campaign?.entryLocationId && !ladder.roots.some(root => root.id === campaign.entryLocationId)) {
    throw new Error(`Стартовая точка кампании ${campaignPackageId} отсутствует в лестнице ${settingPackageId}.`);
  }
  const startTimeSec = calendar.kind === 'counter'
    ? (1 - calendar.epoch.day) * SECONDS_PER_DAY
      - (calendar.epoch.hour ?? 0) * 3600 - (calendar.epoch.minute ?? 0) * 60 + 8 * 3600
    : 0;
  return {
    schema: 'campaign-profile/1', baseline: 'empty-campaign', settingPackageId,
    ...(campaignPackageId && campaign ? { campaignPackageId, campaignBundle: structuredClone(campaign.adventure) } : {}),
    ...(entryLocationId ? { entryLocationId } : {}), rulesPackageId: null,
    startTimeSec,
  };
}

/** Setting roots are campaign navigation nodes; an optional template contributes catalog content only. */
export function seedStateForProfile(profile: CampaignProfile): State {
  const ladder = parseScaleLadderProfile(settingDataFor(profile.settingPackageId, 'ladder'), profile.settingPackageId);
  const state = emptyState();
  state.settingPackageId = profile.settingPackageId;
  state.time = { sec: profile.startTimeSec ?? 0, tempo: 'hour' };
  const roots = Object.fromEntries(ladder.roots.map(root => [root.id, {
    id: root.id, name: root.name, scale: root.scale,
    ...(root.parentId ? { parentId: root.parentId } : {}),
    ...(root.ref ? { ref: ref(root.ref.kind as EntityKind, root.ref.id) } : {}),
    ...(root.geo ? { geo: root.geo } : {}),
  }]));
  if (profile.entryLocationId && !roots[profile.entryLocationId]) throw new Error(`стартовое место ${profile.entryLocationId} отсутствует в лестнице ${profile.settingPackageId}`);
  state.startLocationId = profile.entryLocationId;
  const campaignBundle = profile.campaignPackageId
    ? profile.campaignBundle
      ? parseAdventureBundle(profile.campaignBundle)
      : builtInCampaignForId(profile.campaignPackageId)?.adventure
    : undefined;
  if (profile.campaignPackageId && (!campaignBundle || campaignBundle.id !== profile.campaignPackageId || campaignBundle.setting !== profile.settingPackageId)) {
    throw new Error(`Снимок кампании ${profile.campaignPackageId} не совпадает с выбранным сеттингом.`);
  }
  const campaignContent = profile.campaignPackageId && campaignBundle
    ? builtInCampaignContent(profile.campaignPackageId, campaignBundle)
    : undefined;
  state.world = {
    locations: roots,
    factions: {},
    threads: {},
    ...(campaignContent ? { importedContent: { [campaignContent.id]: campaignContent } } : {}),
  };
  let settingRootId = profile.entryLocationId;
  const seen = new Set<string>();
  while (settingRootId && roots[settingRootId]?.parentId && !seen.has(settingRootId)) {
    seen.add(settingRootId);
    settingRootId = roots[settingRootId].parentId;
  }
  if (settingRootId && roots[settingRootId]) state.settingRootId = settingRootId;
  return state;
}

/** Legacy event logs have no campaign root and continue to use the original FR demo seed. */
export function campaignProfileFromEvents(events: readonly DomainEvent[]): CampaignProfile | undefined {
  const first = events[0];
  return first?.type === 'CAMPAIGN_CREATED' ? (first.payload as { profile?: CampaignProfile }).profile : undefined;
}

/** Choose the initial state from the immutable first event, preserving old FR log compatibility. */
export function seedStateForEvents(events: readonly DomainEvent[]): State {
  const profile = campaignProfileFromEvents(events);
  return profile ? seedStateForProfile(profile) : seedState();
}

function initialEvents(profile?: CampaignProfile): DomainEvent[] {
  if (!profile) return seedLog();
  return [{
    id: 'campaign-created', seq: 0, at: 0, worldSec: 0, type: 'CAMPAIGN_CREATED', payload: { profile },
  }];
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
 * сохраняет исходную строку в копию, восстанавливается из сида и сообщает причину через `onRecover`.
 * Если исходную строку нельзя надёжно скопировать или чтение недоступно, основной ключ не трогается.
 */
export function seedEngine(opts: SeedEngineOptions = {}): EngineStoreApi {
  const { persist, campaignProfile, onRecover = reason => console.warn(`лог сессии не поднялся, стол собран из сида заново: ${reason}`), onRecoveryCopy, ...rest } = opts;
  const reportExistingRecoveryCopy = () => {
    try {
      const raw = persist?.loadRecoveryCopy?.();
      if (raw !== null && raw !== undefined) onRecoveryCopy?.(raw);
    } catch { /* recovery copy is an optional export path */ }
  };
  reportExistingRecoveryCopy();
  let cachedEvents: DomainEvent[] | null | undefined;
  const storedEvents = () => {
    if (cachedEvents === undefined) cachedEvents = persist?.load() ?? null;
    return cachedEvents;
  };
  const defaults = () => initialEvents(campaignProfile);
  const primed: EventStore = {
    load: () => storedEvents() ?? defaults(),
    save: events => persist?.save(events),
    clear: () => persist?.clear(),
  };
  const baseEvents = (events: readonly DomainEvent[]) => {
    const profile = campaignProfileFromEvents(events);
    return profile ? seedStateForProfile(profile) : seedState();
  };
  const fallback = (profile = campaignProfile) => {
    const events = initialEvents(profile);
    const memory = memoryStore();
    memory.save(events);
    return createEngineStore(baseEvents(events), { ...rest, persist: memory });
  };
  try {
    const events = primed.load()!;
    return createEngineStore(baseEvents(events), { ...rest, persist: primed });
  } catch (err) {
    if (!persist) throw err;
    const reason = err instanceof Error ? err.message : String(err);

    // A read failure does not prove that the saved log is invalid. Preserve the key and
    // continue with a memory-only seed so the next user action cannot overwrite unseen data.
    if (err instanceof EventStoreReadError) {
      onRecover(reason, null);
      return fallback();
    }

    // Keep the exact stored text available before replacing the main key. If the adapter cannot
    // prove that it retained and can return that text, leave the source untouched and recover in memory.
    let recoveryCopy: string | null = null;
    try {
      if (persist.preserveRecoveryCopy?.() === true) {
        recoveryCopy = persist.loadRecoveryCopy?.() ?? null;
      }
    } catch { /* fall through to memory recovery without touching the source */ }
    if (recoveryCopy === null) {
      onRecover(reason, null);
      return fallback(campaignProfileFromEvents(cachedEvents ?? []) ?? campaignProfile);
    }

    onRecover(reason, recoveryCopy);
    // The source text is now recoverable from its copy. Do not read the failing store a second time;
    // write the rebuilt seed through this adapter.
    persist.clear();
    const rebuiltEvents = initialEvents(campaignProfileFromEvents(cachedEvents ?? []) ?? campaignProfile);
    const rebuilt: EventStore = {
      load: () => rebuiltEvents,
      save: events => persist.save(events),
      clear: () => persist.clear(),
    };
    const store = createEngineStore(baseEvents(rebuiltEvents), { ...rest, persist: rebuilt });
    persist.save(store.getState().events); // битого лога больше нет — на его месте сразу сид
    return store;
  }
}

export interface SeedEngineOptions extends CreateEngineOptions {
  /** Profile for a new empty campaign; legacy/demo sessions keep the historical FR seed. */
  campaignProfile?: CampaignProfile;
  /** Хранилище не поднялось: причина и точная исходная строка, если она надёжно сохранена. */
  onRecover?: (reason: string, recoveryCopy?: string | null) => void;
  /** Ранее сохранённая исходная строка доступна даже после перезагрузки. */
  onRecoveryCopy?: (recoveryCopy: string) => void;
}
