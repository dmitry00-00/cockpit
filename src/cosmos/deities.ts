// Божества и пантеоны (ENTITIES.md, E1): факты карточек {{Deity}} Forgotten Realms Wiki (CC BY-SA 3.0, см.
// LICENSE.md), импорт — scripts/import-deities.py. Поля хранятся по редакциям; значение для года кампании — первая
// редакция с данными в порядке EDITION_ORDER эпохи, и редакция остаётся при значении: мастер видит, по какой книге
// факт. Модуль тянет 0,5 МБ данных — его импортирует только пакет космоса (отдельный кусок), не основной код.
import { loadSettingJson } from '../packages/registry';
import { EDITION_ORDER, type Era } from '../campaign/era';
import { GREAT_WHEEL, WORLD_TREE } from './planes';

export type Edition = '5eR' | '5e' | '4e' | '3e' | '2e' | '1e' | '';
export type DeityField = 'power' | 'alignment' | 'symbol' | 'homeplane' | 'realm' | 'portfolio' | 'domains' | 'worshipers'
  | 'serves' | 'servedby' | 'holydays';

/** Значение поля в одной редакции: текст вики без ссылок, божества и планы, на которые оно ссылается. */
export interface DeityCell {
  t: string;
  /** id божеств (служит, слуги). */
  d?: readonly string[];
  /** id планов Колеса или Древа (дом, владение). */
  p?: readonly string[];
}

export interface Deity {
  id: string;
  /** Латиницей, как в книгах. */
  name: string;
  url: string;
  titles?: readonly string[];
  pantheons?: readonly string[];
  /** Другие божества — аспекты этого (Lathander → Amaunator). */
  aspects?: readonly string[];
  died?: string;
  /** Когда смертный стал богом. */
  apotheosis?: string;
  fields: Partial<Record<DeityField, Partial<Record<Edition, DeityCell>>>>;
  /** Книги и страницы по редакциям. */
  refs: Partial<Record<Edition, readonly string[]>>;
}

export interface Pantheon { id: string; name: string; url: string; members: readonly string[] }

interface DeityData { deities: readonly Deity[]; pantheons: readonly Pantheon[]; attribution: string; license: string }

const DATA = await loadSettingJson('content/cosmos/deities.json') as DeityData;
export const DEITIES: readonly Deity[] = DATA.deities;
export const PANTHEONS: readonly Pantheon[] = DATA.pantheons;
export const DEITIES_ATTRIBUTION = DATA.attribution;

const byId = new Map(DEITIES.map(d => [d.id, d]));
const pantheonsById = new Map(PANTHEONS.map(p => [p.id, p]));
export const deityById = (id: string): Deity | undefined => byId.get(id);
export const pantheonById = (id: string): Pantheon | undefined => pantheonsById.get(id);

/** Эпоха кампании, к которой относится редакция поля; у поля без пометки эпохи нет. */
const ERA_OF_EDITION: Readonly<Record<Edition, string>> = { '5eR': '5e', '5e': '5e', '4e': '4e', '3e': '3e', '2e': '2e', '1e': '1e', '': '' };

/** Значение поля для эпохи: своя редакция, потом старшие; новее эпохи — никогда (в 1372 DR нет фактов 5e). */
export function fieldAt(d: Deity, field: DeityField, era: Era): { edition: Edition; cell: DeityCell } | undefined {
  const by = d.fields[field];
  if (!by) return undefined;
  for (const e of EDITION_ORDER[era] as readonly Edition[]) {
    const cell = by[e];
    if (cell) return { edition: e, cell };
  }
  return undefined;
}

/** Пометка редакции при значении: «по 2e», если факт не из книг своей эпохи; иначе ничего. */
export function editionNote(edition: Edition, era: Era): string | undefined {
  const of = ERA_OF_EDITION[edition];
  return of && of !== era ? `по ${of}` : undefined;
}

/** Планы, где живёт божество в эпоху: дом и владение. */
export function homePlanesAt(d: Deity, era: Era): string[] {
  const ids = [...(fieldAt(d, 'homeplane', era)?.cell.p ?? []), ...(fieldAt(d, 'realm', era)?.cell.p ?? [])];
  return [...new Set(ids)];
}

const WHEEL_IDS: ReadonlySet<string> = new Set(GREAT_WHEEL.planes.map(p => p.id));
const TREE_IDS: ReadonlySet<string> = new Set(WORLD_TREE.planes.map(p => p.id));

/**
 * Божества плана в эпоху, по имени. Дом бога ищется в модели самого плана: поля 3e пишут дом по Древу, остальные
 * редакции — по Колесу, и у плана Колеса в 1372 DR решает первая редакция, где дом назван планом Колеса (2e), у
 * плана Древа в 1492 DR — первая, где назван планом Древа (3e). Новее эпохи — по-прежнему никогда.
 */
export function deitiesOfPlane(planeId: string, era: Era): readonly Deity[] {
  const model = new Set([...(WHEEL_IDS.has(planeId) ? WHEEL_IDS : []), ...(TREE_IDS.has(planeId) ? TREE_IDS : [])]);
  const lives = (d: Deity) => {
    for (const e of EDITION_ORDER[era] as readonly Edition[]) {
      const ids = [...(d.fields.homeplane?.[e]?.p ?? []), ...(d.fields.realm?.[e]?.p ?? [])].filter(p => model.has(p));
      if (ids.length) return ids.includes(planeId);
    }
    return false;
  };
  return DEITIES.filter(lives).sort((a, b) => a.name.localeCompare(b.name));
}

/** Ранг силы по-русски; чего нет в словаре — как в вики. */
export const POWER_LABEL: Readonly<Record<string, string>> = {
  'Overgod': 'сверхбог', 'Greater deity': 'великое божество', 'Intermediate deity': 'среднее божество',
  'Lesser deity': 'малое божество', 'Demigod': 'полубог', 'Demipower': 'полусила', 'Deity': 'божество', 'God': 'бог',
  'Lesser power': 'малая сила', 'Dead power': 'мёртвая сила', 'Archdevil': 'архидьявол', 'Demon lord': 'повелитель демонов',
  'Exarch': 'экзарх', 'Archfey': 'архифея', 'Primordial': 'первородный', 'Quasi-deity': 'квазибожество',
  'Demigoddess': 'полубогиня', 'Lesser god': 'малый бог', 'Great God': 'великий бог', 'Great Goddess': 'великая богиня',
  'Lesser': 'малое', 'Intermediate': 'среднее', 'Intermediate power': 'средняя сила', 'Quasi-power': 'квазисила',
  'Primal spirit': 'первородный дух', 'Spirit': 'дух', 'Totem spirit': 'тотемный дух', 'Elder evil': 'древнее зло',
  'Hero-god': 'бог-герой', 'Local god': 'местный бог', 'Local goddess': 'местная богиня', 'Savage god': 'дикий бог',
  'Mortal': 'смертный',
};

const ALIGNMENT_RU: Readonly<Record<string, string>> = {
  'lawful good': 'законно-добрый', 'neutral good': 'нейтрально-добрый', 'chaotic good': 'хаотично-добрый',
  'lawful neutral': 'законно-нейтральный', 'neutral': 'нейтральный', 'true neutral': 'нейтральный',
  'chaotic neutral': 'хаотично-нейтральный', 'lawful evil': 'законно-злой', 'neutral evil': 'нейтрально-злой',
  'chaotic evil': 'хаотично-злой', 'good': 'добрый', 'evil': 'злой', 'unaligned': 'без мировоззрения', 'none': 'нет',
};

/** Домены жреца 5e → подклассы жреца в компендиуме. Домены 3e — другая система, к подклассам не ведут. */
export const DOMAIN_SUBCLASS: Readonly<Record<string, string>> = {
  Arcana: 'jrec-magii', Death: 'jrec-smerti', Forge: 'jrec-kuzni', Grave: 'jrec-upokoenia', Knowledge: 'jrec-znaniy',
  Life: 'jrec-jizni', Light: 'jrec-sveta', Nature: 'jrec-prirody', Order: 'jrec-poradka', Peace: 'jrec-mira',
  Tempest: 'jrec-buri', Trickery: 'jrec-obmana', Twilight: 'jrec-sumerek', War: 'jrec-voyny',
};

/** Подклассы жреца по доменам поля 5e: «Life, Light» → ['jrec-jizni', 'jrec-sveta']. */
export function domainSubclasses(edition: Edition, text: string): string[] {
  if (edition !== '5e' && edition !== '5eR') return [];
  const ids = [...text.matchAll(/[A-Za-z]+/g)].map(m => DOMAIN_SUBCLASS[m[0][0].toUpperCase() + m[0].slice(1).toLowerCase()]);
  return [...new Set(ids.filter((x): x is string => x !== undefined))];
}

const POWER_FOLDED = new Map(Object.entries(POWER_LABEL).map(([k, v]) => [k.toLowerCase(), v]));
/** «Intermediate deity; Dead power» → «среднее божество; мёртвая сила»; регистр вики не важен. */
export const powerLabel = (t: string): string => t.split(/;\s*/).map(x => POWER_FOLDED.get(x.trim().toLowerCase()) ?? x).join('; ');
export const alignmentRu = (t: string): string => ALIGNMENT_RU[t.toLowerCase()] ?? t;

export interface Service {
  /** Кому служит. */
  masters: readonly Deity[];
  /** Кто служит ему. */
  servants: readonly Deity[];
  /** Аспекты: этот бог — аспект их, или они — его. */
  aspects: readonly Deity[];
}

const serviceIndex = new Map<Era, Map<string, { masters: Set<string>; servants: Set<string> }>>();

/**
 * Служение в эпоху — с обеих сторон: статья бога называет одних, статьи других богов называют его («Azuth служит
 * Mystra» может стоять только у Azuth). Аспекты — без эпохи, поле карточки одно на все редакции.
 */
export function serviceOf(d: Deity, era: Era): Service {
  let idx = serviceIndex.get(era);
  if (!idx) {
    idx = new Map();
    const at = (id: string) => {
      let e = idx!.get(id);
      if (!e) idx!.set(id, (e = { masters: new Set(), servants: new Set() }));
      return e;
    };
    for (const x of DEITIES) {
      for (const m of fieldAt(x, 'serves', era)?.cell.d ?? []) { at(x.id).masters.add(m); at(m).servants.add(x.id); }
      for (const s of fieldAt(x, 'servedby', era)?.cell.d ?? []) { at(x.id).servants.add(s); at(s).masters.add(x.id); }
    }
    serviceIndex.set(era, idx);
  }
  const e = idx.get(d.id);
  const list = (ids: Iterable<string>) => [...new Set(ids)].map(deityById).filter((x): x is Deity => x !== undefined && x.id !== d.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    masters: list(e?.masters ?? []),
    servants: list(e?.servants ?? []),
    aspects: list([...(d.aspects ?? []), ...DEITIES.filter(x => x.aspects?.includes(d.id)).map(x => x.id)]),
  };
}

/** Удел бога на плане: бог и имя его владения, если вики его даёт («Morninglory»). */
export interface PlaneRealm { deity: string; name: string; realm?: string }

/** Уделы плана в эпоху — боги плана (deitiesOfPlane) с владением по той же эпохе. */
export function realmsOfPlane(planeId: string, era: Era): PlaneRealm[] {
  return deitiesOfPlane(planeId, era).map(d => {
    const realm = fieldAt(d, 'realm', era)?.cell.t;
    return { deity: d.id, name: d.name, ...(realm ? { realm } : {}) };
  });
}

/** Подклассы жреца по доменам 5e бога (5eR, потом 5e) — выбор бога жрецом: механика 5e, эпоха кампании не важна. */
export function domains5e(d: Deity): string[] {
  for (const e of ['5eR', '5e'] as const) {
    const cell = d.fields.domains?.[e];
    if (cell) return domainSubclasses(e, cell.t);
  }
  return [];
}

/**
 * Пантеон, которому по традиции молится раса компендиума, — подсказка в выборе бога (ROADMAP 2.4): Seldarine у эльфов,
 * Morndinsamman у дварфов. Человеку — Faerûnian pantheon: кампания на Sword Coast.
 */
export const RACE_PANTHEON: Readonly<Record<string, string>> = {
  'celovek': 'faerunian-pantheon', 'el-f': 'seldarine', 'poluel-f': 'seldarine', 'dvarf': 'morndinsamman',
  'gnom': 'lords-of-the-golden-hills', 'poluroslik': 'yondalla-s-children', 'ork': 'orc-pantheon', 'poluork': 'orc-pantheon',
  'drakonorojdennyy': 'draconic-pantheon', 'goblinoidy': 'goblinoid-pantheon', 'aarakokra': 'aarakocra-pantheon',
  'kobol-d': 'kobold-pantheon', 'ludoaser': 'lizardfolk-pantheon', 'kentavr': 'centaur-pantheon', 'satir': 'satyr-pantheon',
};
