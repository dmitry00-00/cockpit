// Пакет компендиума: расы и подрасы с особенностями, классы с подклассами и умениями, черты, предыстории — из
// наработанных таблиц (content/compendium/*, scripts/import-compendium.py). Источник записи — srd | book | hb, как в таблице.
import { SKILL_LABEL } from '../../components/labels';
import { CLASSES, COMPENDIUM_META, FEATS, RACES } from '../../rules/compendium';
import { BACKGROUNDS } from '../../rules/compendium/backgrounds';
import type { ClassFeature, Source, Trait } from '../../rules/compendium/schema';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, paragraphs, type EntitySource, type EntityView } from '../view';

const TABLE = { race: COMPENDIUM_META.sources.races ?? 'таблица рас', class: COMPENDIUM_META.sources.classes ?? 'таблица классов' };

function source(s: Source, table: string): EntitySource {
  if (s === 'srd') return { kind: 'srd', cite: `SRD 5.1 · ${table}`, license: 'CC-BY-4.0' };
  if (s === 'book') return { kind: 'book', cite: `перевод книги WotC, только для своего стола · ${table}` };
  return { kind: 'hb', cite: `хоумбрю · ${table}` };
}

const asiText = (asi: Partial<Record<string, number>> | undefined) =>
  Object.entries(asi ?? {}).map(([a, n]) => `${a.toUpperCase()} ${n! > 0 ? '+' : ''}${n}`).join(', ') || undefined;

const table: Record<'race' | 'subrace' | 'trait' | 'class' | 'subclass' | 'feature' | 'feat' | 'background', Record<string, () => EntityView>> = {
  race: {}, subrace: {}, trait: {}, class: {}, subclass: {}, feature: {}, feat: {}, background: {},
};

function traitView(id: string, t: Trait, s: Source, owner: { label: string; ref: EntityView['ref'] }): EntityView {
  return {
    ref: ref('trait', id), kind: 'trait', name: t.name, source: source(s, TABLE.race),
    facts: [], sections: paragraphs(t.text), links: [owner],
  };
}

for (const r of RACES) {
  const self = { label: r.nameRu, ref: ref('race', r.id) };
  table.race[r.id] = () => ({
    ref: self.ref, kind: 'race', name: r.name, nameRu: r.nameRu, source: source(r.source, TABLE.race),
    facts: facts([['Характеристики', asiText(r.asi)]]),
    sections: [],
    links: [
      ...r.traits.map(t => ({ label: t.name, ref: ref('trait', r.id, t.id) })),
      ...r.subraces.map(s => ({ label: s.nameRu, ref: ref('subrace', r.id, s.id) })),
    ],
  });
  for (const t of r.traits) table.trait[`${r.id}.${t.id}`] ??= () => traitView(`${r.id}.${t.id}`, t, r.source, self);
  for (const s of r.subraces) {
    const sub = { label: `${r.nameRu} · ${s.nameRu}`, ref: ref('subrace', r.id, s.id) };
    table.subrace[`${r.id}.${s.id}`] = () => ({
      ref: sub.ref, kind: 'subrace', name: s.name, nameRu: s.nameRu, subtitle: r.nameRu, source: source(s.source, TABLE.race),
      facts: facts([['Характеристики', asiText(s.asi)], ['Заклинания', s.spells.map(x => `${x.name} (${x.level})`).join(', ')]]),
      sections: [],
      links: [self, ...s.traits.map(t => ({ label: t.name, ref: ref('trait', r.id, s.id, t.id) }))],
    });
    for (const t of s.traits) table.trait[`${r.id}.${s.id}.${t.id}`] ??= () => traitView(`${r.id}.${s.id}.${t.id}`, t, s.source, sub);
  }
}

/** Умение повторяется на нескольких уровнях («Увеличение характеристик») — одна запись, уровни списком. */
function featureViews(ownerId: string, owner: { label: string; ref: EntityView['ref'] }, s: Source, list: readonly (ClassFeature & { level: number })[]) {
  const byId = new Map<string, { f: ClassFeature; levels: number[] }>();
  for (const f of list) {
    const e = byId.get(f.id);
    if (e) e.levels.push(f.level);
    else byId.set(f.id, { f, levels: [f.level] });
  }
  for (const [fid, { f, levels }] of byId) {
    table.feature[`${ownerId}.${fid}`] ??= () => ({
      ref: ref('feature', ownerId, fid), kind: 'feature', name: f.name, subtitle: owner.label,
      source: source(s, TABLE.class),
      facts: facts([['Уровень', levels.join(', ')], ['Выбор', f.choice]]),
      sections: paragraphs(f.text),
      links: [owner],
    });
  }
  return [...byId.keys()];
}

for (const c of CLASSES) {
  const self = { label: c.nameRu, ref: ref('class', c.id) };
  const fids = featureViews(c.id, self, c.source, c.levels.flatMap(l => l.features.map(f => ({ ...f, level: l.level }))));
  table.class[c.id] = () => ({
    ref: self.ref, kind: 'class', name: c.name, nameRu: c.nameRu, source: source(c.source, TABLE.class),
    facts: facts([
      ['Навыки', c.proficiencies.skills], ['Доспехи', c.proficiencies.armor], ['Оружие', c.proficiencies.weapons],
      ['Инструменты', c.proficiencies.tools],
    ]),
    sections: [],
    links: [
      ...fids.map(fid => ({ label: table.feature[`${c.id}.${fid}`]().name, ref: ref('feature', c.id, fid) })),
      ...c.subclasses.map(s => ({ label: s.name, ref: ref('subclass', s.id) })),
    ],
  });
  for (const s of c.subclasses) {
    const sub = { label: `${c.nameRu} · ${s.name}`, ref: ref('subclass', s.id) };
    const sfids = featureViews(s.id, sub, s.source, s.features);
    table.subclass[s.id] = () => ({
      ref: sub.ref, kind: 'subclass', name: s.name, subtitle: c.nameRu, source: source(s.source, TABLE.class),
      facts: facts([['С уровня', s.gainedAt], ['Заклинания', s.spells?.map(x => `${x.name} (${x.level})`).join(', ')]]),
      sections: [],
      links: [self, ...sfids.map(fid => ({ label: table.feature[`${s.id}.${fid}`]().name, ref: ref('feature', s.id, fid) }))],
    });
  }
}

for (const f of FEATS) {
  table.feat[f.id] = () => ({
    ref: ref('feat', f.id), kind: 'feat', name: f.name, ...(f.nameRu !== f.name ? { nameRu: f.nameRu } : {}),
    source: source(f.source, 'таблица черт'),
    facts: facts([['Характеристика', f.asi.length ? f.asi.map(a => a.toUpperCase()).join(' или ') : undefined]]),
    sections: paragraphs(f.text),
    links: [],
  });
}

for (const b of BACKGROUNDS) {
  table.background[b.id] = () => ({
    ref: ref('background', b.id), kind: 'background', name: b.name, nameRu: b.nameRu, source: source(b.source, 'предыстории'),
    facts: [], sections: [],
    links: b.skills.map(s => ({ label: SKILL_LABEL[s], ref: ref('skill', s) })),
  });
}

export const PACK: Pack = tablePack(table);
