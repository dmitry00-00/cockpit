// Пакет правил: состояния, характеристики, навыки, ресурсы — SRD 5.1; заклинания, снаряжение, магические предметы,
// монстры SRD, Black Flag и A5E. Тексты — дословно из данных, подписи — русские из labels.ts. Пакет грузится после
// библиотек монстров (loadMonsterLibraries): таблица видов собирается при загрузке модуля.
import { ABILITY_LABEL, SKILL_LABEL } from '../../components/labels';
import { CLASSES } from '../../rules/compendium';
import {
  ABILITIES, ABILITIES_SOURCE, ABILITY_IDS, CONDITIONS, CONDITION_IDS, MONSTER_LIBRARIES,
  MONSTERS, MONSTERS_SOURCE, MONSTER_ORIGIN_LABEL, RESOURCES, RESOURCE_IDS, SKILL_IDS, SKILLS, monsterOrigin, type Monster,
  type MonsterAction,
} from '../../rules/srd';
import { CATEGORY_LABEL, DAMAGE_LABEL, EQUIPMENT_SOURCE, ITEMS } from '../../rules/srd/equipment';
import { MAGIC_ITEMS, MAGIC_ITEMS_SOURCE } from '../../rules/srd/magicItems';
import { SCHOOL_LABEL, SPELLS, SPELLS_SOURCE, spellLevelLabel } from '../../rules/srd/spells';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, paragraphs, type EntitySection, type EntitySource, type EntityView } from '../view';

const SRD: EntitySource = { kind: 'srd', cite: 'SRD 5.1', license: 'CC-BY-4.0' };
const srd = (cite: string): EntitySource => ({ ...SRD, cite });

/** Класс компендиума по id класса SRD («cleric» → id компендиума): компендиум ведёт классы по-английски в name. */
const classRefOf = (srdId: string) => {
  const c = CLASSES.find(x => x.name.toLowerCase() === srdId);
  return c ? { label: c.nameRu, ref: ref('class', c.id) } : undefined;
};

const actions = (title: string, list: readonly MonsterAction[] | undefined): EntitySection[] =>
  (list ?? []).map(a => ({ title: `${title}: ${a.name}`, text: a.text }));

function monsterSource(m: Monster): EntitySource {
  const origin = monsterOrigin(m);
  if (origin === 'srd') return srd(MONSTERS_SOURCE.source);
  // CC BY требует текст авторства — он и есть ссылка на источник.
  const lib = MONSTER_LIBRARIES.find(l => l.origin === origin);
  return { kind: origin, cite: lib?.attribution || lib?.source || MONSTER_ORIGIN_LABEL[origin], license: 'CC-BY-4.0' };
}

const map = <T,>(list: readonly T[], id: (x: T) => string, view: (x: T) => EntityView) =>
  Object.fromEntries(list.map(x => [id(x), () => view(x)]));

export const PACK: Pack = tablePack({
  condition: map(CONDITION_IDS, id => id, id => {
    const c = CONDITIONS[id];
    return {
      ref: ref('condition', id), kind: 'condition', name: c.name, nameRu: c.label,
      subtitle: c.kind === 'buff' ? 'полезное' : 'помеха',
      source: srd(c.source),
      facts: [],
      sections: [...paragraphs(c.text), ...(c.levels ?? []).map(l => ({ title: `Уровень ${l.level}`, text: l.effect }))],
      links: [],
    };
  }),
  ability: map(ABILITY_IDS, id => id, id => ({
    ref: ref('ability', id), kind: 'ability', name: ABILITIES[id].name, nameRu: ABILITY_LABEL[id], subtitle: ABILITIES[id].code,
    source: srd(ABILITIES_SOURCE), facts: [], sections: [],
    links: SKILL_IDS.filter(s => SKILLS[s].ability === id).map(s => ({ label: SKILL_LABEL[s], ref: ref('skill', s) })),
  })),
  skill: map(SKILL_IDS, id => id, id => ({
    ref: ref('skill', id), kind: 'skill', name: SKILLS[id].name, nameRu: SKILL_LABEL[id],
    subtitle: ABILITIES[SKILLS[id].ability].code,
    source: srd(ABILITIES_SOURCE), facts: [], sections: [],
    links: [{ label: ABILITY_LABEL[SKILLS[id].ability], ref: ref('ability', SKILLS[id].ability) }],
  })),
  resource: map(RESOURCE_IDS, id => id, id => {
    const r = RESOURCES[id];
    return {
      ref: ref('resource', id), kind: 'resource', name: r.label,
      subtitle: r.restore === 'long' ? 'возвращает долгий отдых' : r.restore === 'short' ? 'возвращает короткий отдых' : 'возвращается в начале своего хода',
      source: srd(r.source), facts: [], sections: [], links: [],
    };
  }),
  spell: map(Object.values(SPELLS), s => s.id, s => ({
    ref: ref('spell', s.id), kind: 'spell', name: s.name,
    subtitle: `${spellLevelLabel(s.level)} · ${SCHOOL_LABEL[s.school]}${s.ritual ? ' · ритуал' : ''}`,
    source: srd(SPELLS_SOURCE.source),
    facts: facts([
      ['Время накладывания', s.castingTime],
      ['Дистанция', s.range],
      ['Компоненты', `${s.components.join(', ')}${s.material ? ` (${s.material})` : ''}`],
      ['Длительность', s.duration],
    ]),
    sections: [...paragraphs(s.text), ...(s.higherLevel ? [{ title: 'At Higher Levels', text: s.higherLevel }] : [])],
    links: s.classes.map(classRefOf).filter(x => x !== undefined),
  })),
  item: {
    ...map(Object.values(ITEMS), i => i.id, i => ({
      ref: ref('item', i.id), kind: 'item', name: i.name,
      subtitle: i.weapon ? `оружие · ${i.weapon.category === 'simple' ? 'простое' : 'воинское'}` : i.armor ? `доспех · ${i.armor.category}` : CATEGORY_LABEL[i.kind] ?? i.kind,
      source: srd(EQUIPMENT_SOURCE.source),
      facts: facts([
        ['Цена', i.cost],
        ['Вес', i.weight !== undefined ? `${i.weight} фнт.` : undefined],
        ['Урон', i.weapon?.damage ? `${i.weapon.damage} ${DAMAGE_LABEL[i.weapon.damageType ?? ''] ?? i.weapon.damageType ?? ''}`.trim() : undefined],
        ['Свойства', i.weapon?.properties.length ? i.weapon.properties.join(', ') : undefined],
        ['AC', i.armor ? String(i.armor.baseAc) : undefined],
      ]),
      sections: i.text ? paragraphs(i.text) : [],
      links: (i.contents ?? []).map(c => ({ label: `${ITEMS[c.id]?.name ?? c.id}${c.qty > 1 ? ` ×${c.qty}` : ''}`, ref: ref('item', c.id) })),
    })),
    ...map(Object.values(MAGIC_ITEMS), m => m.id, m => ({
      ref: ref('item', m.id), kind: 'item', name: m.name, subtitle: m.typeLine,
      source: srd(MAGIC_ITEMS_SOURCE.source),
      facts: facts([
        ['Настройка', m.attunement.required ? ['нужна', m.attunement.by, m.attunement.when].filter(Boolean).join(', ') : undefined],
        ['Варианты', m.variants.length ? m.variants.join(', ') : undefined],
      ]),
      sections: paragraphs(m.text),
      links: [],
    })),
  },
  monster: map(Object.values(MONSTERS), m => m.id, m => ({
    ref: ref('monster', m.id), kind: 'monster', name: m.name,
    subtitle: `${m.size} ${m.type}, ${m.alignment} · CR ${m.cr} · ${MONSTER_ORIGIN_LABEL[monsterOrigin(m)]}`,
    source: monsterSource(m),
    facts: facts([
      ['AC', `${m.ac.value}${m.ac.source ? ` (${m.ac.source})` : ''}`],
      ['HP', `${m.hp.average}${m.hp.formula ? ` (${m.hp.formula})` : ''}`],
      ['Скорость', m.speedText],
      ['Уязвимости', m.damageVulnerabilities.length ? m.damageVulnerabilities.join(', ') : undefined],
      ['Сопротивления', m.damageResistances.length ? m.damageResistances.join(', ') : undefined],
      ['Иммунитеты к урону', m.damageImmunities.length ? m.damageImmunities.join(', ') : undefined],
      ['Чувства', m.senses],
      ['Языки', m.languages],
    ]),
    sections: [
      ...actions('Особенность', m.traits), ...actions('Действие', m.actions), ...actions('Бонусное действие', m.bonusActions),
      ...actions('Реакция', m.reactions), ...actions('Легендарное действие', m.legendary),
    ],
    links: m.conditionImmunities.filter(c => (CONDITION_IDS as readonly string[]).includes(c))
      .map(c => ({ label: `иммунитет: ${CONDITIONS[c as (typeof CONDITION_IDS)[number]].label}`, ref: ref('condition', c) })),
  })),
});
