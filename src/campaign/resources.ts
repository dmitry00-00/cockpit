// Ресурсы персонажа как проекция листа (решение владельца 21.09.2026): максимум — из таблицы класса в
// компендиуме (колонки ячеек, ярости, ци, единиц чародейства, ячеек договора на уровне листа) и из формул умений
// SRD (второе дыхание, божественный канал, наложение рук… — src/rules/srd/resources.ts); потраченное — из
// состояния (RESOURCE_SPENT / RESTORED). Состояние максимум не хранит: поднялся уровень — вырос и максимум.
// Чистые функции; что вернёт короткий отдых — тоже отсюда, форма отдыха показывает список, мастер решает.
import type { Actor } from '../engine/state';
import type { RestKind, RestResource } from '../engine/events';
import { ABILITY_IDS, type AbilityId } from '../rules/srd/abilities';
import { RESOURCES, featureResources, restoreOn, type Resource, type ResourceId } from '../rules/srd/resources';
import { classById, type ClassLevel } from '../rules/compendium';
import { abilityMod, srdClassOf } from './derive';

export interface ResourcePool extends Resource {
  max: number;
  spent: number;
  available: number;
  /** Отдых, который вернёт ресурс на этом уровне (вдохновение барда с 5-го — короткий). */
  restoresOn: RestKind;
}

/** Колонки листов классов, которые тратятся; остальные (известные заклинания, урон ярости, скрытая атака) — справочные. */
const TABLE_COLUMNS: Readonly<Record<string, ResourceId>> = {
  'Ярость': 'rage',
  'Очки ЦИ': 'ki',
  'Единицы чародейства': 'sorcery',
  'Ячейки заклинаний': 'pact-slots',
};

/** «3» → 3, «2к6» и «неогр» — не число: ресурс без счёта не показываем. */
function countOf(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (!/^\d{1,3}$/.test(t)) return undefined;
  return Number(t);
}

/** Ресурсы строки таблицы класса: ячейки по кругам («1»…«9») и именованные колонки. Круг ячеек договора — из «Уровень ячеек». */
export function tableResources(level: ClassLevel): { id: ResourceId; max: number; slotLevel?: number }[] {
  const out: { id: ResourceId; max: number; slotLevel?: number }[] = [];
  for (let n = 1; n <= 9; n++) {
    const max = countOf(level.resources[String(n)]);
    if (max !== undefined && max > 0) out.push({ id: `slot-${n}` as ResourceId, max });
  }
  for (const [column, id] of Object.entries(TABLE_COLUMNS)) {
    const max = countOf(level.resources[column]);
    if (max === undefined || max === 0) continue;
    if (id === 'pact-slots') out.push({ id, max, slotLevel: countOf(level.resources['Уровень ячеек']) });
    else out.push({ id, max });
  }
  return out;
}

/** Все ресурсы актёра с максимумом и остатком; без листа или класса — пусто. Порядок: ячейки по кругам, затем таблица, затем умения. */
export function resourcePoolsOf(actor: Actor): ResourcePool[] {
  const sheet = actor.sheet;
  if (!sheet) return [];
  const cls = classById(sheet.classId);
  if (!cls) return [];
  const row = cls.levels.find(l => l.level === sheet.level);
  const fromTable = row ? tableResources(row) : [];
  let fromFeatures: { id: ResourceId; max: number }[] = [];
  try {
    const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(sheet.abilities[ab])])) as Record<AbilityId, number>;
    fromFeatures = featureResources(srdClassOf(cls).id, sheet.level, mods);
  } catch {
    fromFeatures = []; // класс вне SRD (книга): формул умений нет, только таблица
  }
  const spentMap = (actor.resourcesSpent ?? {}) as Partial<Record<ResourceId, number>>;
  const seen = new Set<ResourceId>();
  const pools: ResourcePool[] = [];
  for (const r of [...fromTable, ...fromFeatures]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const def = RESOURCES[r.id];
    const spent = Math.min(r.max, spentMap[r.id] ?? 0);
    const slotLevel = 'slotLevel' in r && typeof r.slotLevel === 'number' ? r.slotLevel : def.slotLevel;
    pools.push({ ...def, ...(slotLevel !== undefined ? { slotLevel } : {}), max: r.max, spent, available: r.max - spent, restoresOn: restoreOn(r.id, sheet.level) });
  }
  return pools;
}

/** Подпись ресурса с кругом ячеек договора: «Ячейки договора · 3-й круг». */
export function poolLabel(pool: ResourcePool): string {
  return pool.id === 'pact-slots' && pool.slotLevel ? `${pool.label} · ${pool.slotLevel}-го круга` : pool.label;
}

/** Что короткий отдых вернёт актёрам по правилу SRD — только потраченное; долгий возвращает всё сам, список пуст. */
export function restResourcesOf(actors: readonly Actor[], kind: RestKind): RestResource[] {
  if (kind === 'long') return [];
  return actors.flatMap(a => resourcePoolsOf(a)
    .filter(p => p.restoresOn === 'short' && p.spent > 0)
    .map(p => ({ actorId: a.id, resourceId: p.id })));
}
