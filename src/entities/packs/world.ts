// Пакет «мир» (E9, ROADMAP 3.1): NPC и организации по полям карточек {{Person}} и {{Organization}} вики. NPC — раса,
// род занятий, дом (ссылка на место карты), бог, организации, годы жизни; в год кампании — жив или нет. Организация —
// тип, база, глава, боги, союзники и враги, члены; в год кампании — есть, распущена или ещё не основана. Имена —
// латиницей, поля — как в вики.
import { loadGazetteer } from '../../map/gazetteer';
import { loadPeople, personUrl, residentsAlive, type Person, type Resident } from '../../world/people';
import { loadOrgMembers, loadOrganizations, orgExistsIn, orgUrl, type Organization } from '../../world/organizations';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntityGroup, type EntityLink, type EntitySource, type EntityView } from '../view';

const SEX: Readonly<Record<string, string>> = { male: 'мужской', female: 'женский' };

interface Names {
  deity: (id: string) => string | undefined;
  org: (id: string) => Organization | undefined;
  alignment: (t: string) => string;
  /** Имя места справочника карты: связь подписана тем, куда ведёт, а не текстом поля вики. */
  place: (id: string) => string | undefined;
}

const wiki = (refs: readonly string[] | undefined, url: string): EntitySource =>
  ({ kind: 'wiki', cite: refs?.length ? `Forgotten Realms Wiki · ${refs.join('; ')}` : 'Forgotten Realms Wiki', license: 'CC BY-SA 3.0', url });

function lifeYears(p: Person, year: number): string | undefined {
  if (p.born === undefined && p.died === undefined) return undefined;
  const span = `${p.born ?? '?'}–${p.died ?? ''}`.replace(/–$/, ' —');
  const status = p.born !== undefined && p.born > year ? 'ещё не родился' : p.died !== undefined && p.died <= year ? 'умер' : 'жив';
  return `${span} DR · в ${year} DR ${status}`;
}

function personView(p: Person, year: number, n: Names): EntityView {
  const orgs = (p.orgs ?? []).map(id => n.org(id)).filter((o): o is Organization => !!o);
  const links: EntityLink[] = [
    ...(p.place ? [{ label: n.place(p.place) ?? 'Дом', ref: ref('place', p.place) }] : []),
    ...(p.deity ? [{ label: n.deity(p.deity) ?? p.deity, ref: ref('deity', p.deity) }] : []),
    ...orgs.map(o => ({ label: o.name, ref: ref('organization', o.id) })),
  ];
  return {
    ref: ref('person', p.id), kind: 'person', name: p.name,
    subtitle: [p.race, p.occ].filter(Boolean).join(' · ') || undefined,
    source: wiki(p.refs, personUrl(p)),
    facts: facts([
      ['Титул', p.t],
      ['Пол', p.sex ? SEX[p.sex.toLowerCase()] ?? p.sex : undefined],
      ['Дом', p.home],
      ['Бог', p.deity ? n.deity(p.deity) ?? p.deity : p.deityText],
      // Категория вики не различает нынешних и бывших членов — «состоял».
      ['Состоял', orgs.length ? orgs.map(o => o.name).join(', ') : undefined],
      ['Годы', lifeYears(p, year)],
    ]),
    sections: [],
    links,
  };
}

function orgYears(o: Organization, year: number): string | undefined {
  if (o.formed === undefined && o.disbanded === undefined) return undefined;
  const span = [o.formed !== undefined ? `основана ${o.formed} DR` : '', o.disbanded !== undefined ? `распущена ${o.disbanded} DR` : ''].filter(Boolean).join(', ');
  const status = orgExistsIn(o, year) ? 'есть' : o.formed !== undefined && o.formed > year ? 'ещё не основана' : 'распущена';
  return `${span} · в ${year} DR ${status}`;
}

function orgView(o: Organization, year: number, members: readonly Resident[] | undefined, n: Names): EntityView {
  const orgLinks = (ids: readonly string[] | undefined) =>
    (ids ?? []).flatMap(id => { const x = n.org(id); return x ? [{ label: x.name, ref: ref('organization', id) }] : []; });
  const alive = residentsAlive(members, year);
  const groups: EntityGroup[] = [
    ...(o.allies?.length ? [{ title: 'Союзники', links: orgLinks(o.allies) }] : []),
    ...(o.enemies?.length ? [{ title: 'Враги', links: orgLinks(o.enemies) }] : []),
    ...(alive.length ? [{ title: `Члены, живые в ${year} DR, по вики`, links: alive.map(([id, name]) => ({ label: name, ref: ref('person', id) })) }] : []),
  ];
  return {
    ref: ref('organization', o.id), kind: 'organization', name: o.name,
    subtitle: [o.church ? 'церковь' : undefined, o.type].filter(Boolean).join(' · ') || undefined,
    source: wiki(o.refs, orgUrl(o)),
    facts: facts([
      ['Также', o.aliases?.join(', ')],
      ['База', o.base],
      ['Глава', o.leaders?.map(l => (l.when ? `${l.t} (${l.when})` : l.t)).join('; ')],
      ['Боги', o.deities?.map(id => n.deity(id) ?? id).join(', ')],
      ['Мировоззрение', o.alignment ? n.alignment(o.alignment) : undefined],
      ['Расы', o.races],
      ['Символ', o.symbol],
      ['Численность', o.members],
      ['Годы', orgYears(o, year)],
    ]),
    sections: [],
    links: [
      ...(o.places ?? []).map(id => ({ label: n.place(id) ?? 'База', ref: ref('place', id) })),
      ...(o.leaders ?? []).flatMap(l => (l.person ? [{ label: l.t, ref: ref('person', l.person) }] : [])),
      ...(o.deities ?? []).map(id => ({ label: n.deity(id) ?? id, ref: ref('deity', id) })),
    ],
    ...(groups.length ? { groups } : {}),
  };
}

export async function loadPack(): Promise<Pack> {
  // Имя бога и мировоззрение — из справочника богов (кусок космоса): связь без имени была бы id.
  const [people, orgs, members, deities, gazetteer] = await Promise.all([
    loadPeople(), loadOrganizations(), loadOrgMembers(), import('../../cosmos/deities'), loadGazetteer('toril'),
  ]);
  const places = new Map(gazetteer.map(p => [p.id, p.name]));
  const n: Names = { deity: id => deities.deityById(id)?.name, org: id => orgs.get(id), alignment: deities.alignmentRu, place: id => places.get(id) };
  return tablePack({
    person: Object.fromEntries([...people.values()].map(p => [p.id, (_era, year: number) => personView(p, year, n)])),
    organization: Object.fromEntries([...orgs.values()].map(o => [o.id, (_era, year: number) => orgView(o, year, members[o.id], n)])),
  });
}
