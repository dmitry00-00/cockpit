import type { MapPassport } from '../map/projection';
import { PACKAGE_INDEX, type PackageIndexEntry, type PackageLayerIndexEntry } from './index.generated';
import { DEFAULT_SETTING_PACKAGE } from './settings';

// Паспорта очищенных подложек невелики и нужны только тогда, когда пользователь включает режим карты.
// Манифест пакета определяет, какой файл доступен для каждого id исходной карты.
const contentJsonLoaders = import.meta.glob([
  '../../content/**/*.json',
  '!../../content/maps/neverwinter.json',
  '!../../content/maps/toril-clean.json',
  '!../../content/maps/toril.json',
], { import: 'default' });
const settingDataFiles = import.meta.glob([
  '../../content/calendars/**/*.json',
  '../../content/lenses/**/*.json',
  '../../content/ladders/**/*.json',
], { eager: true, import: 'default' });
const mapFiles = import.meta.glob([
  '../../content/maps/*.json',
  '!../../content/maps/*-cards.json',
  '!../../content/maps/*-control.json',
  '!../../content/maps/*-icons.json',
  '!../../content/maps/*-labels.json',
  '!../../content/maps/*-missing.json',
  '!../../content/maps/*-places.json',
  '!../../content/maps/*-raster-corrections.json',
  '!../../content/maps/*-ocr-classification.json',
  '!../../content/maps/*-underdark.json',
], { eager: true, import: 'default' });

export const PACKAGE_REGISTRY = PACKAGE_INDEX;
export { DEFAULT_SETTING_PACKAGE };
const packagesById = new Map(PACKAGE_REGISTRY.map(manifest => [manifest.id, manifest]));
export const ACTIVE_SETTING_MANIFEST = packagesById.get(DEFAULT_SETTING_PACKAGE);
const layerLoads = new Map<string, Promise<unknown>>();

/** Successful loads stay cached; a rejected attempt is evicted so an explicit retry can recover. */
export function loadCachedPromise<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;

  const attempt = Promise.resolve().then(load);
  cache.set(key, attempt);
  void attempt.catch(() => {
    if (cache.get(key) === attempt) cache.delete(key);
  });
  return attempt;
}

export function settingPackageForMap(mapId: string): PackageIndexEntry | undefined {
  const path = `content/maps/${mapId}.json`;
  return PACKAGE_REGISTRY.find(manifest => manifest.kind === 'setting' && manifest.maps?.includes(path));
}

export function packageKindLabel(packageId: string, kind: string): string | undefined {
  return packagesById.get(packageId)?.kinds?.[kind]?.labelRu;
}

export function packageHasLayer(packageId: string, path: string): boolean {
  return packagesById.get(packageId)?.layerPaths.includes(path) ?? false;
}

export function packageLayerPaths(packageId: string, directory: string): readonly string[] {
  const prefix = directory.endsWith('/') ? directory : `${directory}/`;
  return (packagesById.get(packageId)?.layerPaths ?? [])
    .filter(path => path.startsWith(prefix) && /\/\d+\.json$/i.test(path))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** Manifest-declared layers for a content kind; callers never infer a path from a kind name. */
export function packageLayersForKind(packageId: string, kind: string): readonly PackageLayerIndexEntry[] {
  return (packagesById.get(packageId)?.layers ?? []).filter(layer => layer.kinds.includes(kind));
}

/** Small setting profiles are eagerly bundled and resolved only through paths declared by the selected package. */
export function settingDataFor(packageId: string, kind: 'calendar' | 'lenses' | 'ladder'): unknown {
  const manifest = packagesById.get(packageId);
  if (!manifest || manifest.kind !== 'setting') throw new Error(`пакет сеттинга не найден: ${packageId}`);
  const path = kind === 'ladder' ? manifest.ladder
    : kind === 'calendar' ? manifest.time?.calendarData
      : manifest.time?.lensesData;
  if (!path) throw new Error(`${packageId}: в манифесте не объявлены данные ${kind}`);
  if (!manifest.layerPaths.includes(path)) throw new Error(`${packageId}: слой ${path} отсутствует в реестре`);
  const fileKey = `../../${path}`;
  if (!Object.hasOwn(settingDataFiles, fileKey)) throw new Error(`${packageId}: данные ${kind} не попали в сборку: ${path}`);
  return settingDataFiles[fileKey];
}

/** Загрузить JSON-слой только по пути, объявленному в манифесте пакета. */
export function loadPackageJson(packageId: string, path: string): Promise<unknown> {
  const manifest = packagesById.get(packageId);
  if (!manifest) return Promise.reject(new Error(`пакет не найден: ${packageId}`));
  if (!manifest.layerPaths.includes(path)) return Promise.reject(new Error(`${packageId}: слой не объявлен в манифесте: ${path}`));
  const fileKey = `../../${path}`;
  const load = contentJsonLoaders[fileKey];
  if (!load) return Promise.reject(new Error(`${packageId}: JSON-слой не попал в сборку: ${path}`));
  const key = `${packageId}:${path}`;
  return loadCachedPromise(layerLoads, key, load);
}

export const loadSettingJson = (path: string): Promise<unknown> => loadPackageJson(DEFAULT_SETTING_PACKAGE, path);

const cleanMapPaths = new Map<string, string>();
for (const manifest of PACKAGE_REGISTRY) {
  for (const path of manifest.cleanMaps ?? []) {
    const fileKey = `../../${path}`;
    if (!mapFiles[fileKey]) throw new Error(`${manifest.id}: очищенная карта не попала в сборку: ${path}`);
    const fileName = path.split('/').at(-1)!;
    const cleanId = fileName.replace(/\.json$/i, '');
    const baseId = cleanId.replace(/-clean$/, '');
    if (cleanId === baseId || cleanMapPaths.has(baseId)) throw new Error(`${manifest.id}: повторная или неверно названная очищенная карта ${path}`);
    cleanMapPaths.set(baseId, fileKey);
  }
}

/** Основные паспорта карт всех подключённых setting-пакетов. */
export function mapsFromRegistry(): Readonly<Record<string, MapPassport>> {
  const maps: Record<string, MapPassport> = {};
  for (const manifest of PACKAGE_REGISTRY) {
    if (manifest.kind !== 'setting') continue;
    for (const path of manifest.maps ?? []) {
      const raw = mapFiles[`../../${path}`];
      if (!raw) throw new Error(`${manifest.id}: карта не попала в сборку: ${path}`);
      const passport = raw as MapPassport;
      if (!passport.id || maps[passport.id]) throw new Error(`${manifest.id}: у карты отсутствует или повторяется id: ${path}`);
      maps[passport.id] = passport;
    }
  }
  return maps;
}

/** Загрузить паспорт очищенной карты, объявленный в манифесте пакета для исходной карты. */
export async function cleanMapFor(baseId: string): Promise<unknown | null> {
  const fileKey = cleanMapPaths.get(baseId);
  if (!fileKey) return null;
  return mapFiles[fileKey];
}
