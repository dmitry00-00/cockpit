// Место как сцена (ROADMAP 6.1, DESIGN Д2): любое место в любой день уже чем-то наполнено. Проекция — ничего не
// меняет и ничего не сочиняет: календарь, боги места и их святые дни, организации и их отношения, жители, цены,
// встречи округи и регион A5E, нити партии, канон места из хронологии. Справочник места (вики) грузит страница и
// передаёт готовым (`SceneCanon`): функция чистая. Пустая секция не попадает в сцену. Игрокам — только открытое:
// без канона вики, встреч, ждущего и секретных заметок.
import { SECONDS_PER_DAY, type Location, type State, type WorldPatch } from '../engine/state';
import { ref, type EntityRef } from '../entities/ref';
import { GOODS_LABEL, RELATION_LABEL, signed } from '../components/labels';
import { ENCOUNTER_TYPE_LABEL, JOURNEY_REGIONS, activityDc, tierOfLevel, type RegionTier } from '../rules/a5e/journey';
import { MONSTERS } from '../rules/srd/monsters';
import type { ChronoEvent } from '../world/chronology';
import { orgExistsIn, type Organization, type PlaceFaith } from '../world/organizations';
import { residentsAlive, type Resident } from '../world/people';
import { SEASON_LABELS, TENDAY, harptos, moonState, seasonOf } from './calendar';
import { eraOf } from './era';
import { holyDaysOn, holyWhat, isAnnual } from './holyDays';
import { priceRowOf } from './pulse';
import { weatherLabel, weatherOf } from './weather';

export type SceneSectionId = 'now' | 'faith' | 'powers' | 'people' | 'market' | 'around' | 'threads' | 'chronicle';

export const SCENE_TITLE: Readonly<Record<SceneSectionId, string>> = {
  now: 'Сейчас', faith: 'Вера', powers: 'Силы', people: 'Люди', market: 'Рынок', around: 'Округа', threads: 'Нити', chronicle: 'Канон места',
};

export interface SceneLink { label: string; ref: EntityRef }

/** Строка сцены: имя — ссылкой на карточку, если карточка есть; `with` — вторая сторона отношения. */
export interface SceneRow {
  label: string;
  ref?: EntityRef;
  with?: SceneLink;
  note?: string;
  /** Значение ждущего предложения — рядом с нынешним, не вместо него. */
  pending?: string;
  /** Строка канона по-английски, как в вики. */
  en?: boolean;
}

export interface SceneSection { id: SceneSectionId; title: string; rows: SceneRow[] }

export interface Scene { sec: number; year: number; sections: SceneSection[] }

/** Справочник места — вики и хронология; страница грузит его сама и передаёт готовым. */
export interface SceneCanon {
  /** Место справочника карты: класс GIS выбирает регион A5E. */
  place?: { id: string; kind: string };
  faith?: PlaceFaith;
  /** Организации с базой здесь. */
  based: readonly Organization[];
  /** Церкви одного бога. */
  churchesOf: (deity: string) => readonly Organization[];
  org: (id: string) => Organization | undefined;
  deityName: (id: string) => string | undefined;
  residents?: readonly Resident[];
  /** NPC → организации, в которых он состоит (категории «Members of …» вики). */
  orgsOf?: (person: string) => readonly string[];
  /** События хронологии о месте (Х2) — годы до сцены и после; сцена берёт прошлое. */
  events?: readonly ChronoEvent[];
}

/** Где сцена: место кампании, место справочника карты — или оба, если место кампании ссылается на справочник. */
export interface SceneAt { location?: string; place?: string }

export interface SceneOptions {
  /** Глазами игроков: только открытое. */
  players?: boolean;
  /** Уровень опасности A5E; по умолчанию — ступень партии. */
  tier?: RegionTier;
}

const DAY = SECONDS_PER_DAY;
const MOON_WORD = { new: 'новая', waxing: 'растёт', full: 'полная', waning: 'убывает' } as const;
/** Событий канона места в сцене — последние по году. */
export const SCENE_CANON_EVENTS = 5;

/**
 * Класс места GIS → регион A5E. По описаниям регионов: Urban Township — «from mighty sprawling cities to smaller
 * bustling towns», Country Shire — «small villages and rural communities»; лес, горы, болото, пустыня, лёд, море —
 * как классы местности карты (REGION_OF_TERRAIN). Руины и гробницы — нет: регион вокруг них решает мастер.
 */
const REGION_OF_KIND: Readonly<Record<string, string>> = {
  City: 'urban-township', Town: 'urban-township', Village: 'country-shire', settlement: 'urban-township',
  Forest: 'tangled-forest', 'Temperate Forest': 'tangled-forest', 'Boreal Forest': 'tangled-forest', 'Tropical Forest': 'tangled-forest', forest: 'tangled-forest',
  Mountain: 'lofty-mountains', Mountains: 'lofty-mountains', Volcano: 'lofty-mountains', Pass: 'lofty-mountains', mountain: 'lofty-mountains', pass: 'lofty-mountains',
  Hill: 'rolling-grasslands', Hills: 'rolling-grasslands', Plain: 'rolling-grasslands', Plains: 'rolling-grasslands', Grassland: 'rolling-grasslands', hills: 'rolling-grasslands',
  Swamp: 'unrelenting-marsh', Marsh: 'unrelenting-marsh', swamp: 'unrelenting-marsh',
  Desert: 'parched-sands', Sand: 'parched-sands', desert: 'parched-sands',
  Glacier: 'frozen-wastes', Cave: 'underland-realm', River: 'flowing-river', river: 'flowing-river',
  Sea: 'restless-sea', Bay: 'restless-sea', 'Coastal Sea': 'restless-sea', sea: 'restless-sea',
};

export const regionOfKind = (kind: string | undefined): string | undefined => (kind ? REGION_OF_KIND[kind] : undefined);

/** Блок SRD по имени встречи: «Werewolf» → первый из «Werewolf, Human Form…»; нет — без ссылки. */
function monsterRef(name: string): EntityRef | undefined {
  const n = name.toLowerCase();
  const hit = Object.entries(MONSTERS).find(([, m]) => m.name.toLowerCase() === n)
    ?? Object.entries(MONSTERS).find(([, m]) => m.name.toLowerCase().startsWith(`${n},`));
  return hit ? ref('monster', hit[0]) : undefined;
}

const pctLabel = (index: number) => (index === 100 ? 'базовые' : signed(index - 100, '%'));
const inDaysLabel = (n: number) => (n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} дн.`);

/** Место кампании и его потомки по лестнице — их факты и предложения относятся к сцене. */
function subtree(locations: State['world']['locations'], id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of Object.values(locations)) if (l.parentId && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); grew = true; }
  }
  return out;
}

const patchPlace = (p: WorldPatch | undefined): string | undefined =>
  p && (p.kind === 'location' || p.kind === 'price' || p.kind === 'encounter') ? p.id : undefined;

export function sceneOf(state: State, at: SceneAt, sec: number, canon?: SceneCanon, opts: SceneOptions = {}): Scene {
  const { players = false } = opts;
  const { locations, factions, threads } = state.world;
  const location: Location | undefined = at.location ? locations[at.location]
    : at.place ? Object.values(locations).find(l => l.ref === ref('place', at.place!)) : undefined;
  const year = harptos(sec).year;
  const era = eraOf(year);
  const w = players ? undefined : canon;
  const pending = players ? [] : Object.values(state.deltas).filter(d => d.status === 'pending');
  const patches = pending.flatMap(d => (d.patch ? [d.patch] : []));
  const sections: SceneSection[] = [];
  const add = (id: SceneSectionId, rows: SceneRow[]) => { if (rows.length) sections.push({ id, title: SCENE_TITLE[id], rows }); };

  // Сейчас: день, праздник Харптоса, сезон, Selûne, погода.
  const d = harptos(sec);
  const moon = moonState(sec);
  add('now', [
    { label: d.festival ? `${d.festival} ${d.year} DR` : `${d.day} ${d.month} ${d.year} DR`, note: d.festival ? 'праздник Харптоса' : SEASON_LABELS[seasonOf(sec)] },
    { label: 'Selûne', ref: ref('body', 'selune'), note: moon.phase === 'full' ? MOON_WORD.full : `${MOON_WORD[moon.phase]} · полнолуние ${inDaysLabel(moon.daysToFull)}` },
    { label: weatherLabel(weatherOf(sec)), note: 'погода дня' },
  ]);

  // Вера: боги места, церкви (с базой здесь и церкви богов места), святые дни богов места на десятидневку вперёд.
  if (w) {
    const gods = w.faith?.deities ?? [];
    const live = (list: readonly Organization[]) => list.filter(o => orgExistsIn(o, year));
    const churches = [...new Map([...live(w.based.filter(o => o.church)), ...gods.flatMap(g => live(w.churchesOf(g)))].map(o => [o.id, o])).values()];
    const today = Math.floor(sec / DAY) * DAY;
    const holy: SceneRow[] = [];
    if (gods.length) {
      const scope = new Set(gods);
      for (let i = 0; i < TENDAY; i++) {
        for (const h of holyDaysOn(today + i * DAY, era, scope).filter(x => isAnnual(x.rule))) {
          const what = holyWhat(h);
          holy.push({ label: h.name, ref: ref('deity', h.deity), note: `святой день ${inDaysLabel(i)}${what ? ` · ${what}` : ''}` });
        }
      }
    }
    add('faith', [
      ...holy,
      ...gods.map(id => ({ label: w.deityName(id) ?? id, ref: ref('deity', id), note: 'бог места' })),
      ...churches.map(o => campaignOrNot(o, 'церковь')),
    ]);
  }

  // Силы: отношения фракций кампании числом −3…+3; пары вики, где обе стороны здесь или вторая — фракция кампании;
  // остальные организации с базой здесь в год сцены, фракции кампании — первыми.
  function campaignOrNot(o: Organization, what?: string): SceneRow {
    const f = Object.values(factions).find(x => x.ref === ref('organization', o.id));
    return f
      ? { label: f.name, ref: ref('faction', f.id), note: `${what ? `${what} · ` : ''}фракция кампании · известность ${f.renown}` }
      : { label: o.name, ref: ref('organization', o.id), ...(what ? { note: what } : o.type ? { note: o.type } : {}) };
  }
  if (w) {
    const here = w.based.filter(o => !o.church && orgExistsIn(o, year));
    const hereIds = new Set(here.map(o => o.id));
    const campaignOrg = new Map(Object.values(factions).flatMap(f => (f.ref?.startsWith('organization:') ? [[f.ref.slice(13), f] as const] : [])));
    const sideOf = (id: string): SceneLink | undefined => {
      const f = campaignOrg.get(id);
      if (f) return { label: f.name, ref: ref('faction', f.id) };
      const o = w.org(id);
      return o && hereIds.has(id) ? { label: o.name, ref: ref('organization', o.id) } : undefined;
    };
    const pairs = new Map<string, SceneRow>();
    for (const o of here) {
      for (const [list, note] of [[o.enemies, 'враги по вики'], [o.allies, 'союзники по вики']] as const) {
        for (const other of list ?? []) {
          const b = sideOf(other);
          const a = sideOf(o.id) ?? { label: o.name, ref: ref('organization', o.id) };
          const key = [o.id, other].sort().join('|');
          if (b && other !== o.id && !pairs.has(key) && (!w.org(other) || orgExistsIn(w.org(other)!, year))) pairs.set(key, { ...a, with: b, note });
        }
      }
    }
    // Фракции кампании здесь — по организации с базой здесь; их отношения — числом мира, ждущее рядом.
    const present = Object.values(factions).filter(f => f.ref && hereIds.has(f.ref.slice(13)));
    const campaignPairs: SceneRow[] = [];
    for (const f of present) {
      for (const [other, value] of Object.entries(f.relations ?? {})) {
        const g = factions[other];
        if (!g || (present.includes(g) && g.id < f.id)) continue;
        const p = patches.find(x => x.kind === 'relation' && ((x.id === f.id && x.other === other) || (x.id === other && x.other === f.id)));
        campaignPairs.push({
          label: f.name, ref: ref('faction', f.id), with: { label: g.name, ref: ref('faction', g.id) }, note: `${signed(value)} ${RELATION_LABEL[value]}`,
          ...(p && p.kind === 'relation' ? { pending: `${signed(p.value)} ${RELATION_LABEL[p.value]}` } : {}),
        });
      }
    }
    // Организация из пары уже названа отношением — списком ниже не повторяется (факт живёт в одном месте).
    const inPairs = new Set([...pairs.keys()].flatMap(k => k.split('|')));
    add('powers', [
      ...campaignPairs,
      ...pairs.values(),
      ...here.filter(o => !inPairs.has(o.id)).sort((a, b) => Number(!campaignOrg.has(a.id)) - Number(!campaignOrg.has(b.id)) || a.name.localeCompare(b.name)).map(o => campaignOrNot(o)),
    ]);

    // Люди: живые в год сцены; члены организаций — первыми, с организациями в заметке.
    const people = residentsAlive(w.residents, year).map(([id, name]) => {
      const orgs = (w.orgsOf?.(id) ?? []).map(o => w.org(o)?.name).filter((x): x is string => !!x);
      return { label: name, ref: ref('person', id), ...(orgs.length ? { note: orgs.slice(0, 2).join(', ') + (orgs.length > 2 ? ` и ещё ${orgs.length - 2}` : '') } : {}) };
    });
    add('people', [...people.filter(p => p.note), ...people.filter(p => !p.note)]);
  }

  // Рынок: индексы цен места кампании против базовых (100), ждущее — рядом.
  if (location && (location.scale === 'settlement' || location.pricePercent !== undefined || location.prices)) {
    const row = priceRowOf(location, patches);
    const goods = Object.entries(row.goods).filter(([, c]) => c.index !== row.all.index || c.pending !== undefined);
    add('market', [
      { label: 'Все товары', note: pctLabel(row.all.index), ...(row.all.pending !== undefined ? { pending: pctLabel(row.all.pending) } : {}) },
      ...goods.map(([g, c]) => ({ label: GOODS_LABEL[g as keyof typeof GOODS_LABEL], note: pctLabel(c.index), ...(c.pending !== undefined ? { pending: pctLabel(c.pending) } : {}) })),
    ]);
  }

  // Округа: веса встреч места, его детей и соседей по лестнице; регион A5E и его таблица по ступени партии.
  if (!players) {
    const near = location ? Object.values(locations).filter(l => l.id === location.id || l.parentId === location.id || (location.parentId && l.parentId === location.parentId)) : [];
    const rows: SceneRow[] = near.flatMap(l => {
      const keys = new Set([...Object.keys(l.encounters ?? {}), ...patches.flatMap(p => (p.kind === 'encounter' && p.id === l.id ? [p.key] : []))]);
      return [...keys].sort().map(key => {
        const p = patches.find(x => x.kind === 'encounter' && x.id === l.id && x.key === key);
        const mref = monsterRef(key);
        return { label: key, ...(mref ? { ref: mref } : {}), note: `${l.name} ×${l.encounters?.[key] ?? 1}`, ...(p && p.kind === 'encounter' ? { pending: `×${p.value}` } : {}) };
      });
    });
    const regionId = regionOfKind(canon?.place?.kind) ?? (location?.scale === 'settlement' ? 'urban-township' : undefined);
    const region = regionId ? JOURNEY_REGIONS[regionId] : undefined;
    if (region) {
      const tier = opts.tier ?? tierOfLevel(Math.max(1, ...state.party.map(id => state.actors[id]?.sheet?.level ?? 1)));
      rows.push({ label: region.name, note: `регион A5E · уровень опасности ${tier} · DC занятий ${activityDc(tier)}` });
      for (const e of region.encounters[String(tier)] ?? []) {
        const mref = e.type === 'monster' ? monsterRef(e.name) : undefined;
        rows.push({ label: e.name, ...(mref ? { ref: mref } : {}), note: `d100 ${e.from === e.to ? e.from : `${e.from}–${e.to}`} · ${ENCOUNTER_TYPE_LABEL[e.type]}` });
      }
    }
    add('around', rows);
  }

  // Нити: открытые нити, о которых говорят факты и ждущие предложения места и его потомков. Игрокам — открытые факты.
  if (location) {
    const ids = subtree(locations, location.id);
    const byThread = new Map<string, string[]>();
    const note = (t: string, text: string) => byThread.set(t, [...(byThread.get(t) ?? []), text]);
    for (const f of Object.values(state.facts)) {
      if (!f.subjectId || !ids.has(f.subjectId) || (players && f.visibility !== 'players')) continue;
      for (const t of f.threadIds ?? []) note(t, f.text);
    }
    for (const dlt of pending) {
      const where = patchPlace(dlt.patch);
      if (!where || !ids.has(where)) continue;
      for (const t of dlt.threadIds ?? (threads[dlt.causeId] ? [dlt.causeId] : [])) note(t, `ждёт решения: ${dlt.subject}`);
    }
    add('threads', [...byThread].filter(([t]) => threads[t]?.status === 'open').map(([t, texts]) => ({ label: threads[t].name, ref: ref('thread', t), note: texts.join('; ') })));
  }

  // Канон места: последние события хронологии о нём до года сцены, по-английски, как в вики.
  if (w?.events) {
    const past = w.events.filter(e => e.year <= year && e.kind !== 'publications').sort((a, b) => b.year - a.year).slice(0, SCENE_CANON_EVENTS);
    add('chronicle', past.map(e => ({ label: e.text, en: true, note: `${e.year < 0 ? `−${-e.year}` : e.year} DR${e.when ? ` · ${e.when}` : ''}` })));
  }

  return { sec, year, sections };
}
