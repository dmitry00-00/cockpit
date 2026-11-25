// Резолвер сущностей (ROADMAP 0.2): ссылка «вид:id» → EntityView. Справочные виды живут в пакетах и грузятся через
// import(); пакеты, зависящие от сеттинга, кэшируются отдельно. Данные, которые лист читает синхронно (компендиум,
// заклинания, монстры SRD),
// ещё едут в основном куске; магические предметы и библиотеки монстров — уже отдельно (0.5). Виды состояния читаются
// из переданного State.
import { EPOCH_YEAR, calendarAdapterForSetting } from '../campaign/calendar';
import { eraOfSetting, type Era } from '../campaign/era';
import type { State } from '../engine';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import { loadMonsterLibraries } from '../rules/srd/monsters';
import type { Pack } from './pack';
import { REFERENCE_KINDS, isStateKind, parseRef, ref, type EntityKind, type EntityRef, type ReferenceKind } from './ref';
import { stateIds, stateView } from './state';
import type { EntityView } from './view';
import { loadPackageEntityViews } from './packageViews';

export * from './ref';
export * from './subjectContract';
export {
  missingView, type EntityDiagram, type EntityFact, type EntityGroup, type EntityLink, type EntitySection, type EntitySource, type EntityView, type SourceKind,
} from './view';

type PackId = 'rules' | 'compendium' | 'cosmos' | 'places' | 'world' | 'kingdoms';

/** These packs currently contain Forgotten Realms material and must be isolated by setting. */
const SETTING_PACKS: ReadonlySet<PackId> = new Set(['cosmos', 'places', 'world', 'kingdoms']);
const FR_ENTITY_SETTING = 'fr';

const PACK_OF: Readonly<Record<ReferenceKind, PackId>> = {
  condition: 'rules', ability: 'rules', skill: 'rules', resource: 'rules', spell: 'rules', item: 'rules', monster: 'rules',
  race: 'compendium', subrace: 'compendium', trait: 'compendium', class: 'compendium', subclass: 'compendium',
  feature: 'compendium', feat: 'compendium', background: 'compendium',
  plane: 'cosmos', body: 'cosmos', sphere: 'cosmos', deity: 'cosmos', pantheon: 'cosmos',
  place: 'places',
  person: 'world', organization: 'world',
  kingdom: 'kingdoms',
  event: 'world',
};

const LOADERS: Readonly<Record<PackId, () => Promise<Pack>>> = {
  rules: () => loadMonsterLibraries().then(() => import('./packs/rules')).then(m => m.PACK),
  compendium: () => import('./packs/compendium').then(m => m.PACK),
  cosmos: () => import('./packs/cosmos').then(m => m.PACK),
  places: () => import('./packs/places').then(m => m.loadPack()),
  world: () => import('./packs/world').then(m => m.loadPack()),
  kingdoms: () => import('./packs/kingdoms').then(m => m.loadPack()),
};

const loaded = new Map<string, Pack>();
const loading = new Map<string, Promise<Pack>>();

export interface ResolveContext {
  /** Нужен для видов состояния: actor, location, faction, thread; его время мира даёт эпоху. */
  state?: State;
  /** Эпоха без состояния; по умолчанию — из времени State, без него — 5e. */
  era?: Era;
  /** Год без состояния (DR): жители места — живые в этот год; по умолчанию — из времени State, без него — 1492. */
  year?: number;
  /** Выбранный пакет сеттинга. Переопределяет пакет из state. */
  settingPackageId?: string;
}

const settingPackageOfContext = (ctx: ResolveContext): string =>
  ctx.settingPackageId ?? ctx.state?.settingPackageId ?? DEFAULT_SETTING_PACKAGE;

const packCacheKey = (id: PackId, settingPackageId: string): string =>
  SETTING_PACKS.has(id) ? `${settingPackageId}:${id}` : id;

const packCacheKeyForKind = (kind: ReferenceKind, settingPackageId: string): string => {
  const packId = PACK_OF[kind];
  return SETTING_PACKS.has(packId) && settingPackageId !== FR_ENTITY_SETTING
    ? `${settingPackageId}:entity:${kind}`
    : packCacheKey(packId, settingPackageId);
};

function loadPack(id: PackId, settingPackageId = DEFAULT_SETTING_PACKAGE): Promise<Pack> {
  const key = packCacheKey(id, settingPackageId);
  let p = loading.get(key);
  if (!p) {
    const load = SETTING_PACKS.has(id) && settingPackageId !== FR_ENTITY_SETTING
      ? () => loadPackageEntityViews(settingPackageId)
      : LOADERS[id];
    const request = load().then(pack => { loaded.set(key, pack); return pack; });
    loading.set(key, request);
    // A transient failure must not poison this key with a permanently rejected promise.
    void request.catch(() => { if (loading.get(key) === request) loading.delete(key); });
    p = request;
  }
  return p;
}

/** Загрузить пакет вида; повторный вызов — тот же промис. */
export const loadKind = (kind: ReferenceKind, ctx: ResolveContext = {}): Promise<void> =>
  (() => {
    const settingPackageId = settingPackageOfContext(ctx);
    const packId = PACK_OF[kind];
    if (!SETTING_PACKS.has(packId) || settingPackageId === FR_ENTITY_SETTING) return loadPack(packId, settingPackageId).then(() => undefined);
    const key = packCacheKeyForKind(kind, settingPackageId);
    let attempt = loading.get(key);
    if (!attempt) {
      const request = loadPackageEntityViews(settingPackageId, [kind]).then(pack => { loaded.set(key, pack); return pack; });
      loading.set(key, request);
      void request.catch(() => { if (loading.get(key) === request) loading.delete(key); });
      attempt = request;
    }
    return attempt.then(() => undefined);
  })();

/** Все пакеты — для поиска по всему и для тестов. */
export const loadAll = (ctx: ResolveContext = {}): Promise<void> =>
  Promise.all(REFERENCE_KINDS.map(kind => loadKind(kind, ctx))).then(() => undefined);

/** Пакет вида уже загружен: resolve ответит сразу. */
export const isReady = (kind: EntityKind, ctx: ResolveContext = {}): boolean =>
  isStateKind(kind) || loaded.has(packCacheKeyForKind(kind, settingPackageOfContext(ctx)));

const yearOfContext = (ctx: ResolveContext): number => {
  if (ctx.year !== undefined) return ctx.year;
  if (!ctx.state) return EPOCH_YEAR;
  return calendarAdapterForSetting(settingPackageOfContext(ctx)).yearAt(ctx.state.time.sec) ?? EPOCH_YEAR;
};
const eraOfContext = (ctx: ResolveContext): Era => {
  if (ctx.era) return ctx.era;
  const year = ctx.year ?? (ctx.state ? calendarAdapterForSetting(settingPackageOfContext(ctx)).yearAt(ctx.state.time.sec) : null);
  return eraOfSetting(year, settingPackageOfContext(ctx));
};

/**
 * Представление по ссылке. undefined — записи нет или пакет ещё не загружен (isReady различает); карточка в первом
 * случае показывает missingView, во втором — ждёт loadKind.
 */
export function resolve(value: EntityRef | string, ctx: ResolveContext = {}): EntityView | undefined {
  const p = parseRef(value);
  if (!p) return undefined;
  if (isStateKind(p.kind)) return ctx.state ? stateView(ctx.state, p.kind, p.id) : undefined;
  return loaded.get(packCacheKeyForKind(p.kind, settingPackageOfContext(ctx)))?.resolve(p.kind, p.id, eraOfContext(ctx), yearOfContext(ctx));
}

/** Все ссылки вида из загруженного пакета (или из State для видов состояния). */
export function refsOf(kind: EntityKind, ctx: ResolveContext = {}): EntityRef[] {
  if (isStateKind(kind)) return ctx.state ? stateIds(ctx.state, kind).map(id => ref(kind, id)) : [];
  return (loaded.get(packCacheKeyForKind(kind, settingPackageOfContext(ctx)))?.ids(kind) ?? []).map(id => ref(kind, id));
}

export { REFERENCE_KINDS };
export * from './subjectAdapters';
export * from './subjectContract';
