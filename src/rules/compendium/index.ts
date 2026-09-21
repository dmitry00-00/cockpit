// Загрузка компендиума из content/compendium/*.json (пишет scripts/import-compendium.py).
import racesJson from '../../../content/compendium/races.json';
import featsJson from '../../../content/compendium/feats.json';
import classesJson from '../../../content/compendium/classes.json';
import type { CharacterClass, CompendiumMeta, Feat, Race, Source } from './schema';

export * from './schema';

export const RACES = racesJson.races as unknown as readonly Race[];
export const FEATS = featsJson.feats as unknown as readonly Feat[];
export const CLASSES = classesJson.classes as unknown as readonly CharacterClass[];
export const COMPENDIUM_META = racesJson.meta as CompendiumMeta;

/** Фильтр по источнику: «только SRD» — одна строка. */
export const bySource = <T extends { source: Source }>(items: readonly T[], allowed: readonly Source[]) =>
  items.filter(i => allowed.includes(i.source));

export const raceById = (id: string) => RACES.find(r => r.id === id);
export const classById = (id: string) => CLASSES.find(c => c.id === id);
export const featById = (id: string) => FEATS.find(f => f.id === id);
// Предыстории — не из таблиц (листа нет), с источником у каждой; см. backgrounds.ts.
export { BACKGROUNDS, backgroundById, type Background } from './backgrounds';
