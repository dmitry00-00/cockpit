// Пакет космоса: планы Великого колеса и Великого древа (один план — одна запись: свойства по модели Колеса, где
// он там есть, и место на Древе), тела Realmspace, хрустальные сферы флогистона. Факты — FR Wiki, CC BY-SA 3.0.
import { PHLOGISTON } from '../../cosmos/phlogiston';
import { GREAT_WHEEL, PLACE_LABEL, PLANE_KIND_LABEL, TRAIT_ROWS, WORLD_TREE, alignmentLabel, gateOf, type Plane } from '../../cosmos/planes';
import { BODY_TYPE_LABEL, ELEMENT_LABEL, REALMSPACE, type CelestialBody } from '../../cosmos/realmspace';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntitySource, type EntityView } from '../view';

const wiki = (url: string | undefined, refs: readonly string[] = []): EntitySource => ({
  kind: 'wiki', cite: refs.length ? `Forgotten Realms Wiki · ${refs.join('; ')}` : 'Forgotten Realms Wiki', license: 'CC BY-SA 3.0',
  ...(url ? { url } : {}),
});

const wheel = new Map(GREAT_WHEEL.planes.map(p => [p.id, p]));
const tree = new Map(WORLD_TREE.planes.map(p => [p.id, p]));

function planeView(id: string): EntityView {
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
    links: [],
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
  plane: Object.fromEntries([...new Set([...wheel.keys(), ...tree.keys()])].map(id => [id, () => planeView(id)])),
  body: Object.fromEntries(REALMSPACE.bodies.map(b => [b.id, () => bodyView(b)])),
  sphere: Object.fromEntries(PHLOGISTON.spheres.map(s => [s.id, () => ({
    ref: ref('sphere', s.id), kind: 'sphere' as const, name: s.name, subtitle: s.kind === 'empire' ? 'империя' : 'хрустальная сфера',
    source: wiki(s.url), facts: [], sections: [], links: [],
  })])),
});
