// Чистые проекции данных карточки персонажа. Вынесены из React-тел вкладок,
// чтобы компактная карточка партии могла использовать их без загрузки всего bodies.tsx.
import type { Actor, JournalEntry } from '../../engine';
import { plural } from '../../engine/journal';
import { ref, type EntityRef } from '../../entities';
import { classById, raceById } from '../../rules/compendium';
import { classIcon, featureIcon, raceIcon, traitIcon } from '../../components/sheetIcons';
import type { IconGridItem } from '../../components/IconGrid';
import type { PcHeaderData } from '../../components/PcSheet';
import { FEATURE_KIND_ART } from '../../art/semanticBindings';

type Sheet = NonNullable<Actor['sheet']>;

/** Текст умения класса; id подклассов проверяются только внутри выбранного подкласса. */
function featureText(classId: string, featureId: string, subclassId?: string): string {
  const cls = classById(classId);
  if (!cls) return '';
  const own = cls.levels.flatMap(l => l.features).find(f => f.id === featureId);
  if (own) return own.text;
  return cls.subclasses.find(sc => sc.id === subclassId)?.features.find(f => f.id === featureId)?.text ?? '';
}

function raceTrait(raceId: string, subraceId: string | undefined, traitId: string) {
  const race = raceById(raceId);
  if (!race) return undefined;
  return [...race.traits, ...(race.subraces.find(s => s.id === subraceId)?.traits ?? [])].find(t => t.id === traitId);
}

function featureRef(classId: string, featureId: string, subclassId?: string): EntityRef | undefined {
  const cls = classById(classId);
  if (!cls) return undefined;
  if (cls.levels.some(l => l.features.some(f => f.id === featureId))) return ref('feature', classId, featureId);
  return subclassId && cls.subclasses.find(sc => sc.id === subclassId)?.features.some(f => f.id === featureId) ? ref('feature', subclassId, featureId) : undefined;
}

function traitRef(raceId: string, subraceId: string | undefined, traitId: string): EntityRef | undefined {
  const race = raceById(raceId);
  if (!race) return undefined;
  if (race.traits.some(t => t.id === traitId)) return ref('trait', raceId, traitId);
  return subraceId && race.subraces.find(s => s.id === subraceId)?.traits.some(t => t.id === traitId) ? ref('trait', raceId, subraceId, traitId) : undefined;
}

/** Умения класса листа пунктами ряда иконок. */
export function classFeatureItems(sheet: Sheet): IconGridItem[] {
  return sheet.features.map(f => {
    const text = featureText(sheet.classId, f.id, sheet.subclassId);
    const r = featureRef(sheet.classId, f.id, sheet.subclassId);
    const icon = featureIcon(f.name, text);
    return { key: `${f.level}:${f.id}`, icon, name: f.name, meta: `${f.level} ур.`, text, ...(FEATURE_KIND_ART[icon] ? { art: FEATURE_KIND_ART[icon] } : {}), ...(r ? { ref: r } : {}) };
  });
}

/** Черты расы листа пунктами ряда иконок. */
export function raceTraitItems(sheet: Sheet): IconGridItem[] {
  return sheet.traits.map(t => {
    const trait = raceTrait(sheet.raceId, sheet.subraceId, t.id);
    const r = traitRef(sheet.raceId, sheet.subraceId, t.id);
    const icon = trait ? traitIcon(trait.kind, trait.name, trait.text) : 'kind-other';
    return { key: t.id, icon, name: t.name, text: trait?.text ?? '', ...(FEATURE_KIND_ART[icon] ? { art: FEATURE_KIND_ART[icon] } : {}), ...(r ? { ref: r } : {}) };
  });
}

/** Последние записи журнала, где назван персонаж; отменённые и компенсации исключены. */
export function chronicleOf(actor: Actor, entries: readonly JournalEntry[], max = 12): JournalEntry[] {
  return entries.filter(e => !e.undone && !e.compensation && e.text.includes(actor.name)).slice(-max).reverse();
}

/** Данные шапки листа для компактной карточки и полного листа. */
export function pcHeaderData(sheet: NonNullable<Actor['sheet']>, deitySymbol?: string, homelandName?: string): PcHeaderData {
  const race = raceById(sheet.raceId);
  const sub = race?.subraces.find(x => x.id === sheet.subraceId);
  const cls = classById(sheet.classId);
  const age = sheet.bio?.age;
  return {
    level: sheet.level,
    ...(sheet.portrait ? { portrait: sheet.portrait } : {}),
    title: [race?.nameRu ?? sheet.raceId, sub?.nameRu, cls?.nameRu ?? sheet.classId].filter(Boolean).join(' · '),
    emblems: [
      { icon: raceIcon(sheet.raceId), title: `Раса: ${race?.nameRu ?? sheet.raceId}${sub ? ` · ${sub.nameRu}` : ''}` },
      { icon: classIcon(sheet.classId), title: `Класс: ${cls?.nameRu ?? sheet.classId}` },
    ],
    ...(sheet.alignment ? { alignment: sheet.alignment } : {}),
    ...(sheet.deity ? { deity: { name: sheet.deity.name, ref: ref('deity', sheet.deity.id), ...(deitySymbol ? { symbol: deitySymbol } : {}) } } : {}),
    ...(sheet.homeland && homelandName ? { homeland: { name: homelandName, ref: sheet.homeland } } : {}),
    ...(sheet.speed !== undefined ? { speed: sheet.speed } : {}),
    ...(sheet.bio?.height ? { height: sheet.bio.height } : {}),
    ...(sheet.bio?.weight ? { weight: sheet.bio.weight } : {}),
    ...(age !== undefined ? { age: `${age} ${plural(age, ['год', 'года', 'лет'])}` } : {}),
  };
}
