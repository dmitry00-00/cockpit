// Пакет космоса: планы Великого колеса и Великого древа (один план — одна запись: свойства по модели Колеса, где
// он там есть, и место на Древе), тела Realmspace, хрустальные сферы флогистона, божества и пантеоны. Факты — FR
// Wiki, CC BY-SA 3.0. Божество и боги плана — по эпохе кампании: значение поля из книг своей эпохи или старше,
// с пометкой редакции, если не своей.
import type { Era } from '../../campaign/era';
import { CLASSES } from '../../rules/compendium';
import {
  DEITIES, PANTHEONS, alignmentRu, deitiesOfPlane, deityById, domainSubclasses, editionNote, fieldAt, homePlanesAt, pantheonById, powerLabel,
  type Deity, type DeityField, type Edition,
} from '../../cosmos/deities';
import { PHLOGISTON } from '../../cosmos/phlogiston';
import { GREAT_WHEEL, PLACE_LABEL, PLANE_KIND_LABEL, TRAIT_ROWS, WORLD_TREE, alignmentLabel, gateOf, type Plane } from '../../cosmos/planes';
import { BODY_TYPE_LABEL, ELEMENT_LABEL, REALMSPACE, type CelestialBody } from '../../cosmos/realmspace';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntityLink, type EntitySource, type EntityView } from '../view';

const wiki = (url: string | undefined, refs: readonly string[] = []): EntitySource => ({
  kind: 'wiki', cite: refs.length ? `Forgotten Realms Wiki · ${refs.join('; ')}` : 'Forgotten Realms Wiki', license: 'CC BY-SA 3.0',
  ...(url ? { url } : {}),
});

const wheel = new Map(GREAT_WHEEL.planes.map(p => [p.id, p]));
const tree = new Map(WORLD_TREE.planes.map(p => [p.id, p]));

function planeView(id: string, era: Era): EntityView {
  const w = wheel.get(id), t = tree.get(id);
  const p = (w ?? t) as Plane;
  const gate = w ? gateOf(id) : undefined;
  const card = p.card;
  return {
    ref: ref('plane', id), kind: 'plane', name: p.name,
    subtitle: [w ? `Колесо: ${PLANE_KIND_LABEL[w.kind]}` : null, t ? `Древо: ${PLANE_KIND_LABEL[t.kind]}${t.place ? `, ${PLACE_LABEL[t.place]}` : ''}` : null]
      .filter(Boolean).join(' · '),
    source: wiki(p.url, p.refs),
    facts: facts([
      ['Мировоззрение', p.alignment.length ? alignmentLabel(p) : p.alignmentText?.ru],
      ...TRAIT_ROWS.map(([k, label]) => [label, p[k]?.ru] as const),
      ['Слои', p.layers?.join(', ')],
      ['Где', p.location],
      ['Город-врата', gate?.town],
      ['Что это', card?.what], ['Правитель', card?.ruler], ['Опасность', card?.danger],
    ]),
    sections: card?.summary ? [{ text: card.summary }] : [],
    links: deitiesOfPlane(id, era).map(d => ({ label: d.name, ref: ref('deity', d.id) })),
  };
}

/** Паспорт божества: поле → подпись и перевод значения. Сила — строкой под именем. */
const DEITY_ROWS: readonly (readonly [DeityField, string, ((t: string) => string)?])[] = [
  ['alignment', 'Мировоззрение', alignmentRu], ['symbol', 'Символ'],
  ['homeplane', 'Дом'], ['realm', 'Владение'], ['portfolio', 'Сферы'], ['domains', 'Домены'],
  ['worshipers', 'Почитатели'], ['serves', 'Служит'], ['servedby', 'Слуги'], ['holydays', 'Святые дни'],
];

/** Подпись домена — имя подкласса жреца в компендиуме: «домен: Жизни». */
const subclassName = new Map(CLASSES.flatMap(c => c.subclasses.map(x => [x.id, x.name] as const)));

function deityView(d: Deity, era: Era): EntityView {
  const at = (f: DeityField) => fieldAt(d, f, era);
  const value = (f: DeityField, tr: (t: string) => string = t => t) => {
    const v = at(f);
    if (!v) return undefined;
    const note = editionNote(v.edition, era);
    return `${tr(v.cell.t)}${note ? ` (${note})` : ''}`;
  };
  const used = new Set((['power', ...DEITY_ROWS.map(([f]) => f)] as DeityField[]).map(f => at(f)?.edition).filter((e): e is Edition => e !== undefined));
  const refs = [...new Set([...used].flatMap(e => d.refs[e] ?? []))];
  const deityLink = (id: string): EntityLink | undefined => {
    const x = deityById(id);
    return x ? { label: x.name, ref: ref('deity', id) } : undefined;
  };
  const planeName = (id: string) => (wheel.get(id) ?? tree.get(id))?.name;
  const domains = at('domains');
  return {
    ref: ref('deity', d.id), kind: 'deity', name: d.name,
    subtitle: value('power', powerLabel),
    source: wiki(d.url, refs),
    facts: facts([
      ['Титулы', d.titles?.length ? d.titles.join('; ') : undefined],
      ['Пантеон', d.pantheons?.map(p => pantheonById(p)?.name ?? p).join(', ')],
      ...DEITY_ROWS.map(([f, label, tr]) => [label, value(f, tr)] as const),
      ['Апофеоз', d.apotheosis],
      ['Умер', d.died],
    ]),
    sections: [],
    links: [
      ...(d.pantheons ?? []).flatMap(p => (pantheonById(p) ? [{ label: pantheonById(p)!.name, ref: ref('pantheon', p) }] : [])),
      ...homePlanesAt(d, era).flatMap(p => (planeName(p) ? [{ label: planeName(p)!, ref: ref('plane', p) }] : [])),
      ...(domains ? domainSubclasses(domains.edition, domains.cell.t) : []).map(id => ({ label: `домен: ${subclassName.get(id) ?? id}`, ref: ref('subclass', id) })),
      ...[...(at('serves')?.cell.d ?? []), ...(at('servedby')?.cell.d ?? []), ...(d.aspects ?? [])]
        .filter((x, i, a) => a.indexOf(x) === i).map(deityLink).filter(x => x !== undefined),
    ],
  };
}

const bodyView = (b: CelestialBody): EntityView => ({
  ref: ref('body', b.id), kind: 'body', name: b.name, subtitle: BODY_TYPE_LABEL[b.type] ?? b.type,
  source: wiki(b.url, b.refs),
  facts: facts([
    ['Стихия', b.element ? ELEMENT_LABEL[b.element] ?? b.element : undefined],
    ['Форма', b.shape], ['Размер', b.size], ['Спутник', b.parent], ['Сутки', b.day], ['Год', b.year], ['Население', b.population],
  ]),
  sections: [],
  links: [],
});

export const PACK: Pack = tablePack({
  plane: Object.fromEntries([...new Set([...wheel.keys(), ...tree.keys()])].map(id => [id, (era: Era) => planeView(id, era)])),
  body: Object.fromEntries(REALMSPACE.bodies.map(b => [b.id, () => bodyView(b)])),
  sphere: Object.fromEntries(PHLOGISTON.spheres.map(s => [s.id, () => ({
    ref: ref('sphere', s.id), kind: 'sphere' as const, name: s.name, subtitle: s.kind === 'empire' ? 'империя' : 'хрустальная сфера',
    source: wiki(s.url), facts: [], sections: [], links: [],
  })])),
  deity: Object.fromEntries(DEITIES.map(d => [d.id, (era: Era) => deityView(d, era)])),
  pantheon: Object.fromEntries(PANTHEONS.map(p => [p.id, () => ({
    ref: ref('pantheon', p.id), kind: 'pantheon' as const, name: p.name, subtitle: `божеств: ${p.members.length}`,
    source: wiki(p.url), facts: [], sections: [],
    links: p.members.map(id => deityById(id)).filter(d => d !== undefined).sort((a, b) => a.name.localeCompare(b.name))
      .map(d => ({ label: d.name, ref: ref('deity', d.id) })),
  })])),
});
