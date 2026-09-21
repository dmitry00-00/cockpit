// Мир §13: Neverwinter, три фракции, три нити, четыре предложения симуляции и один слух для мастера.
// Сроки нитей — от времени сида, поэтому функции берут nowSec, а не константы. Имена — латиницей, как в книгах.
import type { Fact, World, WorldDelta } from '../engine/state';
import { SECONDS_PER_DAY } from '../engine/state';

export const LOCATION = {
  greatWheel: 'loc-great-wheel', material: 'loc-material', realmspace: 'loc-realmspace', toril: 'loc-toril', faerun: 'loc-faerun',
  swordCoastNorth: 'loc-sword-coast-north', neverwinter: 'loc-neverwinter', southGate: 'loc-south-gate',
  triboarTrail: 'loc-triboar-trail', neverwinterWood: 'loc-neverwinter-wood', oldOwlWell: 'loc-old-owl-well',
} as const;
export const FACTION = { zhentarim: 'fac-zhentarim', lordsAlliance: 'fac-lords-alliance', harpers: 'fac-harpers' } as const;
export const THREAD = { missingCaravan: 'thr-missing-caravan', oldOwlWell: 'thr-old-owl-well', moonAndPack: 'thr-moon-and-pack' } as const;
export const DELTA = { zhentarimTrail: 'd-zhentarim-trail', ironPrices: 'd-iron-prices', lycanthropes: 'd-lycanthropes', owlWellRumor: 'd-owl-well-rumor' } as const;
export const FACT = { owlWellUndead: 'f-owl-well-undead', zhentarimAgent: 'f-zhentarim-agent' } as const;

const days = (n: number) => n * SECONDS_PER_DAY;

export function seedWorld(nowSec: number): World {
  return {
    locations: {
      // Лестница §3 вверх от партии до Великого Колеса: одно место на уровень, уровень без места на лестнице
      // не показывается. Великое Колесо и Материальный — по-русски, как в референсе (это понятия, не имена мест);
      // Realmspace, Toril, Faerûn — латиницей, как в книгах. Сводка «что изменилось» называет уровни отсюда же.
      [LOCATION.greatWheel]: { id: LOCATION.greatWheel, name: 'Великое Колесо', scale: 'cosmology' },
      [LOCATION.material]: { id: LOCATION.material, name: 'Материальный', scale: 'plane', parentId: LOCATION.greatWheel },
      [LOCATION.realmspace]: { id: LOCATION.realmspace, name: 'Realmspace', scale: 'system', parentId: LOCATION.material },
      [LOCATION.toril]: { id: LOCATION.toril, name: 'Toril', scale: 'planet', parentId: LOCATION.realmspace },
      [LOCATION.faerun]: { id: LOCATION.faerun, name: 'Faerûn', scale: 'continent', parentId: LOCATION.toril },
      [LOCATION.swordCoastNorth]: { id: LOCATION.swordCoastNorth, name: 'Sword Coast North', scale: 'region', parentId: LOCATION.faerun },
      [LOCATION.neverwinter]: { id: LOCATION.neverwinter, name: 'Neverwinter', scale: 'settlement', parentId: LOCATION.swordCoastNorth, population: 23_000, danger: 'medium', pricePercent: 10 },
      // Здание §3 — Южные ворота Neverwinter: место на уровне здания, чтобы `]` из поселения было куда спуститься.
      [LOCATION.southGate]: { id: LOCATION.southGate, name: 'Южные ворота', scale: 'building', parentId: LOCATION.neverwinter },
      // Подрегионы Sword Coast North: тот же уровень, что родитель, — лестница держит одно место на уровень,
      // и подрегион становится точкой фокуса региона, когда мастер его выбрал.
      [LOCATION.triboarTrail]: { id: LOCATION.triboarTrail, name: 'Triboar Trail', scale: 'region', parentId: LOCATION.swordCoastNorth },
      [LOCATION.neverwinterWood]: { id: LOCATION.neverwinterWood, name: 'Neverwinter Wood', scale: 'region', parentId: LOCATION.swordCoastNorth },
      [LOCATION.oldOwlWell]: { id: LOCATION.oldOwlWell, name: 'Old Owl Well', scale: 'building', parentId: LOCATION.swordCoastNorth },
    },
    factions: {
      [FACTION.zhentarim]: { id: FACTION.zhentarim, name: 'Zhentarim', renown: 0, influencePercent: 45, trend: 1, goal: 'контроль над Triboar Trail' },
      [FACTION.lordsAlliance]: { id: FACTION.lordsAlliance, name: "Lords' Alliance", renown: 12 },
      [FACTION.harpers]: { id: FACTION.harpers, name: 'Harpers', renown: 5 },
    },
    threads: {
      // «Открыта 12 дней» — и трогали её сегодня; «без внимания 9 дней» — открыта раньше, чем забыта.
      [THREAD.missingCaravan]: { id: THREAD.missingCaravan, name: 'The Missing Caravan', status: 'open', openedSec: nowSec - days(12), lastTouchedSec: nowSec },
      [THREAD.oldOwlWell]: { id: THREAD.oldOwlWell, name: 'Old Owl Well', status: 'open', openedSec: nowSec - days(20), lastTouchedSec: nowSec - days(9) },
      [THREAD.moonAndPack]: { id: THREAD.moonAndPack, name: 'Луна и стая', status: 'open', openedSec: nowSec - days(2), lastTouchedSec: nowSec - days(1) },
    },
  };
}

/**
 * Четыре предложения §13, все pending: в мире стоит `was`, `now` живёт только здесь, пока мастер не решил.
 * `causeId` — что породило: нить (караван, полнолуние) или факт мастера (слух о мертвецах растёт из того,
 * что их и правда видели, — так принятый слух связывается в журнале с фактом, шаг 7). Нити — явно.
 */
export function seedDeltas(): Record<string, WorldDelta> {
  const list: WorldDelta[] = [
    {
      id: DELTA.zhentarimTrail, scale: 'region', subject: 'Zhentarim · Triboar Trail',
      was: 'влияние 2', now: 'влияние 3', cause: 'караван всё ещё не найден', causeId: THREAD.missingCaravan, status: 'pending',
      threadIds: [THREAD.missingCaravan],
      variants: [
        { id: 'v1', now: 'влияние 3', cause: 'караван всё ещё не найден' },
        { id: 'v2', now: 'влияние 2', cause: 'Harpers перехватили курьера' },
      ],
    },
    {
      id: DELTA.ironPrices, scale: 'settlement', subject: 'Цены на железо и оружие · Neverwinter',
      was: 'базовые', now: '+10%', cause: 'караван всё ещё не найден', causeId: THREAD.missingCaravan, status: 'pending',
      threadIds: [THREAD.missingCaravan],
    },
    {
      id: DELTA.lycanthropes, scale: 'region', subject: 'Встречи с ликантропами · Neverwinter Wood',
      was: '×1', now: '×2 на 3 ночи', cause: 'полнолуние через 3 дня', causeId: THREAD.moonAndPack, status: 'pending',
      threadIds: [THREAD.moonAndPack],
    },
    {
      id: DELTA.owlWellRumor, scale: 'settlement', subject: 'Слух в таверне · Neverwinter',
      was: 'тишина', now: 'у Old Owl Well видели восставших мертвецов', cause: 'у колодца их и правда видели; нить без внимания 9 дней', causeId: FACT.owlWellUndead, status: 'pending',
      threadIds: [THREAD.oldOwlWell],
    },
  ];
  return Object.fromEntries(list.map(d => [d.id, d]));
}

/** Секреты мастера: игроки их не видят, пока FACT_REVEALED не откроет. Каждый привязан к нити — карточка нити напоминает о нём. */
export function seedFacts(): Record<string, Fact> {
  const list: Fact[] = [
    { id: FACT.owlWellUndead, text: 'У Old Owl Well видели восставших мертвецов', visibility: 'dm', scale: 'region', subjectId: LOCATION.oldOwlWell, threadIds: [THREAD.oldOwlWell] },
    { id: FACT.zhentarimAgent, text: 'Агент Zhentarim замечен у ворот Neverwinter', visibility: 'dm', scale: 'settlement', subjectId: LOCATION.neverwinter, threadIds: [THREAD.missingCaravan] },
  ];
  return Object.fromEntries(list.map(f => [f.id, f]));
}
