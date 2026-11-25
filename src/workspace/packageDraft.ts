import { parsePackageManifest, type PackageManifest } from '../packages/manifest';

/** Legacy prose records stay readable; these remain inert package content, never campaign facts. */
export interface AuthoredRecord {
  id: string;
  kind: 'place' | 'person' | 'scene' | 'fact';
  name: string;
  text: string;
  audience: 'dm' | 'players';
  source: string;
  /** Stable references into an installed adventure package; these do not import or activate its nodes. */
  references?: AuthoredPackageReference[];
}

export interface AuthoredPackageReference {
  packageId: string;
  version: string;
  nodeId: string;
}

export const AUTHOR_TEMPLATE_VERSION = '1.0.0' as const;
export const AUTHOR_TEMPLATE_KINDS = ['location', 'person', 'path', 'terrain', 'event', 'rumor', 'scene'] as const;
export type AuthorTemplateKind = typeof AUTHOR_TEMPLATE_KINDS[number];
export type AuthoringProvenance =
  | { kind: 'author'; ref: string }
  | { kind: 'package'; ref: string; version: string; nodeId: string }
  | { kind: 'source'; ref: string; citation?: string; pages?: number[] };
export type AuthoringLink = { relation: string; target: string };

interface TemplateBase<K extends AuthorTemplateKind, D> {
  id: string;
  kind: K;
  template: { id: K; version: typeof AUTHOR_TEMPLATE_VERSION };
  name: string;
  summary: string;
  audience: 'dm' | 'players';
  provenance: AuthoringProvenance[];
  links: AuthoringLink[];
  data: D;
}

export interface AuthoredMapPoint {
  mapId: string;
  key: string;
  point: { x: number; y: number };
  coordinateSpace: 'source-pixel' | 'map-unit';
  source: string;
}
export interface AuthoredTime {
  kind: 'unknown' | 'absolute' | 'relative';
  calendarId?: string;
  year?: number;
  month?: number;
  day?: number;
  precision?: 'year' | 'month' | 'day';
  relation?: 'before' | 'after' | 'during';
  anchorId?: string;
  offset?: { value: number; unit: 'day' | 'month' | 'year' };
}

export type AuthoredTemplate =
  | (TemplateBase<'location', { category?: string; subtype?: string; mapPoint?: AuthoredMapPoint }>)
  | (TemplateBase<'person', { role?: string }>)
  | (TemplateBase<'path', { mode: 'road' | 'rail' | 'sea' | 'air' | 'other'; topology: { fromId: string; viaIds: string[]; toId: string } }>)
  | (TemplateBase<'terrain', { biome?: string; landform?: string; surface?: string; areaRef?: { mapId: string; geometryId: string; source: string } }>)
  /** A sourced chronology statement, not an event in the campaign log. */
  | (TemplateBase<'event', { statement?: string; time: AuthoredTime }>)
  /** An attributed claim; verification here does not reveal or mutate campaign knowledge. */
  | (TemplateBase<'rumor', { claim?: string; status: 'unverified' | 'confirmed' | 'disproved' }>)
  /** A playable content plan; opening it does not assert that it occurred. */
  | (TemplateBase<'scene', { procedure?: string; trigger?: string }> & { time?: AuthoredTime });

export interface PackageDraft {
  format: 'cockpit.author-package/1';
  manifest: PackageManifest;
  records: AuthoredRecord[];
  /** Versioned semantic templates are optional so previously saved drafts remain valid. */
  templates?: AuthoredTemplate[];
}

export const DRAFT_KEY = 'dm-cockpit:author-package:v1';
const AUTHOR_LAYER = {
  id: 'author-content', path: 'content/author/records.json', kinds: ['place', 'person', 'scene', 'fact'],
  license: 'LicenseRef-Author-Local', distribution: 'table' as const, attribution: 'Автор кампании',
};
const TEMPLATE_LAYER = {
  id: 'author-world', path: 'content/author/world.json', kinds: ['authored-template/1'],
  license: 'LicenseRef-Author-Local', distribution: 'table' as const, attribution: 'Автор кампании',
};

export function newPackageDraft(): PackageDraft {
  return {
    format: 'cockpit.author-package/1',
    manifest: {
      format: 1, id: 'my-adventure', kind: 'campaign', title: 'Моё приключение', version: '0.1.0',
      distribution: 'table', canary: 'LOCAL_AUTHOR_PACKAGE_PERSONAL_TABLE', requires: [], layers: [AUTHOR_LAYER, TEMPLATE_LAYER],
    },
    records: [], templates: [],
  };
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown, at: string, max = 30000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`${at}: укажите текст не длиннее ${max} символов`);
  return value.trim();
};
const optionalText = (value: unknown, at: string, max = 30000): string | undefined => {
  if (value === undefined || value === '') return undefined;
  return nonEmpty(value, at, max);
};
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;

export const AUTHOR_LINK_TARGETS: Readonly<Record<AuthorTemplateKind, Readonly<Record<string, readonly AuthorTemplateKind[]>>>> = {
  location: { contains: ['location'], within: ['location'], on: ['location'] },
  person: { 'associated-place': ['location'] },
  path: {},
  terrain: { at: ['location'], within: ['location'], on: ['location'] },
  event: { at: ['location'], participant: ['person'], 'after-scene': ['scene'] },
  rumor: { about: ['location', 'person', 'event', 'scene'], 'heard-at': ['location'] },
  scene: { at: ['location'], participant: ['person'], route: ['path'], 'after-scene': ['scene'] },
};

function parseProvenance(value: unknown, at: string): AuthoringProvenance[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) throw Error(`${at}: нужна ссылка на происхождение (до 40)`);
  return value.map((entry, i) => {
    const where = `${at}[${i}]`;
    if (!object(entry)) throw Error(`${where}: ожидается объект`);
    const kind = entry.kind;
    const ref = nonEmpty(entry.ref, `${where}.ref`, 500);
    if (kind === 'author') return { kind, ref };
    if (kind === 'package') {
      const version = nonEmpty(entry.version, `${where}.version`, 100);
      if (!VERSION.test(version)) throw Error(`${where}.version: ожидается версия пакета`);
      const nodeId = nonEmpty(entry.nodeId, `${where}.nodeId`, 100);
      if (!ID.test(ref) || !ID.test(nodeId)) throw Error(`${where}: id пакета и исходного узла должны быть стабильными`);
      return { kind, ref, version, nodeId };
    }
    if (kind === 'source') {
      const citation = entry.citation === undefined ? undefined : nonEmpty(entry.citation, `${where}.citation`, 1000);
      const pages = entry.pages === undefined ? undefined : (() => {
        if (!Array.isArray(entry.pages) || !entry.pages.length || entry.pages.some(page => !Number.isSafeInteger(page) || Number(page) < 1)) throw Error(`${where}.pages: ожидаются положительные номера страниц`);
        return [...new Set(entry.pages as number[])];
      })();
      return { kind, ref, ...(citation ? { citation } : {}), ...(pages ? { pages } : {}) };
    }
    throw Error(`${where}.kind: ожидается author, package или source`);
  });
}

function parseLinks(value: unknown, at: string): AuthoringLink[] {
  if (!Array.isArray(value) || value.length > 200) throw Error(`${at}: ожидается список связей (до 200)`);
  return value.map((entry, i) => {
    if (!object(entry)) throw Error(`${at}[${i}]: ожидается объект связи`);
    return { relation: nonEmpty(entry.relation, `${at}[${i}].relation`, 80), target: nonEmpty(entry.target, `${at}[${i}].target`, 100) };
  });
}

function parseTime(value: unknown, at: string): AuthoredTime {
  if (!object(value) || !['unknown', 'absolute', 'relative'].includes(String(value.kind))) throw Error(`${at}: ожидается unknown, absolute или relative`);
  if (value.kind === 'unknown') return { kind: 'unknown' };
  if (value.kind === 'absolute') {
    const calendarId = nonEmpty(value.calendarId, `${at}.calendarId`, 100);
    const year = value.year;
    const month = value.month;
    const day = value.day;
    const precision = value.precision;
    if (!Number.isSafeInteger(year) || !['year', 'month', 'day'].includes(String(precision))) throw Error(`${at}: абсолютной дате нужны целый год и точность`);
    if (precision === 'year' && (month !== undefined || day !== undefined) || precision === 'month' && (!Number.isSafeInteger(month) || Number(month) < 1 || day !== undefined) || precision === 'day' && (!Number.isSafeInteger(month) || Number(month) < 1 || !Number.isSafeInteger(day) || Number(day) < 1)) throw Error(`${at}: компоненты даты не совпадают с точностью`);
    return { kind: 'absolute', calendarId, year: Number(year), ...(month === undefined ? {} : { month: Number(month) }), ...(day === undefined ? {} : { day: Number(day) }), precision: precision as 'year' | 'month' | 'day' };
  }
  const relation = value.relation;
  const anchorId = nonEmpty(value.anchorId, `${at}.anchorId`, 100);
  if (!['before', 'after', 'during'].includes(String(relation))) throw Error(`${at}.relation: ожидается before, after или during`);
  let offset: AuthoredTime['offset'];
  if (value.offset !== undefined) {
    if (!object(value.offset) || !Number.isSafeInteger(value.offset.value) || Number(value.offset.value) < 0 || !['day', 'month', 'year'].includes(String(value.offset.unit))) throw Error(`${at}.offset: ожидается неотрицательное целое смещение в днях, месяцах или годах`);
    offset = { value: Number(value.offset.value), unit: value.offset.unit as 'day' | 'month' | 'year' };
  }
  return { kind: 'relative', relation: relation as 'before' | 'after' | 'during', anchorId, ...(offset ? { offset } : {}) };
}

function parseMapPoint(value: unknown, at: string): AuthoredMapPoint {
  if (!object(value) || !object(value.point) || !['source-pixel', 'map-unit'].includes(String(value.coordinateSpace))) throw Error(`${at}: неверная точка карты`);
  if (![value.point.x, value.point.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) throw Error(`${at}.point: нужны неотрицательные координаты`);
  return {
    mapId: nonEmpty(value.mapId, `${at}.mapId`, 100), key: nonEmpty(value.key, `${at}.key`, 200),
    point: { x: Number(value.point.x), y: Number(value.point.y) }, coordinateSpace: value.coordinateSpace as 'source-pixel' | 'map-unit',
    source: nonEmpty(value.source, `${at}.source`, 500),
  };
}

function parseTemplate(value: unknown, at: string): AuthoredTemplate {
  if (!object(value)) throw Error(`${at}: ожидается объект шаблона`);
  const id = nonEmpty(value.id, `${at}.id`, 100);
  if (!ID.test(id)) throw Error(`${at}.id: используйте стабильный id из строчных латинских букв, цифр и дефисов`);
  if (typeof value.kind !== 'string' || !AUTHOR_TEMPLATE_KINDS.includes(value.kind as AuthorTemplateKind)) throw Error(`${at}.kind: неизвестный тип шаблона`);
  const kind = value.kind as AuthorTemplateKind;
  if (!object(value.template) || value.template.id !== kind || value.template.version !== AUTHOR_TEMPLATE_VERSION) throw Error(`${at}.template: нужна версия ${AUTHOR_TEMPLATE_VERSION} для шаблона ${String(kind)}`);
  if (value.audience !== 'dm' && value.audience !== 'players') throw Error(`${at}.audience: ожидается dm или players`);
  if (!object(value.data)) throw Error(`${at}.data: ожидается объект полей шаблона`);
  const common = {
    id, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, name: nonEmpty(value.name, `${at}.name`, 200),
    summary: nonEmpty(value.summary, `${at}.summary`, 4000), audience: value.audience,
    provenance: parseProvenance(value.provenance, `${at}.provenance`), links: parseLinks(value.links, `${at}.links`),
  } as const;
  const data = value.data;
  switch (kind) {
    case 'location':
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: {
        ...(optionalText(data.category, `${at}.data.category`, 100) ? { category: optionalText(data.category, `${at}.data.category`, 100)! } : {}),
        ...(optionalText(data.subtype, `${at}.data.subtype`, 100) ? { subtype: optionalText(data.subtype, `${at}.data.subtype`, 100)! } : {}),
        ...(data.mapPoint === undefined ? {} : { mapPoint: parseMapPoint(data.mapPoint, `${at}.data.mapPoint`) }),
      } };
    case 'person':
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...(optionalText(data.role, `${at}.data.role`, 200) ? { role: optionalText(data.role, `${at}.data.role`, 200)! } : {}) } };
    case 'path': {
      if (!['road', 'rail', 'sea', 'air', 'other'].includes(String(data.mode)) || !object(data.topology)) throw Error(`${at}.data: путь должен иметь режим и топологию`);
      const fromId = nonEmpty(data.topology.fromId, `${at}.data.topology.fromId`, 100);
      const toId = nonEmpty(data.topology.toId, `${at}.data.topology.toId`, 100);
      if (!Array.isArray(data.topology.viaIds) || data.topology.viaIds.length > 200 || data.topology.viaIds.some(x => typeof x !== 'string' || !x.trim())) throw Error(`${at}.data.topology.viaIds: ожидается упорядоченный список узлов пути`);
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { mode: data.mode as 'road' | 'rail' | 'sea' | 'air' | 'other', topology: { fromId, viaIds: data.topology.viaIds.map(String), toId } } };
    }
    case 'terrain': {
      const areaRef = data.areaRef === undefined ? undefined : (() => {
        if (!object(data.areaRef)) throw Error(`${at}.data.areaRef: ожидается ссылка на область карты`);
        return { mapId: nonEmpty(data.areaRef.mapId, `${at}.data.areaRef.mapId`, 100), geometryId: nonEmpty(data.areaRef.geometryId, `${at}.data.areaRef.geometryId`, 200), source: nonEmpty(data.areaRef.source, `${at}.data.areaRef.source`, 500) };
      })();
      const biome = data.biome === undefined ? undefined : nonEmpty(data.biome, `${at}.data.biome`, 100);
      const landform = data.landform === undefined ? undefined : nonEmpty(data.landform, `${at}.data.landform`, 100);
      const surface = data.surface === undefined ? undefined : nonEmpty(data.surface, `${at}.data.surface`, 100);
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...(biome ? { biome } : {}), ...(landform ? { landform } : {}), ...(surface ? { surface } : {}), ...(areaRef ? { areaRef } : {}) } };
    }
    case 'event':
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...(optionalText(data.statement, `${at}.data.statement`, 30000) ? { statement: optionalText(data.statement, `${at}.data.statement`, 30000)! } : {}), time: parseTime(data.time, `${at}.data.time`) } };
    case 'rumor':
      if (!['unverified', 'confirmed', 'disproved'].includes(String(data.status))) throw Error(`${at}.data.status: ожидается статус слуха`);
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...(optionalText(data.claim, `${at}.data.claim`, 30000) ? { claim: optionalText(data.claim, `${at}.data.claim`, 30000)! } : {}), status: data.status as 'unverified' | 'confirmed' | 'disproved' } };
    case 'scene':
      return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: {
        ...(data.procedure === undefined ? {} : { procedure: nonEmpty(data.procedure, `${at}.data.procedure`, 30000) }),
        ...(data.trigger === undefined ? {} : { trigger: nonEmpty(data.trigger, `${at}.data.trigger`, 4000) }),
      }, ...(value.time === undefined ? {} : { time: parseTime(value.time, `${at}.time`) }) };
  }
}

/** Validate one draft and return a fresh normalized shape; no record is activated into a campaign. */
export function validateDraft(raw: unknown, packages: readonly { id: string; version: string }[]): PackageDraft {
  if (!object(raw)) throw Error('Ожидается файл авторского пакета');
  if (raw.format !== 'cockpit.author-package/1' || !Array.isArray(raw.records) || raw.records.length > 2000) throw Error('Неподдерживаемый формат или размер пакета');
  const manifest = parsePackageManifest(raw.manifest);
  if (!VERSION.test(manifest.version)) throw Error('Версия: три числа, например 0.1.0');
  if (manifest.kind !== 'campaign' || manifest.distribution !== 'table') throw Error('Авторский пакет пока предназначен только для личного стола');
  for (const dependency of manifest.requires ?? []) {
    const found = packages.find(pkg => pkg.id === dependency.id);
    if (!found) throw Error(`Не найдена зависимость ${dependency.id}`);
    if (dependency.version && dependency.version !== found.version) throw Error(`Версия ${dependency.id}: нужна ${dependency.version}, доступна ${found.version}`);
  }
  const recordIds = new Set<string>();
  const records = raw.records.map((record, index) => {
    const at = `Запись ${index + 1}`;
    if (!object(record) || typeof record.id !== 'string' || !record.id.trim() || recordIds.has(record.id)) throw Error(`${at}: отсутствует или повторяется id`);
    recordIds.add(record.id);
    if (!['place', 'person', 'scene', 'fact'].includes(String(record.kind)) || !['dm', 'players'].includes(String(record.audience)) || typeof record.name !== 'string' || !record.name.trim() || typeof record.text !== 'string' || !record.text.trim() || typeof record.source !== 'string' || !record.source.trim()) throw Error(`${at}: укажите тип, имя, текст, источник и аудиторию`);
    if (record.name.length > 200 || record.text.length > 30000 || record.source.length > 500) throw Error(`${at} слишком велика`);
    const references = record.references === undefined ? undefined : (() => {
      if (!Array.isArray(record.references) || record.references.length > 200) throw Error(`${at}: ожидается до 200 ссылок на записи пакетов`);
      const seen = new Set<string>();
      return record.references.map((reference, referenceIndex) => {
        const where = `${at}.references[${referenceIndex}]`;
        if (!object(reference)) throw Error(`${where}: ожидается ссылка на запись пакета`);
        const packageId = nonEmpty(reference.packageId, `${where}.packageId`, 100);
        const version = nonEmpty(reference.version, `${where}.version`, 100);
        const nodeId = nonEmpty(reference.nodeId, `${where}.nodeId`, 100);
        if (!ID.test(packageId) || !ID.test(nodeId) || !VERSION.test(version)) throw Error(`${where}: некорректный id пакета, версия или id записи`);
        const key = `${packageId}@${version}/${nodeId}`;
        if (seen.has(key)) throw Error(`${where}: повторяется ссылка ${key}`);
        seen.add(key);
        return { packageId, version, nodeId };
      });
    })();
    return { id: record.id, kind: record.kind, name: record.name.trim(), text: record.text.trim(), audience: record.audience, source: record.source.trim(), ...(references === undefined ? {} : { references }) } as AuthoredRecord;
  });
  const templates = raw.templates === undefined ? [] : (() => {
    if (!Array.isArray(raw.templates) || raw.templates.length > 2000) throw Error('Шаблоны: ожидается список до 2000 записей');
    return raw.templates.map((template, i) => parseTemplate(template, `Шаблон ${i + 1}`));
  })();
  const allIds = new Set(recordIds);
  const byId = new Map<string, AuthoredTemplate>();
  for (const template of templates) {
    if (allIds.has(template.id)) throw Error(`Пакет: повторяется id ${template.id}`);
    allIds.add(template.id);
    byId.set(template.id, template);
  }
  for (const template of templates) {
    const allowed = AUTHOR_LINK_TARGETS[template.kind];
    const seen = new Set<string>();
    for (const link of template.links) {
      const target = byId.get(link.target);
      const key = `${link.relation}\0${link.target}`;
      if (!target || link.target === template.id) throw Error(`Шаблон ${template.id}: связь ведёт на неизвестный или свой id ${link.target}`);
      if (!Object.hasOwn(allowed, link.relation) || !allowed[link.relation].includes(target.kind)) throw Error(`Шаблон ${template.id}: недопустимая связь ${link.relation} → ${target.kind}`);
      if (seen.has(key)) throw Error(`Шаблон ${template.id}: повторяется связь ${link.relation} → ${link.target}`);
      if (template.audience === 'players' && target.audience === 'dm') throw Error(`Шаблон ${template.id}: игроковая запись не может ссылаться на закрытый шаблон ${target.id}`);
      seen.add(key);
    }
    if (template.kind === 'path') {
      const targetKinds = [template.data.topology.fromId, ...template.data.topology.viaIds, template.data.topology.toId].map(id => byId.get(id)?.kind);
      if (targetKinds.some(kind => kind !== 'location')) throw Error(`Шаблон ${template.id}: начало, узлы и конец пути должны ссылаться на места`);
      if (new Set([template.data.topology.fromId, ...template.data.topology.viaIds, template.data.topology.toId]).size !== targetKinds.length) throw Error(`Шаблон ${template.id}: повторяется узел топологии`);
      if (template.audience === 'players' && [template.data.topology.fromId, ...template.data.topology.viaIds, template.data.topology.toId].some(id => byId.get(id)?.audience === 'dm')) throw Error(`Шаблон ${template.id}: игроковый путь не может включать закрытое место`);
    }
    const time = template.kind === 'event' ? template.data.time : 'time' in template ? template.time : undefined;
    if (time?.kind === 'relative') {
      const anchor = byId.get(time.anchorId!);
      if (!anchor || (anchor.kind !== 'event' && anchor.kind !== 'scene')) throw Error(`Шаблон ${template.id}: относительная дата ссылается на неизвестное событие или сцену`);
      if (template.audience === 'players' && anchor.audience === 'dm') throw Error(`Шаблон ${template.id}: игроковая дата ссылается на закрытый якорь`);
    }
  }
  if (templates.length && !manifest.layers.some(layer => layer.id === 'author-world' && layer.kinds.includes('authored-template/1'))) throw Error('manifest.layers: для шаблонов нужен слой author-world с authored-template/1');
  return { format: 'cockpit.author-package/1', manifest, records, templates };
}

/** Legacy prose preview remains compatible with older callers. */
export function authorPreview(draft: PackageDraft, audience: 'dm' | 'players') {
  return draft.records.filter(record => audience === 'dm' || record.audience === 'players').map(record => ({
    id: record.id, kind: record.kind, name: record.name, text: record.text,
    ...(audience === 'dm' ? { source: record.source, audience: record.audience, ...(record.references ? { references: structuredClone(record.references) } : {}) } : {}),
  }));
}

/** Template projection shares stable ids and only keeps links whose target is visible to that audience. */
export function authoredTemplatePreview(draft: PackageDraft, audience: 'dm' | 'players') {
  const templates = draft.templates ?? [];
  const visible = templates.filter(template => audience === 'dm' || template.audience === 'players');
  const ids = new Set(visible.map(template => template.id));
  return visible.map(template => ({
    id: template.id, kind: template.kind, name: template.name, summary: template.summary, audience: template.audience,
    links: template.links.filter(link => ids.has(link.target)).map(link => ({ ...link })),
    data: previewData(template, audience),
    template: { ...template.template },
    ...(audience === 'dm' ? { provenance: structuredClone(template.provenance) } : {}),
    ...('time' in template ? { time: template.time ? structuredClone(template.time) : undefined } : {}),
  }));
}

function previewData(template: AuthoredTemplate, audience: 'dm' | 'players') {
  if (audience === 'players' && template.kind === 'location') {
    const data = structuredClone(template.data);
    if (data.mapPoint) delete (data.mapPoint as Partial<AuthoredMapPoint>).source;
    return data;
  }
  if (audience === 'players' && template.kind === 'terrain') {
    const data = structuredClone(template.data);
    if (data.areaRef) delete (data.areaRef as { source?: string }).source;
    return data;
  }
  return structuredClone(template.data);
}
