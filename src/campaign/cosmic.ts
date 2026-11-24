// C6: authored cosmic/planetary processes. Canon catalogs identify the target and its citations;
// event timing and consequences are entered by the DM. Orbital or divine mechanics are never inferred.
import type { CelestialBody, StarSystem } from '../cosmos/realmspace';
import type { GreatWheel, Plane, WorldTree } from '../cosmos/planes';
import { ref, type EntityRef } from '../entities/ref';
import type { Fact, Location, Process, State, WorldDelta, WorldPatch } from '../engine/state';
import { SECONDS_PER_DAY } from '../engine/state';
import type { ScaleLevel } from '../engine/events';
import { LOCATION } from './world';
import type { ProcessKind, TickContext, TickResult } from './processes';

const DAY = SECONDS_PER_DAY;
export const COSMIC_RULES = {
  version: 'dm-cockpit-cosmic/1',
  source: 'Campaign rule: DM-authored event, duration and consequence; target identity and references from the selected catalog',
  minDays: 1,
  maxDays: 36_500,
  maxTextLength: 500,
} as const;

export type CosmicEventKind = 'blood-war' | 'divine-conflict' | 'canon-cataclysm' | 'authored';
export const COSMIC_EVENT_LABEL: Readonly<Record<CosmicEventKind, string>> = {
  'blood-war': 'Война Крови',
  'divine-conflict': 'Конфликт богов',
  'canon-cataclysm': 'Катаклизм канона',
  authored: 'Сценарий мастера',
};

export interface CosmicTargetOption {
  id: string;
  name: string;
  label: string;
  type: string;
  scale: Extract<ScaleLevel, 'cosmology' | 'plane' | 'system' | 'planet'>;
  locationId: string;
  parentId?: string;
  ref?: EntityRef;
  refs: readonly string[];
}

export interface CosmicCatalogs {
  realmspace?: StarSystem;
  greatWheel?: GreatWheel;
  worldTree?: WorldTree;
}

export interface CosmicRequestInput {
  targetId: string;
  eventKind: CosmicEventKind;
  text: string;
  durationDays: number;
  playerVisible: boolean;
  timeEventId: string;
}

interface CosmicData {
  version: 1; kind: 'cosmic'; ruleVersion: string;
  targetId: string; targetName: string; targetType: string; eventKind: CosmicEventKind;
  text: string; durationDays: number; playerVisible: boolean; sourceRefs: readonly string[]; factId: string; locationId: string;
  /** v1 saved processes created by the first C6 draft. */
  bodyId?: string; bodyName?: string; bodyType?: string;
}

export interface CosmicInheritedField {
  processId: string;
  targetId: string;
  targetName: string;
  targetScale: CosmicTargetOption['scale'];
  eventKind: CosmicEventKind;
  label: string;
  text: string;
  sourceLocationId: string;
  distance: number;
  sourceRefs: readonly string[];
  ruleVersion: string;
}

const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'target';

function bodyTarget(body: CelestialBody, bodies: readonly CelestialBody[]): CosmicTargetOption {
  const locationId = body.id === 'toril' ? LOCATION.toril : `loc-cosmic-body-${slug(body.id)}`;
  const parentBody = bodies.find(candidate => candidate.name.toLowerCase() === body.parent?.replace(/^the /i, '').toLowerCase());
  const parentId = parentBody
    ? (parentBody.id === 'toril' ? LOCATION.toril : `loc-cosmic-body-${slug(parentBody.id)}`)
    : LOCATION.realmspace;
  return {
    id: `body:${body.id}`, name: body.name, label: `${body.name} · ${body.type}`, type: body.type,
    scale: 'planet', locationId, parentId, ref: ref('body', body.id), refs: [...body.refs],
  };
}

function planeTarget(plane: Plane, model: 'great-wheel' | 'world-tree'): CosmicTargetOption {
  const modelLabel = model === 'great-wheel' ? 'Великое Колесо' : 'Великое Древо';
  const material = plane.id === 'material' && model === 'great-wheel';
  return {
    id: `plane:${model}:${plane.id}`, name: plane.name, label: `${plane.name} · ${modelLabel}`,
    type: model === 'great-wheel' ? 'План · Великое Колесо' : 'План · Великое Древо',
    scale: 'plane', locationId: material ? LOCATION.material : `loc-cosmic-plane-${model}-${slug(plane.id)}`,
    parentId: LOCATION.greatWheel, ref: ref('plane', plane.id), refs: [...plane.refs],
  };
}

/** Catalog names are offered as targets; campaign effects are authored separately by the DM. */
export function cosmicTargets(catalogs: CosmicCatalogs): readonly CosmicTargetOption[] {
  const options: CosmicTargetOption[] = [];
  if (catalogs.greatWheel) {
    options.push({
      id: 'cosmology:great-wheel', name: 'Великое Колесо', label: 'Великое Колесо · космология', type: 'Космология',
      scale: 'cosmology', locationId: LOCATION.greatWheel, refs: [],
    });
    options.push(...catalogs.greatWheel.planes.map(plane => planeTarget(plane, 'great-wheel')));
  }
  if (catalogs.worldTree) options.push(...catalogs.worldTree.planes.map(plane => planeTarget(plane, 'world-tree')));
  if (catalogs.realmspace) {
    options.push({
      id: `sphere:${catalogs.realmspace.sphere.id}`, name: catalogs.realmspace.sphere.name,
      label: `${catalogs.realmspace.sphere.name} · хрустальная сфера`, type: 'Звёздная система',
      scale: 'system', locationId: LOCATION.realmspace, parentId: LOCATION.material,
      ref: ref('sphere', catalogs.realmspace.sphere.id), refs: [...catalogs.realmspace.sphere.refs],
    });
    options.push(...catalogs.realmspace.bodies.map(body => bodyTarget(body, catalogs.realmspace!.bodies)));
  }
  return options.sort((a, b) => a.scale.localeCompare(b.scale) || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}

/** Backward-compatible body-only helper used by early C6 drafts. */
export function cosmicBodies(bodies: readonly CelestialBody[]): readonly CosmicTargetOption[] {
  return bodies.map(body => bodyTarget(body, bodies))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}

const eventLabel = (kind: CosmicEventKind): string => COSMIC_EVENT_LABEL[kind] ?? COSMIC_EVENT_LABEL.authored;
const processId = (targetId: string, sec: number, eventKind: CosmicEventKind, text: string) => {
  let hash = 2166136261;
  const key = `${eventKind}\0${text}`;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return `proc-cosmic-${slug(targetId)}-${sec}-${(hash >>> 0).toString(36)}`;
};

function dataOf(process: Process): CosmicData | null {
  const data = process.data as (CosmicData & Record<string, unknown>) | undefined;
  if (data?.kind !== 'cosmic' || data.version !== 1 || typeof data.text !== 'string') return null;
  // Preserve previously saved C6 draft processes, whose target fields were named body*.
  if (data.ruleVersion !== COSMIC_RULES.version || !(data.targetName ?? data.bodyName)) return null;
  return {
    ...data,
    targetId: data.targetId ?? data.bodyId ?? 'unknown',
    targetName: data.targetName ?? data.bodyName!,
    targetType: data.targetType ?? data.bodyType ?? 'небесное тело',
    eventKind: data.eventKind ?? 'authored',
    sourceRefs: data.sourceRefs ?? [],
  };
}

/**
 * GM-only inherited context for a place and its parents. One process on a plane or planet is read by descendants;
 * no per-city patches or mechanical modifiers are inferred. Do not include this projection in player DTOs.
 */
export function cosmicFieldsAt(state: State, locationId: string): readonly CosmicInheritedField[] {
  const distanceByLocation = new Map<string, number>();
  let location: Location | undefined = state.world.locations[locationId];
  while (location && !distanceByLocation.has(location.id)) {
    distanceByLocation.set(location.id, distanceByLocation.size);
    location = location.parentId ? state.world.locations[location.parentId] : undefined;
  }
  return Object.values(state.world.processes ?? {}).flatMap(process => {
    if (process.kind !== 'cosmic' || process.ended) return [];
    const data = dataOf(process);
    if (!data) return [];
    const sourceLocationId = process.at ?? data.locationId;
    const distance = distanceByLocation.get(sourceLocationId);
    if (distance === undefined) return [];
    return [{
      processId: process.id, targetId: data.targetId, targetName: data.targetName,
      targetScale: process.scale as CosmicTargetOption['scale'], eventKind: data.eventKind,
      label: eventLabel(data.eventKind), text: data.text, sourceLocationId, distance,
      sourceRefs: [...data.sourceRefs], ruleVersion: data.ruleVersion,
    }];
  }).sort((a, b) => a.distance - b.distance || a.processId.localeCompare(b.processId));
}

/** Creates a private, pending process. No astronomical or divine consequence is inferred from catalog data. */
export function cosmicProposal(state: State, targets: readonly CosmicTargetOption[], input: CosmicRequestInput): WorldDelta {
  const target = targets.find(candidate => candidate.id === input.targetId);
  if (!target) throw new Error('цель отсутствует в загруженных каталогах космологии');
  if (!Object.hasOwn(COSMIC_EVENT_LABEL, input.eventKind)) throw new Error('неизвестный тип космического события');
  if (!input.timeEventId.trim()) throw new Error('укажите причину начала космического процесса');
  const text = input.text.trim();
  if (!text || text.length > COSMIC_RULES.maxTextLength) throw new Error(`описание события: от 1 до ${COSMIC_RULES.maxTextLength} знаков`);
  if (!Number.isSafeInteger(input.durationDays) || input.durationDays < COSMIC_RULES.minDays || input.durationDays > COSMIC_RULES.maxDays) {
    throw new Error(`длительность — целое число дней от ${COSMIC_RULES.minDays} до ${COSMIC_RULES.maxDays}`);
  }
  const id = processId(target.id, state.time.sec, input.eventKind, text);
  const name = `${eventLabel(input.eventKind)} · ${target.name} · ${text.slice(0, 80)}`;
  if (state.world.processes?.[id] && !state.world.processes[id].ended) throw new Error('этот космический процесс уже идёт');
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.subject === `Космический процесс · ${name}`)) {
    throw new Error('этот космический процесс уже ожидает решения');
  }
  const location = state.world.locations[target.locationId];
  const createLocation: WorldPatch | undefined = location ? undefined : target.parentId && state.world.locations[target.parentId]
    ? { kind: 'newLocation', location: { id: target.locationId, name: target.name, scale: target.scale, parentId: target.parentId, ...(target.ref ? { ref: target.ref } : {}) } }
    : undefined;
  if (!location && !createLocation) throw new Error(`в кампании отсутствует родительская точка для цели ${target.name}`);
  if (location && location.scale !== target.scale) throw new Error(`масштаб кампанийной цели ${target.name} не совпадает с каталогом`);

  const process: Process = {
    id, kind: 'cosmic', name, scale: target.scale, stage: 'ongoing', parties: [target.locationId], at: target.locationId,
    startedSec: state.time.sec, nextSec: state.time.sec + input.durationDays * DAY,
    vars: { elapsedDays: 0, durationDays: input.durationDays },
    data: {
      version: 1, kind: 'cosmic', ruleVersion: COSMIC_RULES.version,
      targetId: target.id, targetName: target.name, targetType: target.type, eventKind: input.eventKind,
      text, durationDays: input.durationDays, playerVisible: input.playerVisible, sourceRefs: [...target.refs],
      factId: `fact-${id}`, locationId: target.locationId,
    } satisfies CosmicData,
    causeId: input.timeEventId,
  };
  const patches: WorldPatch[] = [...(createLocation ? [createLocation] : []), { kind: 'process', process }];
  return {
    id: `sim-${input.timeEventId}-${id}`, scale: target.scale, subject: `Космический процесс · ${name}`,
    was: 'событие не отмечено', now: `${eventLabel(input.eventKind)} · ${target.label} · срок ${input.durationDays} дн.; последствие введено мастером`,
    cause: `правило стола: сценарий, срок и последствие заданы мастером; каталог даёт только цель и ссылки (${COSMIC_RULES.version})`,
    causeId: input.timeEventId, status: 'pending', patch: patches.length === 1 ? patches[0] : { kind: 'batch', patches },
  };
}

function tick(process: Process, _ctx: TickContext): TickResult {
  const data = dataOf(process);
  if (!data) return { process: { ...process, stage: 'invalid', ended: true }, line: 'неподдерживаемая версия космического процесса' };
  const fact: Fact = {
    id: data.factId, text: `${eventLabel(data.eventKind)} · ${data.targetName}: ${data.text}`,
    visibility: data.playerVisible ? 'players' : 'dm', scale: process.scale, subjectId: data.locationId,
  };
  return {
    process: { ...process, stage: 'completed', ended: true, vars: { ...process.vars, elapsedDays: data.durationDays } },
    patches: [{ kind: 'newFact', fact }],
    line: `сценарий «${eventLabel(data.eventKind)}» у ${data.targetName} завершён; текст мастера предложен как факт кампании`,
  };
}

export const cosmicKind: ProcessKind = {
  kind: 'cosmic', label: 'Космический процесс',
  stages: { ongoing: 'идёт', observing: 'наблюдение', completed: 'завершён', invalid: 'ошибка данных' }, tick,
};
