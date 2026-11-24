// Эпохи канона и порядок чтения полей источника задаются профилем линз пакета сеттинга.
import { DEFAULT_SETTING_PACKAGE, PACKAGE_REGISTRY, settingDataFor } from '../packages/registry';
import { parseEditionLensProfile, type EditionLensProfile } from '../packages/settingData';

export type Era = '3e' | '4e' | '5e';

const lensCache = new Map<string, EditionLensProfile>();
export function editionLensForSetting(settingPackageId: string): EditionLensProfile {
  const cached = lensCache.get(settingPackageId);
  if (cached) return cached;
  const setting = PACKAGE_REGISTRY.find(p => p.id === settingPackageId && p.kind === 'setting');
  if (!setting?.time?.lenses) throw new Error(`у пакета ${settingPackageId} не объявлена линза редакций`);
  const profile = parseEditionLensProfile(settingDataFor(settingPackageId, 'lenses'), setting.time.lenses);
  lensCache.set(settingPackageId, profile);
  return profile;
}

const DEFAULT_LENSES = editionLensForSetting(DEFAULT_SETTING_PACKAGE);
const knownEras = new Set(DEFAULT_LENSES.eras.map(era => era.id));
for (const era of ['3e', '4e', '5e']) if (!knownEras.has(era)) throw new Error(`линза ${DEFAULT_LENSES.id} не содержит эпоху ${era}`);

export function eraOfSetting(year: number | null, settingPackageId: string): Era {
  const profile = editionLensForSetting(settingPackageId);
  if (year === null) return profile.default as Era;
  const era = profile.eras.find(candidate => candidate.throughYear === undefined || year <= candidate.throughYear);
  if (!era) throw new Error(`у линзы ${profile.id} нет эпохи для года ${year}`);
  return era.id as Era;
}

export const eraOf = (year: number): Era => eraOfSetting(year, DEFAULT_SETTING_PACKAGE);

/** Порядок редакций полей: вначале выбранная эпоха, затем более ранние источники. */
export const EDITION_ORDER: Readonly<Record<Era, readonly string[]>> = Object.freeze(Object.fromEntries(
  DEFAULT_LENSES.eras.map(era => [era.id, era.fieldOrder]),
) as Record<Era, readonly string[]>);

/** Космология берётся из той же линзы; для эпох без отдельной записи используется колесо профиля по умолчанию. */
export function cosmologyOfSetting(year: number | null, settingPackageId: string): 'wheel' | 'tree' {
  const profile = editionLensForSetting(settingPackageId);
  const defaultCosmology = profile.eras.find(candidate => candidate.id === profile.default)?.cosmology ?? 'wheel';
  const era = year === null ? undefined : profile.eras.find(candidate => candidate.throughYear === undefined || year <= candidate.throughYear);
  const cosmology = era?.cosmology ?? defaultCosmology;
  return cosmology === 'tree' ? 'tree' : 'wheel';
}

export const cosmologyOf = (year: number): 'wheel' | 'tree' => cosmologyOfSetting(year, DEFAULT_SETTING_PACKAGE);
