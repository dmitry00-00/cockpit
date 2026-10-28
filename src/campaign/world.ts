// Мир §13: Neverwinter, три фракции, три нити, четыре предложения симуляции и один слух для мастера. Модель мира
// (ROADMAP 3.3, Q6, 28.10.2026): места и фракции ссылаются на справочник вики, у фракций — отношения, у мест — цены
// товаров и веса встреч; плюс две церкви — Lathander (бог Brother Aldric) и Helm (бог места Neverwinter).
// Сроки нитей — от времени сида, поэтому функции берут nowSec, а не константы. Имена — латиницей, как в книгах.
import type { Fact, World, WorldDelta } from '../engine/state';
import { ref } from '../entities/ref';
import { SECONDS_PER_DAY } from '../engine/state';

export const LOCATION = {
  greatWheel: 'loc-great-wheel', material: 'loc-material', realmspace: 'loc-realmspace', toril: 'loc-toril', faerun: 'loc-faerun',
  swordCoastNorth: 'loc-sword-coast-north', neverwinter: 'loc-neverwinter', southGate: 'loc-south-gate',
  triboarTrail: 'loc-triboar-trail', neverwinterWood: 'loc-neverwinter-wood', oldOwlWell: 'loc-old-owl-well',
} as const;
export const FACTION = {
  zhentarim: 'fac-zhentarim', lordsAlliance: 'fac-lords-alliance', harpers: 'fac-harpers', churchOfLathander: 'fac-church-of-lathander', churchOfHelm: 'fac-church-of-helm',
} as const;
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
      [LOCATION.toril]: { id: LOCATION.toril, name: 'Toril', scale: 'planet', parentId: LOCATION.realmspace, geo: { map: 'toril', x: 15300, y: 6700, r: 15300 } },
      // ref — место справочника карты: id Toril GIS (content/maps/toril-places.json); нет его в справочнике — ссылки нет, не угадываем.
      [LOCATION.faerun]: { id: LOCATION.faerun, name: 'Faerûn', scale: 'continent', parentId: LOCATION.toril, ref: ref('place', '0b786ca2-0cb5-413e-9e75-a7962ca03cfe'), geo: { map: 'toril', x: 12800, y: 4200, r: 5400, ry: 2900 } },
      [LOCATION.swordCoastNorth]: { id: LOCATION.swordCoastNorth, name: 'Sword Coast North', scale: 'region', parentId: LOCATION.faerun, geo: { map: 'toril', x: 8750, y: 2700, r: 450 } },
      [LOCATION.neverwinter]: { id: LOCATION.neverwinter, name: 'Neverwinter', scale: 'settlement', parentId: LOCATION.swordCoastNorth, population: 23_000, danger: 'medium', pricePercent: 10, ref: ref('place', '7e243b80-8918-42fa-b60e-03cec8bdb184'), geo: { map: 'toril', x: 8522, y: 2610, r: 120 } },
      // Здание §3 — Южные ворота Neverwinter: место на уровне здания, чтобы `]` из поселения было куда спуститься.
      [LOCATION.southGate]: { id: LOCATION.southGate, name: 'Южные ворота', scale: 'building', parentId: LOCATION.neverwinter },
      // geo — пиксели исходника карты HandsomeRob (content/maps/toril.json): по подписям на самой карте, 27.10.2026.
      // Подрегионы Sword Coast North: тот же уровень, что родитель, — лестница держит одно место на уровень,
      // и подрегион становится точкой фокуса региона, когда мастер его выбрал.
      [LOCATION.triboarTrail]: { id: LOCATION.triboarTrail, name: 'Triboar Trail', scale: 'region', parentId: LOCATION.swordCoastNorth, geo: { map: 'toril', x: 8840, y: 2730, r: 220 } },
      [LOCATION.neverwinterWood]: { id: LOCATION.neverwinterWood, name: 'Neverwinter Wood', scale: 'region', parentId: LOCATION.swordCoastNorth, ref: ref('place', 'f5347333-dff6-4184-a3e0-250f5af9677b'), geo: { map: 'toril', x: 8570, y: 2520, r: 120 } },
      [LOCATION.oldOwlWell]: { id: LOCATION.oldOwlWell, name: 'Old Owl Well', scale: 'building', parentId: LOCATION.swordCoastNorth, geo: { map: 'toril', x: 8700, y: 2668 } },
    },
    factions: {
      // Отношения −3…+3 — по союзникам и врагам организаций вики: Harpers и Lords' Alliance — союзники, Zhentarim —
      // враг Harpers; с Lords' Alliance вики пишет и вражду (XIV век), и союз (к 1488 DR) — настороженно, −1.
      [FACTION.zhentarim]: {
        id: FACTION.zhentarim, name: 'Zhentarim', renown: 0, influencePercent: 45, trend: 1, goal: 'контроль над Triboar Trail',
        ref: ref('organization', 'zhentarim'), relations: { [FACTION.harpers]: -2, [FACTION.lordsAlliance]: -1 },
      },
      [FACTION.lordsAlliance]: {
        id: FACTION.lordsAlliance, name: "Lords' Alliance", renown: 12,
        ref: ref('organization', 'lords-alliance'), relations: { [FACTION.harpers]: 2, [FACTION.zhentarim]: -1 },
      },
      [FACTION.harpers]: {
        id: FACTION.harpers, name: 'Harpers', renown: 5,
        ref: ref('organization', 'harpers'), relations: { [FACTION.lordsAlliance]: 2, [FACTION.zhentarim]: -2 },
      },
      // Церкви — организации вики с богом (E5): известность партии у них растёт так же, как у остальных фракций.
      [FACTION.churchOfLathander]: { id: FACTION.churchOfLathander, name: 'Church of Lathander', renown: 0, ref: ref('organization', 'church-of-lathander') },
      [FACTION.churchOfHelm]: { id: FACTION.churchOfHelm, name: 'Church of Helm', renown: 0, ref: ref('organization', 'church-of-helm') },
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
      patch: { kind: 'price', id: LOCATION.neverwinter, goods: 'weapons', value: 10 },
    },
    {
      id: DELTA.lycanthropes, scale: 'region', subject: 'Встречи с ликантропами · Neverwinter Wood',
      was: '×1', now: '×2 на 3 ночи', cause: 'полнолуние через 3 дня', causeId: THREAD.moonAndPack, status: 'pending',
      threadIds: [THREAD.moonAndPack],
      // «На 3 ночи» — словами: срок веса ведёт мастер (обратное предложение), модель хранит только множитель.
      patch: { kind: 'encounter', id: LOCATION.neverwinterWood, key: 'Werewolf', value: 2 },
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
