// Пакет «державы» (вид `kingdom:`, решение пользователя 30.10.2026): поля статей-держав вики — тип, столица, правитель
// на год кампании, форма правления, население, языки, боги, торговля, соседи; в год кампании — есть, распалась или
// ещё не основана. Строки — как в вики, подписи полей — свои. Соседи, состав, предшественники и наследники, организации
// и места — ссылками на карточки; вехи инфобокса — до года кампании.
import { loadGazetteer } from '../../map/gazetteer';
import { kingdomExistsIn, kingdomUrl, loadKingdoms, rulerName, rulersLine, rulersShown, type Kingdom } from '../../world/kingdoms';
import { loadOrganizations, type Organization } from '../../world/organizations';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntityGroup, type EntityLink, type EntityView } from '../view';

interface Names {
  kingdom: (id: string) => Kingdom | undefined;
  org: (id: string) => Organization | undefined;
  deity: (id: string) => string | undefined;
  place: (id: string) => string | undefined;
}

function kingdomYears(k: Kingdom, year: number): string | undefined {
  if (k.founded === undefined && k.dissolved === undefined) return undefined;
  const span = [k.founded !== undefined ? `основана ${k.founded} DR` : '', k.dissolved !== undefined ? `распалась ${k.dissolved} DR` : ''].filter(Boolean).join(', ');
  const status = kingdomExistsIn(k, year) ? 'есть' : k.founded !== undefined && k.founded > year ? 'ещё не основана' : 'распалась';
  return `${span} · в ${year} DR ${status}`;
}

export function kingdomView(k: Kingdom, year: number, n: Names): EntityView {
  const kLinks = (ids: readonly string[] | undefined): EntityLink[] =>
    (ids ?? []).flatMap(id => { const x = n.kingdom(id); return x ? [{ label: x.name, ref: ref('kingdom', id) }] : []; });
  const oLinks = (ids: readonly string[] | undefined): EntityLink[] =>
    (ids ?? []).flatMap(id => { const x = n.org(id); return x ? [{ label: x.name, ref: ref('organization', id) }] : []; });
  const now = rulersShown(k, year).rulers;
  const allies = [...kLinks(k.allies), ...oLinks(k.allyOrgs)];
  const enemies = [...kLinks(k.enemies), ...oLinks(k.enemyOrgs)];
  const places = (k.places ?? []).filter(id => id !== k.capitalPlace).flatMap(id => { const name = n.place(id); return name ? [{ label: name, ref: ref('place', id) }] : []; });
  const groups: EntityGroup[] = [
    ...(allies.length ? [{ title: 'Союзники', links: allies }] : []),
    ...(enemies.length ? [{ title: 'Враги', links: enemies }] : []),
    ...(kLinks(k.within).length ? [{ title: 'В составе', links: kLinks(k.within) }] : []),
    ...(kLinks(k.predecessors).length ? [{ title: 'Предшественники', links: kLinks(k.predecessors) }] : []),
    ...(kLinks(k.successors).length ? [{ title: 'Наследники', links: kLinks(k.successors) }] : []),
    ...(oLinks(k.orgs).length ? [{ title: 'Организации', links: oLinks(k.orgs) }] : []),
    ...(places.length ? [{ title: 'Места на карте', links: places }] : []),
  ];
  // Вехи инфобокса — линзой года (решение кокпита): позже года кампании ещё не случились; без года — показываются.
  const milestones = (k.milestones ?? []).filter(m => m.year === undefined || m.year <= year)
    .map(m => (m.year !== undefined ? `${m.year} DR — ${m.t}` : m.when ? `${m.when} — ${m.t}` : m.t));
  const self = k.place && k.place !== k.capitalPlace ? n.place(k.place) : undefined;
  return {
    ref: ref('kingdom', k.id), kind: 'kingdom', name: k.name,
    subtitle: [k.type, k.region ?? k.continent].filter(Boolean).join(' · ') || undefined,
    source: { kind: 'wiki', cite: k.refs?.length ? `Forgotten Realms Wiki · ${k.refs.join('; ')}` : 'Forgotten Realms Wiki', license: 'CC BY-SA 3.0', url: kingdomUrl(k) },
    facts: facts([
      ['Также', k.aliases?.join(', ')],
      ['Столица', k.capital],
      [`Правитель в ${year} DR`, rulersLine(k, year)],
      ['Правление', k.government],
      ['Население', k.population],
      ['Народ', k.demonym],
      ['Языки', k.languages?.join(', ')],
      ['Боги', k.deities?.length ? k.deities.map(id => n.deity(id) ?? id).join(', ') : k.deityText],
      ['Расы', k.races],
      ['Валюта', k.currency],
      ['Экспорт', k.exports],
      ['Импорт', k.imports],
      ['Годы', kingdomYears(k, year)],
    ]),
    sections: [
      ...(k.summary ? [{ text: k.summary }] : []),
      ...(milestones.length ? [{ title: `Вехи по ${year} DR`, text: milestones.join('\n') }] : []),
    ],
    links: [
      ...(self && k.place ? [{ label: `${self} на карте`, ref: ref('place', k.place) }] : []),
      ...(k.capitalPlace ? [{ label: n.place(k.capitalPlace) ?? k.capital ?? 'Столица', ref: ref('place', k.capitalPlace) }] : []),
      ...[...new Map(now.flatMap(r => (r.person ? [[r.person, { label: rulerName(r), ref: ref('person', r.person) }] as const] : []))).values()],
      ...(k.deities ?? []).map(id => ({ label: n.deity(id) ?? id, ref: ref('deity', id) })),
    ],
    ...(groups.length ? { groups } : {}),
  };
}

export async function loadPack(): Promise<Pack> {
  const [kingdoms, orgs, deities, gazetteer] = await Promise.all([loadKingdoms(), loadOrganizations(), import('../../cosmos/deities'), loadGazetteer('toril')]);
  const places = new Map(gazetteer.map(p => [p.id, p.name]));
  const n: Names = { kingdom: id => kingdoms.get(id), org: id => orgs.get(id), deity: id => deities.deityById(id)?.name, place: id => places.get(id) };
  return tablePack({
    kingdom: Object.fromEntries([...kingdoms.values()].map(k => [k.id, (_era, year: number) => kingdomView(k, year, n)])),
  });
}
