import { PACKAGE_REGISTRY, loadPackageJson, packageLayersForKind } from '../packages/registry';
import { REFERENCE_KINDS, parseRef, type ReferenceKind } from './ref';
import type { Pack } from './pack';
import type { EntityView } from './view';

export const PACKAGE_ENTITY_LAYER_FORMAT = 'cockpit.entity-layer/1' as const;

const SOURCE_KINDS: ReadonlySet<string> = new Set(['srd', 'book', 'hb', 'bf', 'a5e', 'wiki', 'gis', 'campaign', 'package']);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isEntitySource = (value: unknown): boolean => isRecord(value)
  && SOURCE_KINDS.has(String(value.kind))
  && isText(value.cite)
  && (value.url === undefined || typeof value.url === 'string')
  && (value.license === undefined || typeof value.license === 'string')
  && (value.bookId === undefined || isText(value.bookId))
  && (value.chapterNo === undefined || (typeof value.chapterNo === 'number' && Number.isInteger(value.chapterNo) && value.chapterNo >= 0));
const isLinks = (value: unknown): boolean => Array.isArray(value)
  && value.every(link => isRecord(link) && isText(link.label) && isText(link.ref) && !!parseRef(link.ref));
const isGroups = (value: unknown): boolean => Array.isArray(value)
  && value.every(group => isRecord(group) && isText(group.title) && isLinks(group.links) && (group.dashed === undefined || typeof group.dashed === 'boolean'));

function entityViewIssue(value: unknown, kind: ReferenceKind): string | null {
  if (!isRecord(value)) return 'ожидался объект';
  if (value.kind !== kind) return `вид ${String(value.kind)} вместо ${kind}`;
  if (!isText(value.name)) return 'имя отсутствует или пустое';
  if (!isText(value.ref)) return 'ссылка отсутствует или пустая';
  const parsed = parseRef(value.ref);
  if (!parsed || parsed.kind !== kind) return `ссылка ${value.ref} не соответствует виду ${kind}`;
  if (!isRecord(value.source) || !SOURCE_KINDS.has(String(value.source.kind)) || !isText(value.source.cite)) return 'некорректный основной источник';
  if (value.source.license !== undefined && typeof value.source.license !== 'string') return 'source.license должен быть строкой';
  if (value.source.url !== undefined && typeof value.source.url !== 'string') return 'source.url должен быть строкой';
  if (value.source.bookId !== undefined && !isText(value.source.bookId)) return 'source.bookId должен быть непустой строкой';
  if (value.source.chapterNo !== undefined && !(typeof value.source.chapterNo === 'number' && Number.isInteger(value.source.chapterNo) && value.source.chapterNo >= 0)) return 'source.chapterNo должен быть целым неотрицательным числом';
  if (value.sources !== undefined && (!Array.isArray(value.sources) || !value.sources.every(isEntitySource))) return 'некорректен список sources';
  if (!Array.isArray(value.facts) || !value.facts.every(fact => isRecord(fact) && isText(fact.label) && typeof fact.value === 'string')) return 'facts должны содержать label и строковое value';
  if (!Array.isArray(value.sections) || !value.sections.every(section => isRecord(section) && typeof section.text === 'string'
    && (section.title === undefined || typeof section.title === 'string'))) return 'sections должны содержать строковое text и необязательное строковое title';
  if (!isLinks(value.links)) return 'links должны содержать корректные ref и label';
  if (value.groups !== undefined && !isGroups(value.groups)) return 'некорректен список groups';
  if (value.diagram !== undefined && (!isRecord(value.diagram) || !isGroups(value.diagram.above) || !isGroups(value.diagram.below))) return 'некорректна diagram';
  if (value.subtitle !== undefined && typeof value.subtitle !== 'string') return 'subtitle должен быть строкой';
  if (value.nameRu !== undefined && typeof value.nameRu !== 'string') return 'nameRu должен быть строкой';
  return null;
}

/** Read only explicitly declared canonical entity-view documents; raw package layers remain owned by their domain loaders. */
export async function loadPackageEntityViews(packageId: string, kinds: readonly ReferenceKind[] = REFERENCE_KINDS): Promise<Pack> {
  const manifest = PACKAGE_REGISTRY.find(entry => entry.id === packageId && entry.kind === 'setting');
  if (!manifest) throw new Error(`пакет сеттинга не найден: ${packageId}`);
  const paths = [...new Set(kinds.flatMap(kind => packageLayersForKind(packageId, kind)
    .map(layer => layer.path).filter(path => path.endsWith('.json'))))].sort();
  const documents = await Promise.all(paths.map(async path => ({ path, value: await loadPackageJson(packageId, path) })));
  const byKind = new Map<ReferenceKind, Map<string, EntityView>>();

  for (const { path, value } of documents) {
    if (!isRecord(value) || value.format !== PACKAGE_ENTITY_LAYER_FORMAT) continue;
    if (!isText(value.kind) || !(REFERENCE_KINDS as readonly string[]).includes(value.kind)) {
      throw new Error(`${packageId}:${path}: неизвестный вид в entity layer`);
    }
    const kind = value.kind as ReferenceKind;
    if (!kinds.includes(kind)) continue;
    if (!packageLayersForKind(packageId, kind).some(layer => layer.path === path)) {
      throw new Error(`${packageId}:${path}: манифест не объявляет вид ${kind} для этого слоя`);
    }
    if (!Array.isArray(value.entities)) throw new Error(`${packageId}:${path}: entity layer должен содержать список entities`);
    const records = byKind.get(kind) ?? new Map<string, EntityView>();
    for (const [index, candidate] of value.entities.entries()) {
      const issue = entityViewIssue(candidate, kind);
      if (issue) throw new Error(`${packageId}:${path}: некорректная сущность entities[${index}]: ${issue}`);
      const id = parseRef(candidate.ref)!.id;
      if (records.has(id)) throw new Error(`${packageId}:${path}: повторяется ${kind}:${id}`);
      records.set(id, candidate);
    }
    byKind.set(kind, records);
  }

  return {
    kinds: [...byKind.keys()],
    ids: kind => [...(byKind.get(kind)?.keys() ?? [])],
    resolve: (kind, id) => byKind.get(kind)?.get(id),
  };
}

