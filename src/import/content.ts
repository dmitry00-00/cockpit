import { ADVENTURE_FORMAT, parseAdventureBundle } from '../packages/adventure';
import { type ImportedContent, type ImportedContentKind, type Location } from '../engine';
import { findExactSourceMetadata, hasConfirmedSrdSourceMarker } from './sourceProvenance';

export interface ImportCandidate extends ImportedContent {
  summary: string;
  /** Optional legacy hint only; catalog acceptance never applies it to the campaign world. */
  worldLocation?: Location;
}

type JsonObject = Record<string, unknown>;
const object = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown, fallback: string) => typeof v === 'string' && v.trim() ? v.trim() : fallback;
const safeId = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';
/** Stable disambiguator keeps Cyrillic-only names and same-named files from collapsing to the same id. */
export function importHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
}
const enforceLimits = (items: ImportCandidate[]) => {
  if (items.length > 100) throw new Error('В одном файле можно импортировать не более 100 записей за раз.');
  if (JSON.stringify(items).length > 1_000_000) throw new Error('Нормализованный импорт больше 1 МБ; разделите файл на меньшие части.');
  return items;
};

function candidate(file: string, format: ImportedContent['sourceFormat'], kind: ImportedContentKind, name: string, data: JsonObject, index: number, summary?: string): ImportCandidate {
  const fileKey = safeId(file.replace(/\.[^.]+$/, ''));
  const identity = JSON.stringify({ file, kind, name, index, data });
  const id = `import-${fileKey}-${kind}-${safeId(name)}-${importHash(identity)}`;
  return { id, kind, name, sourceFormat: format, sourceFile: file, rights: { status: 'unverified' }, data, summary: summary ?? `${kind} · ${format} · ${file}` };
}

/** Разбирает локальные пользовательские файлы в кандидатов; ничего не записывает в состояние кампании. */
export function parseContentImport(fileName: string, source: string): ImportCandidate[] {
  if (source.length > 10_000_000) throw new Error('Файл больше 10 МБ; разделите его перед импортом.');
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (!['json', 'dd2vtt', 'uvtt'].includes(extension)) {
    if (['rpmap', 'cmpgn'].includes(extension)) throw new Error('Файлы MapTool (.rpmap, .cmpgn) читаются из ZIP-контейнера; выберите файл через панель импорта MapTool.');
    throw new Error(`Формат .${extension} пока не поддерживается.`);
  }
  let root: unknown;
  try { root = JSON.parse(source); } catch { throw new Error('Файл не содержит корректный JSON.'); }
  if (!object(root)) throw new Error('Ожидается JSON-объект.');
  if (root.format === ADVENTURE_FORMAT) {
    const bundle = parseAdventureBundle(root);
    const item = candidate(fileName, 'json', 'adventure', bundle.title,
      bundle as unknown as JsonObject, 0,
      `Приключение · ${bundle.nodes.length} связанных записей · ${bundle.scope} Импорт сохраняет каталог; игровые сущности отдельно не создаются.`);
    item.rights = { status: 'unverified', license: `Заявлено распространение: ${bundle.distribution}; источник и права требуют проверки` };
    return enforceLimits([item]);
  }
  const out: ImportCandidate[] = [];

  // Universal VTT: геометрия и параметры сцены идут в предложение; base64-картинка не дублируется в журнале.
  if (extension === 'dd2vtt' || extension === 'uvtt' || 'line_of_sight' in root || 'pixels_per_grid' in (object(root.resolution) ? root.resolution : {})) {
    const resolution = object(root.resolution) ? root.resolution : {};
    if (typeof resolution.pixels_per_grid !== 'number' || !Number.isFinite(resolution.pixels_per_grid) || resolution.pixels_per_grid <= 0 || typeof root.image !== 'string') {
      throw new Error('Universal VTT: нужна сетка с pixels_per_grid и встроенная картинка image.');
    }
    const geometry = ['line_of_sight', 'objects_line_of_sight', 'portals', 'lights'].reduce<JsonObject>((acc, k) => {
      if (Array.isArray(root[k])) acc[k] = root[k];
      return acc;
    }, {});
    const data = { format: root.format, resolution, environment: object(root.environment) ? root.environment : {}, ...geometry, imageOmitted: typeof root.image === 'string' };
    const walls = array(root.line_of_sight).length;
    const doors = array(root.portals).length;
    return enforceLimits([candidate(fileName, 'uvtt', 'scene', text(root.title, fileName), data, 0, `Universal VTT: ${walls} стен, ${doors} дверей. Изображение карты не копируется в журнал; сцена пока хранится как импортированный черновик.`)]);
  }

  const foundryActors = array(root.actors).length ? array(root.actors) : (root.type === 'Actor' || root.documentName === 'Actor' ? [root] : []);
  for (const [index, raw] of foundryActors.entries()) {
    if (!object(raw)) continue;
    const name = text(raw.name, `Актёр ${index + 1}`);
    const system = object(raw.system) ? raw.system : {};
    if (raw.type !== 'character' && raw.type !== 'npc' && raw.type !== 'monster') continue;
    const kind: ImportedContentKind = raw.type === 'character' ? 'character' : 'monster';
    // Keep the source document intact in the catalog. Foundry system versions and embedded item schemas
    // vary; projecting a character to our Actor/CharacterSheet here would silently discard unsupported fields.
    const item = candidate(fileName, 'foundry', kind, name, raw, index, `Foundry dnd5e · ${kind} · ${name}`);
    const source = object(system.source) ? system.source : {};
    if (typeof source.license === 'string' && source.license.trim()) item.rights = { status: 'declared', license: source.license.trim() };
    out.push(item);
  }
  for (const [index, raw] of array(root.monster).entries()) {
    if (!object(raw)) continue;
    const name = text(raw.name, `Монстр ${index + 1}`);
    const src = text(raw.source, '');
    const meta = object(root._meta) ? root._meta : {};
    const sources = array(meta.sources);
    const srdMarked = /^srd(?:\s*5\.1)?$/i.test(src);
    const matchedSource = sources.find(s => hasConfirmedSrdSourceMarker(src, s)) ?? findExactSourceMetadata(src, sources);
    if (srdMarked && !hasConfirmedSrdSourceMarker(src, matchedSource)) {
      throw new Error(`5etools: импорт ${name} остановлен — источник «${src}» не подтверждён точным идентификатором или названием в _meta.sources.`);
    }
    const sourceLabel = src || 'источник не указан';
    const item = candidate(fileName, '5etools', 'monster', name,
      { source: src, ...(matchedSource ? { sourceMetadata: matchedSource } : {}), edition: root.edition, monster: raw }, index,
      `5etools · ${name} · ${srdMarked ? 'SRD' : sourceLabel}`);
    item.rights = {
      status: 'unverified',
      license: srdMarked
        ? 'Файл помечает запись как SRD 5.1; права и происхождение по метке не подтверждены'
        : `Заявленный источник: ${sourceLabel}; лицензия и происхождение не подтверждены`,
    };
    out.push(item);
  }
  for (const [index, raw] of array(root.locations).entries()) {
    if (object(raw)) {
      const item = candidate(fileName, 'json', 'location', text(raw.name, `Место ${index + 1}`), raw, index);
      out.push(item);
    }
  }
  for (const [index, raw] of array(root.dungeons).entries()) {
    if (object(raw)) out.push(candidate(fileName, 'json', 'dungeon', text(raw.name, `Подземелье ${index + 1}`), raw, index));
  }
  const foundryScenes = array(root.scenes).length ? array(root.scenes) : (root.type === 'Scene' || root.documentName === 'Scene' ? [root] : []);
  for (const [index, raw] of foundryScenes.entries()) {
    if (object(raw)) out.push(candidate(fileName, 'foundry', 'scene', text(raw.name, `Сцена ${index + 1}`), raw, index));
  }
  if (out.length === 0) throw new Error('В файле не найдено поддерживаемых актёров Foundry, SRD-монстров 5etools, мест, подземелий или сцен.');
  return enforceLimits(out);
}
