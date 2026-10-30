// Загрузка компендиума из content/compendium/*.json (пишет scripts/import-compendium.py).
// Ядро без текстов (ROADMAP 0.5): тексты умений, черт и черт рас догружает rules/texts.ts в эти же объекты. Ядро —
// своими кусками вне основного (TASKS Q18): await на верхнем уровне, модуль исполняется, когда они пришли.
import type { CharacterClass, CompendiumMeta, Feat, Race, Source } from './schema';

const [racesJson, featsJson, classesJson] = await Promise.all([
  import('../../../content/compendium/races.json?split=core'),
  import('../../../content/compendium/feats.json?split=core'),
  import('../../../content/compendium/classes.json?split=core'),
]).then(ms => ms.map(m => m.default));

export * from './schema';

export const RACES = (racesJson as { races: readonly Race[] }).races;
export const FEATS = (featsJson as { feats: readonly Feat[] }).feats;
export const CLASSES = (classesJson as { classes: readonly CharacterClass[] }).classes;
export const COMPENDIUM_META = (racesJson as { meta: CompendiumMeta }).meta;

/** Фильтр по источнику: «только SRD» — одна строка. */
export const bySource = <T extends { source: Source }>(items: readonly T[], allowed: readonly Source[]) =>
  items.filter(i => allowed.includes(i.source));

export const raceById = (id: string) => RACES.find(r => r.id === id);
export const classById = (id: string) => CLASSES.find(c => c.id === id);
export const featById = (id: string) => FEATS.find(f => f.id === id);
// Предыстории — не из таблиц (листа нет), с источником у каждой; см. backgrounds.ts.
export { BACKGROUNDS, backgroundById, type Background } from './backgrounds';
