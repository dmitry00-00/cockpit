// Резолвер сущностей (ROADMAP 0.2): ссылка «вид:id» → EntityView. Справочные виды живут в пакетах, каждый пакет
// грузится через import() один раз. Данные, которые лист читает синхронно (компендиум, заклинания, монстры SRD),
// ещё едут в основном куске; магические предметы и библиотеки монстров — уже отдельно (0.5). Виды состояния читаются
// из переданного State.
import { EPOCH_YEAR, harptos } from '../campaign/calendar';
import { eraOf, type Era } from '../campaign/era';
import type { State } from '../engine';
import { loadMonsterLibraries } from '../rules/srd/monsters';
import type { Pack } from './pack';
import { REFERENCE_KINDS, isStateKind, parseRef, ref, type EntityKind, type EntityRef, type ReferenceKind } from './ref';
import { stateIds, stateView } from './state';
import type { EntityView } from './view';

export * from './ref';
export {
  missingView, type EntityDiagram, type EntityFact, type EntityGroup, type EntityLink, type EntitySection, type EntitySource, type EntityView, type SourceKind,
} from './view';

type PackId = 'rules' | 'compendium' | 'cosmos' | 'places' | 'world' | 'kingdoms';

const PACK_OF: Readonly<Record<ReferenceKind, PackId>> = {
  condition: 'rules', ability: 'rules', skill: 'rules', resource: 'rules', spell: 'rules', item: 'rules', monster: 'rules',
  race: 'compendium', subrace: 'compendium', trait: 'compendium', class: 'compendium', subclass: 'compendium',
  feature: 'compendium', feat: 'compendium', background: 'compendium',
  plane: 'cosmos', body: 'cosmos', sphere: 'cosmos', deity: 'cosmos', pantheon: 'cosmos',
  place: 'places',
  person: 'world', organization: 'world',
  kingdom: 'kingdoms',
};

const LOADERS: Readonly<Record<PackId, () => Promise<Pack>>> = {
  rules: () => loadMonsterLibraries().then(() => import('./packs/rules')).then(m => m.PACK),
  compendium: () => import('./packs/compendium').then(m => m.PACK),
  cosmos: () => import('./packs/cosmos').then(m => m.PACK),
  places: () => import('./packs/places').then(m => m.loadPack()),
  world: () => import('./packs/world').then(m => m.loadPack()),
  kingdoms: () => import('./packs/kingdoms').then(m => m.loadPack()),
};

const loaded = new Map<PackId, Pack>();
const loading = new Map<PackId, Promise<Pack>>();

function loadPack(id: PackId): Promise<Pack> {
  let p = loading.get(id);
  if (!p) {
    p = LOADERS[id]().then(pack => { loaded.set(id, pack); return pack; });
    loading.set(id, p);
  }
  return p;
}

/** Загрузить пакет вида; повторный вызов — тот же промис. */
export const loadKind = (kind: ReferenceKind): Promise<void> => loadPack(PACK_OF[kind]).then(() => undefined);

/** Все пакеты — для поиска по всему и для тестов. */
export const loadAll = (): Promise<void> => Promise.all((Object.keys(LOADERS) as PackId[]).map(loadPack)).then(() => undefined);

/** Пакет вида уже загружен: resolve ответит сразу. */
export const isReady = (kind: EntityKind): boolean => isStateKind(kind) || loaded.has(PACK_OF[kind]);

export interface ResolveContext {
  /** Нужен для видов состояния: actor, location, faction, thread; его время мира даёт эпоху. */
  state?: State;
  /** Эпоха без состояния; по умолчанию — из времени State, без него — 5e. */
  era?: Era;
  /** Год без состояния (DR): жители места — живые в этот год; по умолчанию — из времени State, без него — 1492. */
  year?: number;
}

const yearOfContext = (ctx: ResolveContext): number => ctx.year ?? (ctx.state ? harptos(ctx.state.time.sec).year : EPOCH_YEAR);
const eraOfContext = (ctx: ResolveContext): Era => ctx.era ?? eraOf(yearOfContext(ctx));

/**
 * Представление по ссылке. undefined — записи нет или пакет ещё не загружен (isReady различает); карточка в первом
 * случае показывает missingView, во втором — ждёт loadKind.
 */
export function resolve(value: EntityRef | string, ctx: ResolveContext = {}): EntityView | undefined {
  const p = parseRef(value);
  if (!p) return undefined;
  if (isStateKind(p.kind)) return ctx.state ? stateView(ctx.state, p.kind, p.id) : undefined;
  return loaded.get(PACK_OF[p.kind])?.resolve(p.kind, p.id, eraOfContext(ctx), yearOfContext(ctx));
}

/** Все ссылки вида из загруженного пакета (или из State для видов состояния). */
export function refsOf(kind: EntityKind, ctx: ResolveContext = {}): EntityRef[] {
  if (isStateKind(kind)) return ctx.state ? stateIds(ctx.state, kind).map(id => ref(kind, id)) : [];
  return (loaded.get(PACK_OF[kind])?.ids(kind) ?? []).map(id => ref(kind, id));
}

export { REFERENCE_KINDS };
