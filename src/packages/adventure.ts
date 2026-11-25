import { parseRef, type EntityRef } from '../entities/ref';

/** A source-indexed adventure graph is authored content, never a session snapshot.
 * Loading it does not reveal facts, spawn actors, or install locations. */
export const ADVENTURE_FORMAT = 'dm-cockpit.adventure/1' as const;
export const ADVENTURE_KINDS = ['location', 'route', 'npc', 'creature', 'scene', 'thread', 'fact', 'plan', 'handout', 'proposal', 'item'] as const;
export type AdventureKind = typeof ADVENTURE_KINDS[number];
export interface AdventureSource {
  id: string;
  title: string;
  origin: 'book' | 'srd' | 'hb' | 'setting';
  distribution: 'open' | 'table' | 'internal';
  sha256?: string;
  pageCount?: number;
}
export interface AdventureEvidence { source: string; pages: number[] }
/** A manually verified catalogue cross-reference. It does not create an actor or copy stats into the session. */
export interface AdventureEngineBinding {
  packageId: string;
  packageVersion: string;
  kind: 'monster';
  id: string;
  application: 'individual' | 'per-member';
  match: 'manual-exact-srd-block';
}
/** An explicit pin in a named raster; pixel coordinates are not latitude/longitude or a route. */
export interface AdventureMapRef {
  mapId: string;
  key: string;
  coords: [number, number];
  coordinateSpace: 'source-pixel';
  source: string;
  status: 'editorial-control-point';
}
/** Source scale plus an optional authored runtime geometry reference. The source raster remains external. */
export interface AdventurePlanGeometry {
  source: string;
  pdfPage: number;
  calibration: { kind: 'grid'; feetPerCell: number } | { kind: 'scale-bar'; feetMarks: number[] };
  status: 'source-scale-verified';
  runtimeMapImported: false;
  runtimeGeometry?: { id: string; status: 'editorial-area-geometry'; sourceArtworkImported: false };
}
const LINK_TARGETS: Record<string, readonly AdventureKind[]> = {
  at: ['location'], within: ['location'], on: ['location'], plan: ['plan'],
  from: ['location'], via: ['location'], to: ['location'], participant: ['npc', 'creature'],
  thread: ['thread'], 'discover-in': ['scene'], depicts: ['location'], 'after-scene': ['scene'],
  fact: ['fact'], route: ['route'], 'associated-place': ['location'], 'encountered-at': ['location'],
  contains: ['item'], carries: ['item'], 'refers-to-item': ['item'], 'requested-by': ['npc'], unlocks: ['location'],
};
export interface AdventureLink { relation: string; target: string }
export interface AdventureNode {
  id: string;
  kind: AdventureKind;
  name: string;
  summary: string;
  audience: 'dm' | 'players';
  evidence: AdventureEvidence[];
  links: AdventureLink[];
  /** Optional source names are not heuristic bindings to engine entities. */
  aliases?: string[];
  /** Cross-reference into the selected setting catalogue; does not instantiate the entity in a campaign. */
  settingEntityRef?: EntityRef;
  /** Exact, reviewed engine catalogue reference; never an instruction to instantiate it. */
  engineBinding?: AdventureEngineBinding;
  /** A reviewed, explicit map anchor. It does not install a location or reveal it to players. */
  mapRef?: AdventureMapRef;
  /** Explicit source-page scale for a plan; this is not runtime geometry. */
  planGeometry?: AdventurePlanGeometry;
  /** Page references remain explicit when a map/statblock is not yet normalized. */
  preparation?: string;
}
export interface AdventureBundle {
  format: typeof ADVENTURE_FORMAT;
  id: string;
  title: string;
  version: string;
  distribution: 'open' | 'table' | 'internal';
  setting: string;
  /** Empty for system-neutral narrative adventures; rule choices remain owned by the campaign. */
  rules: string[];
  /** Null means unknown, not the current demo campaign year. */
  campaignYear: number | null;
  scope: string;
  entry: string;
  sources: AdventureSource[];
  nodes: AdventureNode[];
}
const RANK = { open: 0, table: 1, internal: 2 } as const;
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
const id = (x: unknown): x is string => str(x) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x);
const dist = (x: unknown): x is keyof typeof RANK => x === 'open' || x === 'table' || x === 'internal';
function fail(at: string): never { throw new Error(`Приключение: ${at}`); }

/** Validate the complete graph before accepting any of it. Never resolve missing ids by name. */
export function parseAdventureBundle(value: unknown): AdventureBundle {
  if (!obj(value) || value.format !== ADVENTURE_FORMAT) fail('неподдерживаемый формат');
  if (!id(value.id) || !str(value.title) || !str(value.version) || !str(value.setting) || !str(value.scope) || !str(value.entry)) fail('нужны id, название, версия, сеттинг, выборка и точка входа');
  if (!dist(value.distribution)) fail('неизвестный режим распространения');
  if (!Array.isArray(value.rules) || !value.rules.every(id)) fail('некорректный список пакетов правил');
  if (value.campaignYear !== null && !Number.isSafeInteger(value.campaignYear)) fail('год должен быть целым или null');
  if (!Array.isArray(value.sources) || !value.sources.length || value.sources.length > 100) fail('нужны источники (не более 100)');
  const sources = new Map<string, AdventureSource>();
  for (const source of value.sources) {
    if (!obj(source) || !id(source.id) || !str(source.title) || !['book','srd','hb','setting'].includes(String(source.origin)) || !dist(source.distribution)) fail('некорректный источник');
    if (sources.has(source.id)) fail(`повтор источника ${source.id}`);
    if (RANK[value.distribution] < RANK[source.distribution]) fail(`распространение мягче источника ${source.id}`);
    if (source.sha256 !== undefined && (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256))) fail(`неверный SHA256 ${source.id}`);
    if (source.pageCount !== undefined && (!Number.isSafeInteger(source.pageCount) || Number(source.pageCount) < 1)) fail(`неверное число страниц ${source.id}`);
    if (source.origin === 'book' && (!source.sha256 || !source.pageCount)) fail(`книжному источнику нужен точный файл и число страниц: ${source.id}`);
    sources.set(source.id, source as unknown as AdventureSource);
  }
  if (!Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > 2000) fail('нужны узлы (не более 2000)');
  const nodes = new Map<string, AdventureNode>();
  for (const node of value.nodes) {
    if (!obj(node) || !id(node.id) || !ADVENTURE_KINDS.includes(node.kind as AdventureKind) || !str(node.name) || !str(node.summary)) fail('некорректный узел');
    if (nodes.has(node.id)) fail(`повтор узла ${node.id}`);
    if (node.audience !== 'dm' && node.audience !== 'players') fail(`нужна аудитория ${node.id}`);
    if (node.aliases !== undefined && (!Array.isArray(node.aliases) || !node.aliases.every(str))) fail(`неверные aliases ${node.id}`);
    if (node.settingEntityRef !== undefined) {
      const settingRef = typeof node.settingEntityRef === 'string' ? parseRef(node.settingEntityRef) : null;
      const expectedKind = node.kind === 'location' ? 'place' : node.kind === 'npc' ? 'person' : undefined;
      if (!settingRef || !expectedKind || settingRef.kind !== expectedKind) fail(`неверная ссылка на каталог сеттинга ${node.id}`);
    }
    if (node.engineBinding !== undefined) {
      const ref = node.engineBinding;
      if (node.kind !== 'creature' || !obj(ref) || !id(ref.packageId) || !str(ref.packageVersion) || ref.kind !== 'monster' || !id(ref.id) || !['individual','per-member'].includes(String(ref.application)) || ref.match !== 'manual-exact-srd-block') fail(`некорректная ссылка на каталог движка ${node.id}`);
      if (!Array.isArray(value.rules) || !value.rules.includes(ref.packageId)) fail(`ссылка на неуказанный пакет правил ${node.id}`);
    }
    if (node.mapRef !== undefined) {
      const ref = node.mapRef;
      if (node.kind !== 'location' || !obj(ref) || !id(ref.mapId) || !str(ref.key) || !Array.isArray(ref.coords) || ref.coords.length !== 2 || !ref.coords.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) || ref.coordinateSpace !== 'source-pixel' || !str(ref.source) || ref.status !== 'editorial-control-point') fail(`некорректная точка карты ${node.id}`);
    }
    if (node.planGeometry !== undefined) {
      const ref = node.planGeometry;
      const source = obj(ref) && str(ref.source) ? sources.get(ref.source) : undefined;
      const calibration = obj(ref) && obj(ref.calibration) ? ref.calibration : undefined;
      const referencedPage = obj(ref) && Array.isArray(node.evidence) && node.evidence.some(e => obj(e) && e.source === ref.source && Array.isArray(e.pages) && e.pages.includes(ref.pdfPage));
      if (node.kind !== 'plan' || !obj(ref) || !source || source.origin !== 'book' || !Number.isSafeInteger(ref.pdfPage) || Number(ref.pdfPage) < 1 || !referencedPage || ref.status !== 'source-scale-verified' || ref.runtimeMapImported !== false || !calibration) fail(`некорректная калибровка плана ${node.id}`);
      if (calibration.kind === 'grid') {
        if (typeof calibration.feetPerCell !== 'number' || !Number.isFinite(calibration.feetPerCell) || calibration.feetPerCell <= 0) fail(`неверный масштаб сетки ${node.id}`);
      } else if (calibration.kind === 'scale-bar') {
        const marks = calibration.feetMarks;
        if (!Array.isArray(marks) || marks.length < 2 || marks[0] !== 0 || !marks.every((v, i) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && (i === 0 || v > marks[i - 1]))) fail(`неверная шкала плана ${node.id}`);
      } else fail(`неизвестная калибровка плана ${node.id}`);
      if (ref.runtimeGeometry !== undefined && (!obj(ref.runtimeGeometry) || !id(ref.runtimeGeometry.id) || ref.runtimeGeometry.status !== 'editorial-area-geometry' || ref.runtimeGeometry.sourceArtworkImported !== false)) fail(`некорректная runtime-геометрия плана ${node.id}`);
    }
    if (node.preparation !== undefined && !str(node.preparation)) fail(`пустой статус подготовки ${node.id}`);
    if (!Array.isArray(node.evidence) || !node.evidence.length) fail(`нет источника ${node.id}`);
    for (const e of node.evidence) {
      if (!obj(e) || !str(e.source) || !sources.has(e.source) || !Array.isArray(e.pages)) fail(`неверный источник ${node.id}`);
      const source = sources.get(e.source)!;
      if (source.origin === 'book' && !e.pages.length) fail(`нет страницы ${node.id}`);
      if (new Set(e.pages).size !== e.pages.length || !e.pages.every(p => Number.isSafeInteger(p) && p >= 1 && (!source.pageCount || p <= source.pageCount))) fail(`страница вне источника ${node.id}`);
    }
    if (!Array.isArray(node.links) || !node.links.every(l => obj(l) && str(l.relation) && str(l.target))) fail(`некорректные связи ${node.id}`);
    nodes.set(node.id, node as unknown as AdventureNode);
  }
  for (const node of nodes.values()) for (const link of node.links) {
    if (!nodes.has(link.target)) fail(`оборванная связь ${node.id} → ${link.target}`);
    if (!Object.hasOwn(LINK_TARGETS, link.relation) || !LINK_TARGETS[link.relation].includes(nodes.get(link.target)!.kind)) fail(`несовместимая связь ${node.id}: ${link.relation} → ${link.target}`);
    if (link.target === node.id) fail(`ссылка на себя ${node.id}`);
  }
  if (nodes.get(value.entry)?.kind !== 'scene') fail('точкой входа должна быть существующая сцена');
  // Return an independent JSON graph, never retain a mutable caller-owned object.
  return structuredClone(value) as unknown as AdventureBundle;
}

/** Player delivery is an allowlist, with a fresh sanitized shape and no source graph.
 * A public name/location never reveals its secrets, incoming links or evidence. */
export function adventureForPlayers(bundle: AdventureBundle, revealed: ReadonlySet<string> = new Set()) {
  const visible = bundle.nodes.filter(n => n.audience === 'players' || revealed.has(n.id));
  const ids = new Set(visible.map(n => n.id));
  return { id: bundle.id, title: bundle.title, nodes: visible.map(n => ({
    id: n.id, kind: n.kind, name: n.name, summary: n.summary,
    links: n.links.filter(l => ids.has(l.target)).map(l => ({ relation: l.relation, target: l.target })),
  })) };
}

/** Stable campaign fact key. Visibility remains owned by the campaign journal, not this content package. */
export function adventureFactRecordId(adventureId: string, nodeId: string): string {
  return `adventure-${adventureId}-${nodeId}`;
}

export interface AdventurePlayerHandout {
  id: string;
  name: string;
  summary: string;
  entries: readonly { id: string; name: string; summary: string }[];
}

/** Player handouts contain only linked facts that the GM explicitly revealed. */
export function adventureHandoutsForPlayers(bundle: AdventureBundle, revealed: ReadonlySet<string> = new Set()): AdventurePlayerHandout[] {
  const byId = new Map(bundle.nodes.map(node => [node.id, node]));
  return bundle.nodes.filter(node => node.kind === 'handout' && node.audience === 'players').map(handout => ({
    id: handout.id,
    name: handout.name,
    summary: handout.summary,
    entries: handout.links.flatMap(link => {
      if (link.relation !== 'fact' || !revealed.has(link.target)) return [];
      const fact = byId.get(link.target);
      return fact?.kind === 'fact' ? [{ id: fact.id, name: fact.name, summary: fact.summary }] : [];
    }),
  }));
}
