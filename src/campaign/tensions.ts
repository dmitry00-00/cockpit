// Напряжения (Д3, ROADMAP 7.1): где по канону и по кампании сталкиваются интересы. Машина ищет и показывает цепочку
// фактов, сюжет пишет мастер. Четыре вида:
//   враги в одном месте — две организации с базой здесь, враги по вики (в любую сторону), обе есть в год кампании;
//   двойная верность    — NPC, живой в год кампании, состоит в двух враждующих организациях (категории «Members of …»
//                         вики не различают нынешних и бывших — так и подписано);
//   соперничество вер   — в месте церкви двух разных богов (база здесь или бог места), и церкви — враги по вики;
//   сила растёт         — фракция кампании растёт (тренд > 0), а партия известна её врагу (отношение ≤ −2,
//                         известность от 5).
// Вес — сколько фактов держат напряжение. Вражды богов нет: в карточках вики её нет. Чистая функция: справочник
// (TensionCanon) страница грузит куском мира (world/tensions.ts) и передаёт готовым; в старт он не входит.
import { namedIn, type State, type WorldDelta } from '../engine';
import { ref, type EntityRef } from '../entities/ref';
import type { Organization, PlaceFaith } from '../world/organizations';
import { aliveIn, type Resident } from '../world/people';

export type TensionKind = 'rivals' | 'double' | 'faith' | 'rising';

export const TENSION_LABEL: Readonly<Record<TensionKind, string>> = {
  rivals: 'враги в одном месте', double: 'двойная верность', faith: 'соперничество вер', rising: 'сила растёт',
};

/** Факт напряжения: строка словами и ссылка на то, о чём он; из вики или из кампании (тогда factId — факт мастера). */
export interface TensionFact { text: string; ref?: EntityRef; origin: 'wiki' | 'campaign'; factId?: string }

export interface Tension {
  /** Устойчивый id: вид и стороны — тот же у того же напряжения при любом порядке данных. */
  id: string;
  kind: TensionKind;
  title: string;
  /** Место справочника карты, где напряжение; у «двойной верности» — дом NPC, у «силы» — место факта кампании. */
  placeId?: string;
  placeName?: string;
  /** Место кампании, которое ссылается на это место справочника (или о котором факт мастера). */
  locationId?: string;
  /** Стороны — фракции кампании, если организация в кампании, иначе организации и NPC справочника. */
  sides: readonly { label: string; ref: EntityRef }[];
  facts: readonly TensionFact[];
  weight: number;
}

export interface TensionCanon {
  orgs: ReadonlyMap<string, Organization>;
  /** Организация → NPC-члены по категориям вики. */
  members: Readonly<Record<string, readonly Resident[]>>;
  /** Место справочника → боги места (поле religion вики). */
  faiths: Readonly<Record<string, PlaceFaith>>;
  placeName: (id: string) => string | undefined;
  /** NPC → место справочника, где он живёт (жители мест вики). */
  homeOf: (person: string) => string | undefined;
}

/** Порог «партию знают» и «враги» для «силы растёт» — правило стола, не канона: у известности 5 — второй шаг шкалы. */
export const RISING_RENOWN = 5;
export const RISING_RELATION = -2;

export function tensionsOf(state: State, year: number, canon: TensionCanon): Tension[] {
  const { orgs } = canon;
  const { factions, locations } = state.world;
  const live = (o: Organization | undefined): o is Organization =>
    !!o && (o.formed === undefined || o.formed <= year) && (o.disbanded === undefined || o.disbanded > year);
  const enemies = (a: Organization, b: Organization) => !!a.enemies?.includes(b.id) || !!b.enemies?.includes(a.id);
  const factionOf = new Map(Object.values(factions).flatMap(f => (f.ref?.startsWith('organization:') ? [[f.ref.slice(13), f] as const] : [])));
  const locationOf = new Map(Object.values(locations).flatMap(l => (l.ref?.startsWith('place:') ? [[l.ref.slice(6), l.id] as const] : [])));
  const side = (o: Organization) => {
    const f = factionOf.get(o.id);
    return f ? { label: f.name, ref: ref('faction', f.id) } : { label: o.name, ref: ref('organization', o.id) };
  };
  const enmity = (a: Organization, b: Organization): TensionFact[] => [
    ...(a.enemies?.includes(b.id) ? [{ text: `${a.name}: враги — ${b.name}`, ref: ref('organization', a.id), origin: 'wiki' as const }] : []),
    ...(b.enemies?.includes(a.id) ? [{ text: `${b.name}: враги — ${a.name}`, ref: ref('organization', b.id), origin: 'wiki' as const }] : []),
  ];
  // Обе — фракции кампании, и отношение ниже нуля: это уже факт кампании, а не только канона.
  const relation = (a: Organization, b: Organization): TensionFact[] => {
    const fa = factionOf.get(a.id), fb = factionOf.get(b.id);
    const v = fa && fb ? fa.relations?.[fb.id] ?? 0 : 0;
    return fa && fb && v < 0 ? [{ text: `${fa.name} и ${fb.name}: отношение ${v}`, ref: ref('faction', fa.id), origin: 'campaign' }] : [];
  };
  // Факты мастера, где названа сторона (и, если задано, о месте кампании): «Агент Zhentarim замечен у ворот Neverwinter».
  const campaignFacts = (names: readonly string[], locationId?: string): TensionFact[] =>
    Object.values(state.facts)
      .filter(f => (locationId === undefined || f.subjectId === locationId) && namedIn(f.text, names.map((n, i) => ({ id: String(i), name: n }))).length > 0)
      .map(f => ({ text: f.text, origin: 'campaign', factId: f.id, ...(f.subjectId && locations[f.subjectId] ? { ref: ref('location', f.subjectId) } : {}) }));
  const namesOf = (o: Organization) => [o.name, ...(factionOf.get(o.id) ? [factionOf.get(o.id)!.name] : [])];
  const out: Tension[] = [];
  const push = (t: Omit<Tension, 'weight'>) => out.push({ ...t, weight: t.facts.length });
  const at = (placeId: string | undefined) => {
    const name = placeId ? canon.placeName(placeId) : undefined;
    const loc = placeId ? locationOf.get(placeId) : undefined;
    return { ...(placeId && name ? { placeId, placeName: name } : {}), ...(loc ? { locationId: loc } : {}) };
  };
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Базы организаций по местам и церкви по богам — в год кампании.
  const based = new Map<string, Organization[]>();
  const churchesOf = new Map<string, Organization[]>();
  for (const o of orgs.values()) {
    if (!live(o)) continue;
    for (const p of o.places ?? []) based.set(p, [...(based.get(p) ?? []), o]);
    if (o.church && o.deities?.length === 1) churchesOf.set(o.deities[0], [...(churchesOf.get(o.deities[0]) ?? []), o]);
  }

  // Враги в одном месте.
  for (const [p, list] of based) {
    const name = canon.placeName(p);
    if (!name) continue;
    const plain = list.filter(o => !o.church);
    for (let i = 0; i < plain.length; i++) {
      for (let j = i + 1; j < plain.length; j++) {
        const [a, b] = [plain[i], plain[j]];
        if (!enemies(a, b)) continue;
        const where = at(p);
        push({
          id: `rivals:${p}:${pairKey(a.id, b.id)}`, kind: 'rivals', title: `${side(a).label} и ${side(b).label} · ${name}`, ...where,
          sides: [side(a), side(b)],
          facts: [
            { text: `${a.name}: база — ${name}`, ref: ref('organization', a.id), origin: 'wiki' },
            { text: `${b.name}: база — ${name}`, ref: ref('organization', b.id), origin: 'wiki' },
            ...enmity(a, b), ...relation(a, b),
            ...(where.locationId ? campaignFacts([...namesOf(a), ...namesOf(b)], where.locationId) : []),
          ],
        });
      }
    }
  }

  // Соперничество вер: церкви с базой здесь и церкви богов места; боги — разные.
  for (const p of new Set([...based.keys(), ...Object.keys(canon.faiths)])) {
    const name = canon.placeName(p);
    if (!name) continue;
    const gods = canon.faiths[p]?.deities ?? [];
    const why = new Map<string, TensionFact>();
    for (const o of (based.get(p) ?? []).filter(o => o.church)) why.set(o.id, { text: `${o.name}: база — ${name}`, ref: ref('organization', o.id), origin: 'wiki' });
    for (const g of gods) {
      for (const o of churchesOf.get(g) ?? []) if (!why.has(o.id)) why.set(o.id, { text: `${name}: почитают бога церкви ${o.name}`, ref: ref('place', p), origin: 'wiki' });
    }
    const churches = [...why.keys()].map(id => orgs.get(id)!).filter(o => o.deities?.length);
    for (let i = 0; i < churches.length; i++) {
      for (let j = i + 1; j < churches.length; j++) {
        const [a, b] = [churches[i], churches[j]];
        if (!enemies(a, b) || a.deities!.join() === b.deities!.join()) continue;
        const where = at(p);
        push({
          id: `faith:${p}:${pairKey(a.id, b.id)}`, kind: 'faith', title: `${side(a).label} и ${side(b).label} · ${name}`, ...where,
          sides: [side(a), side(b)],
          facts: [why.get(a.id)!, why.get(b.id)!, ...enmity(a, b), ...relation(a, b),
            ...(where.locationId ? campaignFacts([...namesOf(a), ...namesOf(b)], where.locationId) : [])],
        });
      }
    }
  }

  // Двойная верность: одна запись на NPC — все враждующие пары его организаций.
  const orgsOf = new Map<string, { name: string; born: number | null; died: number | null; orgs: Organization[] }>();
  for (const [orgId, list] of Object.entries(canon.members)) {
    const o = orgs.get(orgId);
    if (!live(o)) continue;
    for (const [id, name, born, died] of list) {
      const rec = orgsOf.get(id) ?? { name, born, died, orgs: [] };
      rec.orgs.push(o);
      orgsOf.set(id, rec);
    }
  }
  for (const [id, rec] of orgsOf) {
    if (rec.orgs.length < 2 || !aliveIn(rec.born, rec.died, year)) continue;
    const pairs: [Organization, Organization][] = [];
    for (let i = 0; i < rec.orgs.length; i++) for (let j = i + 1; j < rec.orgs.length; j++) if (enemies(rec.orgs[i], rec.orgs[j])) pairs.push([rec.orgs[i], rec.orgs[j]]);
    if (pairs.length === 0) continue;
    const involved = [...new Map(pairs.flat().map(o => [o.id, o])).values()];
    const name = rec.name.replace(/;.*$/, '').trim();
    push({
      id: `double:${id}`, kind: 'double', title: `${name}: ${involved.map(o => side(o).label).join(' и ')}`, ...at(canon.homeOf(id)),
      sides: [{ label: name, ref: ref('person', id) }, ...involved.map(side)],
      facts: [
        ...involved.map(o => ({ text: `${name} состоял в ${o.name} (категория вики)`, ref: ref('person', id), origin: 'wiki' as const })),
        ...pairs.flatMap(([a, b]) => [...enmity(a, b), ...relation(a, b)]),
      ],
    });
  }

  // Сила растёт: тренд фракции кампании, её враг в кампании и известность партии у врага.
  for (const f of Object.values(factions)) {
    if (!(f.trend !== undefined && f.trend > 0)) continue;
    for (const [gid, v] of Object.entries(f.relations ?? {})) {
      const g = factions[gid];
      if (!g || v > RISING_RELATION || g.renown < RISING_RENOWN) continue;
      const fo = f.ref?.startsWith('organization:') ? orgs.get(f.ref.slice(13)) : undefined;
      const go = g.ref?.startsWith('organization:') ? orgs.get(g.ref.slice(13)) : undefined;
      const facts: TensionFact[] = [
        { text: `${f.name} растёт: тренд +${f.trend}`, ref: ref('faction', f.id), origin: 'campaign' },
        { text: `${f.name} и ${g.name}: отношение ${v}`, ref: ref('faction', g.id), origin: 'campaign' },
        { text: `Партию знают в ${g.name}: известность ${g.renown}`, ref: ref('faction', g.id), origin: 'campaign' },
        ...(fo && go ? enmity(fo, go) : []),
        ...campaignFacts([f.name, g.name]),
      ];
      const loc = facts.find(x => x.factId && state.facts[x.factId]?.subjectId)?.factId;
      const locationId = loc ? state.facts[loc].subjectId : undefined;
      const placeRef = locationId ? locations[locationId]?.ref : undefined;
      const placeId = placeRef?.startsWith('place:') ? placeRef.slice(6) : undefined;
      push({
        id: `rising:${f.id}:${g.id}`, kind: 'rising', title: `${f.name} растёт, партию знают в ${g.name}`,
        ...(placeId ? at(placeId) : {}), ...(locationId ? { locationId } : {}),
        sides: [{ label: f.name, ref: ref('faction', f.id) }, { label: g.name, ref: ref('faction', g.id) }],
        facts,
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title));
}

/** Напряжения места: место справочника или место кампании. */
export const tensionsAt = (list: readonly Tension[], at: { placeId?: string; locationId?: string }): Tension[] =>
  list.filter(t => (at.placeId !== undefined && t.placeId === at.placeId) || (at.locationId !== undefined && t.locationId === at.locationId));

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Id нити напряжения — из его id (с местом): та же пара в том же месте — та же нить, второй раз не предлагается. */
export const tensionThreadId = (t: Pick<Tension, 'id'>): string => `thread-${slug(t.id)}`;

/** Уже нить или уже во входящих: кнопка «Сделать нитью» гаснет. */
export function tensionThreadState(state: State, t: Pick<Tension, 'id'>): 'thread' | 'pending' | null {
  const id = tensionThreadId(t);
  if (state.world.threads[id]) return 'thread';
  return Object.values(state.deltas).some(d => d.status === 'pending' && d.patch?.kind === 'newThread' && d.patch.thread.id === id) ? 'pending' : null;
}

/**
 * «Сделать нитью» (ROADMAP 7.3): предложение с патчем newThread во входящие. Причина — факты напряжения словами;
 * causeId — факт мастера, если он держит напряжение, иначе первая сторона ссылкой (каскад журнала ведёт к ней).
 */
export function tensionThreadDelta(state: State, t: Tension): WorldDelta {
  const threadId = tensionThreadId(t);
  let id = `d-${threadId}`;
  for (let n = 2; state.deltas[id]; n++) id = `d-${threadId}-${n}`;
  const loc = t.locationId ? state.world.locations[t.locationId] : undefined;
  return {
    id, scale: loc?.scale ?? 'region', subject: `Нить · ${t.title}`, was: 'нити нет', now: 'нить открыта',
    cause: `${TENSION_LABEL[t.kind]}: ${t.facts.map(f => f.text).join('; ')}`,
    causeId: t.facts.find(f => f.factId)?.factId ?? t.sides[0].ref,
    status: 'pending', threadIds: [threadId],
    patch: { kind: 'newThread', thread: { id: threadId, name: t.title, status: 'open', openedSec: state.time.sec, lastTouchedSec: state.time.sec } },
  };
}

/**
 * Слой влияния на карте (ROADMAP 7.4): базы фракций кампании — места их организаций по вики, в год кампании; места
 * напряжений — их заголовки. Радиуса влияния не дают ни вики, ни кампания: слой показывает места, а не выдуманные зоны.
 */
export interface InfluenceMarks {
  /** Место справочника → фракции кампании с базой здесь. */
  bases: ReadonlyMap<string, readonly string[]>;
  /** Место справочника → напряжения здесь. */
  tensions: ReadonlyMap<string, readonly string[]>;
}

export function influenceOf(state: State, year: number, canon: Pick<TensionCanon, 'orgs'>, tensions: readonly Tension[]): InfluenceMarks {
  const bases = new Map<string, string[]>();
  for (const f of Object.values(state.world.factions)) {
    const o = f.ref?.startsWith('organization:') ? canon.orgs.get(f.ref.slice(13)) : undefined;
    if (!o || (o.formed !== undefined && o.formed > year) || (o.disbanded !== undefined && o.disbanded <= year)) continue;
    for (const p of o.places ?? []) bases.set(p, [...(bases.get(p) ?? []), f.name]);
  }
  const marks = new Map<string, string[]>();
  for (const t of tensions) if (t.placeId) marks.set(t.placeId, [...(marks.get(t.placeId) ?? []), t.title]);
  return { bases, tensions: marks };
}
