/** Runtime contract for content packages (research/setting-package.md, I1).
 * A package is immutable authored content; a session save remains an event log.
 */

export const PACKAGE_FORMAT = 1 as const;

export type PackageKind = 'rules' | 'setting' | 'shared' | 'campaign';
export type Distribution = 'open' | 'table' | 'internal';

export interface PackageRequirement {
  id: string;
  version?: string;
}

export interface PackageLayer {
  id: string;
  /** Relative path from the package root. During migration step 1 this is the repository root. */
  path: string;
  /** A layer can be split into stable numbered files, e.g. chronology/events/{0-9}.json. */
  chunks?: string;
  kinds: readonly string[];
  license: string;
  distribution: Distribution;
  attribution?: string;
  decision?: string;
  source?: { url?: string; dump?: string };
  importer?: string;
  importedAt?: string;
  derivedFrom?: readonly string[];
}

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  id: string;
  kind: PackageKind;
  title: string;
  titleRu?: string;
  version: string;
  requires?: readonly PackageRequirement[];
  rules?: { systems: readonly string[]; default: string };
  time?: { calendar?: string; calendarData?: string; lenses?: string; lensesData?: string };
  ladder?: string;
  maps?: readonly string[];
  /** Паспорта очищенных подложек, соответствующие картам этого пакета. */
  cleanMaps?: readonly string[];
  kinds?: Readonly<Record<string, { labelRu: string }>>;
  layers: readonly PackageLayer[];
  distribution: Distribution;
  canary?: string;
}

const DISTRIBUTION_RANK: Readonly<Record<Distribution, number>> = { open: 0, table: 1, internal: 2 };
const PACKAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPDX_LICENSE = /^[A-Za-z0-9.+() -]+$/;

function object(value: unknown, at: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: ожидается объект`);
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, at: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${at}: ожидается непустая строка`);
  return value.trim();
}

function optionalString(value: unknown, at: string): string | undefined {
  return value === undefined ? undefined : nonEmpty(value, at);
}

function stringArray(value: unknown, at: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${at}: ожидается список строк`);
  return value.map((item, i) => nonEmpty(item, `${at}[${i}]`));
}

function relativePackagePath(value: unknown, at: string): string {
  const path = nonEmpty(value, at).replaceAll('\\', '/');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.split('/').some(part => part === '..' || part === '.')) {
    throw new Error(`${at}: путь должен оставаться внутри пакета`);
  }
  if (path.includes('?') || path.includes('#')) throw new Error(`${at}: в пути не допускаются query и fragment`);
  return path;
}

function distribution(value: unknown, at: string): Distribution {
  if (value === 'open' || value === 'table' || value === 'internal') return value;
  throw new Error(`${at}: ожидается open, table или internal`);
}

function parseRequirement(value: unknown, at: string): PackageRequirement {
  const raw = object(value, at);
  const id = nonEmpty(raw.id, `${at}.id`);
  if (!PACKAGE_ID.test(id)) throw new Error(`${at}.id: недопустимый идентификатор пакета`);
  const version = optionalString(raw.version, `${at}.version`);
  return { id, ...(version ? { version } : {}) };
}

function parseLayer(value: unknown, at: string): PackageLayer {
  const raw = object(value, at);
  const id = nonEmpty(raw.id, `${at}.id`);
  if (!PACKAGE_ID.test(id)) throw new Error(`${at}.id: недопустимый идентификатор слоя`);
  const path = relativePackagePath(raw.path, `${at}.path`);
  const chunks = raw.chunks === undefined ? undefined : relativePackagePath(raw.chunks, `${at}.chunks`);
  const kinds = stringArray(raw.kinds, `${at}.kinds`);
  if (new Set(kinds).size !== kinds.length) throw new Error(`${at}.kinds: повторяющийся вид`);
  const license = nonEmpty(raw.license, `${at}.license`);
  if (!SPDX_LICENSE.test(license)) throw new Error(`${at}.license: недопустимая строка лицензии`);
  const layerDistribution = distribution(raw.distribution, `${at}.distribution`);
  const derivedFrom = raw.derivedFrom === undefined ? undefined : stringArray(raw.derivedFrom, `${at}.derivedFrom`);
  const sourceRaw = raw.source === undefined ? undefined : object(raw.source, `${at}.source`);
  const source = sourceRaw ? {
    ...(optionalString(sourceRaw.url, `${at}.source.url`) ? { url: sourceRaw.url as string } : {}),
    ...(optionalString(sourceRaw.dump, `${at}.source.dump`) ? { dump: sourceRaw.dump as string } : {}),
  } : undefined;
  return {
    id, path, ...(chunks ? { chunks } : {}), kinds, license, distribution: layerDistribution,
    ...(optionalString(raw.attribution, `${at}.attribution`) ? { attribution: raw.attribution as string } : {}),
    ...(optionalString(raw.decision, `${at}.decision`) ? { decision: raw.decision as string } : {}),
    ...(source ? { source } : {}),
    ...(optionalString(raw.importer, `${at}.importer`) ? { importer: raw.importer as string } : {}),
    ...(optionalString(raw.importedAt, `${at}.importedAt`) ? { importedAt: raw.importedAt as string } : {}),
    ...(derivedFrom ? { derivedFrom } : {}),
  };
}

/** Validate the I1 manifest and return a normalized immutable shape. */
export function parsePackageManifest(value: unknown): PackageManifest {
  const raw = object(value, 'manifest');
  if (raw.format !== PACKAGE_FORMAT) throw new Error(`manifest.format: неподдерживаемый формат ${String(raw.format)}`);
  const id = nonEmpty(raw.id, 'manifest.id');
  if (!PACKAGE_ID.test(id)) throw new Error('manifest.id: допустимы строчные латинские буквы, цифры и дефис');
  if (raw.kind !== 'rules' && raw.kind !== 'setting' && raw.kind !== 'shared' && raw.kind !== 'campaign') {
    throw new Error('manifest.kind: ожидается rules, setting, shared или campaign');
  }
  const title = nonEmpty(raw.title, 'manifest.title');
  const titleRu = optionalString(raw.titleRu, 'manifest.titleRu');
  const version = nonEmpty(raw.version, 'manifest.version');
  if (!Array.isArray(raw.layers) || raw.layers.length === 0) throw new Error('manifest.layers: нужен хотя бы один слой');
  const layers = raw.layers.map((layer, i) => parseLayer(layer, `manifest.layers[${i}]`));
  const layerIds = new Set<string>();
  for (const layer of layers) {
    if (layerIds.has(layer.id)) throw new Error(`manifest.layers: повторяется id ${layer.id}`);
    layerIds.add(layer.id);
  }
  for (const layer of layers) {
    for (const parent of layer.derivedFrom ?? []) {
      if (!layerIds.has(parent)) throw new Error(`слой ${layer.id}: неизвестный derivedFrom ${parent}`);
      if (DISTRIBUTION_RANK[layer.distribution] < DISTRIBUTION_RANK[layers.find(x => x.id === parent)!.distribution]) {
        throw new Error(`слой ${layer.id}: распространение мягче производного слоя ${parent}`);
      }
    }
  }
  const packageDistribution = distribution(raw.distribution, 'manifest.distribution');
  const strictestLayer = layers.reduce((strictest, layer) =>
    DISTRIBUTION_RANK[layer.distribution] > DISTRIBUTION_RANK[strictest] ? layer.distribution : strictest, 'open' as Distribution);
  if (DISTRIBUTION_RANK[packageDistribution] < DISTRIBUTION_RANK[strictestLayer]) {
    throw new Error('manifest.distribution: пакет не может быть открытее своего самого строгого слоя');
  }
  const requires = raw.requires === undefined ? undefined : (() => {
    if (!Array.isArray(raw.requires)) throw new Error('manifest.requires: ожидается список пакетов');
    const parsed = raw.requires.map((item, i) => parseRequirement(item, `manifest.requires[${i}]`));
    if (new Set(parsed.map(item => item.id)).size !== parsed.length) throw new Error('manifest.requires: повторяющаяся зависимость');
    if (parsed.some(item => item.id === id)) throw new Error('manifest.requires: пакет не может зависеть от себя');
    return parsed;
  })();
  const rulesRaw = raw.rules === undefined ? undefined : object(raw.rules, 'manifest.rules');
  const rules = rulesRaw ? (() => {
    const systems = stringArray(rulesRaw.systems, 'manifest.rules.systems');
    const defaultSystem = nonEmpty(rulesRaw.default, 'manifest.rules.default');
    if (!systems.includes(defaultSystem)) throw new Error('manifest.rules.default должен входить в systems');
    return { systems, default: defaultSystem };
  })() : undefined;
  const timeRaw = raw.time === undefined ? undefined : object(raw.time, 'manifest.time');
  const time = timeRaw ? {
    ...(optionalString(timeRaw.calendar, 'manifest.time.calendar') ? { calendar: timeRaw.calendar as string } : {}),
    ...(timeRaw.calendarData === undefined ? {} : { calendarData: relativePackagePath(timeRaw.calendarData, 'manifest.time.calendarData') }),
    ...(optionalString(timeRaw.lenses, 'manifest.time.lenses') ? { lenses: timeRaw.lenses as string } : {}),
    ...(timeRaw.lensesData === undefined ? {} : { lensesData: relativePackagePath(timeRaw.lensesData, 'manifest.time.lensesData') }),
  } : undefined;
  const kindsRaw = raw.kinds === undefined ? undefined : object(raw.kinds, 'manifest.kinds');
  const kinds = kindsRaw ? Object.fromEntries(Object.entries(kindsRaw).map(([kind, data]) => {
    if (!PACKAGE_ID.test(kind)) throw new Error(`manifest.kinds.${kind}: недопустимый вид`);
    const entry = object(data, `manifest.kinds.${kind}`);
    return [kind, { labelRu: nonEmpty(entry.labelRu, `manifest.kinds.${kind}.labelRu`) }];
  })) : undefined;
  const maps = raw.maps === undefined ? undefined : stringArray(raw.maps, 'manifest.maps').map((path, i) => relativePackagePath(path, `manifest.maps[${i}]`));
  const cleanMaps = raw.cleanMaps === undefined ? undefined : stringArray(raw.cleanMaps, 'manifest.cleanMaps').map((path, i) => relativePackagePath(path, `manifest.cleanMaps[${i}]`));
  const ladder = raw.ladder === undefined ? undefined : relativePackagePath(raw.ladder, 'manifest.ladder');
  const canary = optionalString(raw.canary, 'manifest.canary');
  if (raw.kind === 'setting') {
    if (!time?.calendar || !time.calendarData) throw new Error('manifest.time: сеттингу нужны calendar и calendarData');
    if (!time.lenses || !time.lensesData) throw new Error('manifest.time: сеттингу нужны lenses и lensesData');
    if (!ladder) throw new Error('manifest.ladder: сеттингу нужна лестница масштабов');
    const layerByPath = new Map(layers.map(layer => [layer.path, layer]));
    for (const [field, path] of [
      ['time.calendarData', time.calendarData],
      ['time.lensesData', time.lensesData],
      ['ladder', ladder],
      ...((maps ?? []).map((path, i) => [`maps[${i}]`, path] as const)),
      ...((cleanMaps ?? []).map((path, i) => [`cleanMaps[${i}]`, path] as const)),
    ] as const) {
      if (!layerByPath.has(path)) throw new Error(`manifest.${field}: ссылка должна быть объявлена отдельным слоем: ${path}`);
    }
    if (!layerByPath.get(time.calendarData)!.kinds.includes('calendar')) throw new Error('manifest.time.calendarData: слой должен содержать kind calendar');
    if (!layerByPath.get(time.lensesData)!.kinds.includes('canon-lens')) throw new Error('manifest.time.lensesData: слой должен содержать kind canon-lens');
    if (!layerByPath.get(ladder)!.kinds.includes('scale-ladder')) throw new Error('manifest.ladder: слой должен содержать kind scale-ladder');
    for (const path of [...(maps ?? []), ...(cleanMaps ?? [])]) {
      if (!layerByPath.get(path)!.kinds.includes('map')) throw new Error(`manifest.maps: слой должен содержать kind map: ${path}`);
    }
  }
  if (DISTRIBUTION_RANK[strictestLayer] > DISTRIBUTION_RANK.open && !canary) {
    throw new Error('manifest.canary: обязателен для пакета с закрытым распространением');
  }
  return {
    format: PACKAGE_FORMAT, id, kind: raw.kind, title, version,
    ...(titleRu ? { titleRu } : {}), ...(requires ? { requires } : {}), ...(rules ? { rules } : {}),
    ...(time ? { time } : {}), ...(ladder ? { ladder } : {}), ...(maps ? { maps } : {}), ...(cleanMaps ? { cleanMaps } : {}), ...(kinds ? { kinds } : {}),
    layers, distribution: packageDistribution, ...(canary ? { canary } : {}),
  };
}

export function readPackageManifest(json: string): PackageManifest {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('manifest: некорректный JSON'); }
  return parsePackageManifest(value);
}
