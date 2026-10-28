// Сущности состояния: актёры, места кампании, фракции, нити — из State, меняются событиями. Представление
// ссылается на справочник (раса, класс, блок монстра, заклинания), а не копирует его.
import { SCALE_LABELS } from '../components/scales';
import type { State } from '../engine';
import { classById, raceById } from '../rules/compendium';
import { ref, type StateKind } from './ref';
import { facts, type EntityLink, type EntitySource, type EntityView } from './view';

const CAMPAIGN: EntitySource = { kind: 'campaign', cite: 'кампания: сид и журнал событий' };
const DANGER = { low: 'низкая', medium: 'средняя', high: 'высокая' } as const;

function actorView(state: State, id: string): EntityView | undefined {
  const a = state.actors[id];
  if (!a) return undefined;
  const s = a.sheet;
  const links: EntityLink[] = [];
  if (s) {
    const race = raceById(s.raceId), cls = classById(s.classId);
    links.push({ label: race?.nameRu ?? s.raceId, ref: ref('race', s.raceId) });
    if (s.subraceId) links.push({ label: race?.subraces.find(x => x.id === s.subraceId)?.nameRu ?? s.subraceId, ref: ref('subrace', s.raceId, s.subraceId) });
    links.push({ label: cls?.nameRu ?? s.classId, ref: ref('class', s.classId) });
    if (s.subclassId) links.push({ label: cls?.subclasses.find(x => x.id === s.subclassId)?.name ?? s.subclassId, ref: ref('subclass', s.subclassId) });
    if (s.backgroundId) links.push({ label: s.backgroundId, ref: ref('background', s.backgroundId) });
    for (const sp of [...(s.spellcasting?.cantrips ?? []), ...(s.spellcasting?.spells ?? []), ...(s.spellcasting?.always ?? [])]) {
      links.push({ label: sp, ref: ref('spell', sp) });
    }
  }
  if (a.monsterId) links.push({ label: a.monsterId, ref: ref('monster', a.monsterId) });
  if (a.locationId) links.push({ label: state.world.locations[a.locationId]?.name ?? a.locationId, ref: ref('location', a.locationId) });
  return {
    ref: ref('actor', id), kind: 'actor', name: a.name,
    subtitle: s ? `${s.level} ур.` : a.removed ? 'выбыл' : undefined,
    source: CAMPAIGN,
    facts: facts([['HP', `${a.hp.current}/${a.hp.max}${a.hp.temp ? ` +${a.hp.temp}` : ''}`], ['AC', a.ac], ['PP', a.passivePerception]]),
    sections: [],
    links,
  };
}

function locationView(state: State, id: string): EntityView | undefined {
  const l = state.world.locations[id];
  if (!l) return undefined;
  const parent = l.parentId ? state.world.locations[l.parentId] : undefined;
  return {
    ref: ref('location', id), kind: 'location', name: l.name, subtitle: SCALE_LABELS[l.scale],
    source: CAMPAIGN,
    facts: facts([
      ['Население', l.population], ['Опасность', l.danger ? DANGER[l.danger] : undefined],
      ['Цены', l.pricePercent !== undefined ? `${l.pricePercent > 0 ? '+' : ''}${l.pricePercent}%` : undefined],
    ]),
    sections: [],
    links: [
      ...(parent ? [{ label: parent.name, ref: ref('location', parent.id) }] : []),
      ...Object.values(state.world.locations).filter(c => c.parentId === id).map(c => ({ label: c.name, ref: ref('location', c.id) })),
    ],
  };
}

function factionView(state: State, id: string): EntityView | undefined {
  const f = state.world.factions[id];
  if (!f) return undefined;
  return {
    ref: ref('faction', id), kind: 'faction', name: f.name, source: CAMPAIGN,
    facts: facts([['Известность партии', f.renown], ['Влияние', f.influencePercent !== undefined ? `${f.influencePercent}%` : undefined], ['Цель', f.goal]]),
    sections: [], links: [],
  };
}

function threadView(state: State, id: string): EntityView | undefined {
  const t = state.world.threads[id];
  if (!t) return undefined;
  return {
    ref: ref('thread', id), kind: 'thread', name: t.name, subtitle: t.status === 'open' ? 'открыта' : 'закрыта',
    source: CAMPAIGN, facts: [], sections: [], links: [],
  };
}

const VIEW: Readonly<Record<StateKind, (state: State, id: string) => EntityView | undefined>> = {
  actor: actorView, location: locationView, faction: factionView, thread: threadView,
};

export const stateView = (state: State, kind: StateKind, id: string): EntityView | undefined => VIEW[kind](state, id);

export function stateIds(state: State, kind: StateKind): string[] {
  if (kind === 'actor') return Object.keys(state.actors);
  return Object.keys(state.world[kind === 'location' ? 'locations' : kind === 'faction' ? 'factions' : 'threads']);
}
