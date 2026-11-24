// Держава-держава (SIMULATION.md С4): тактируемая модель войны, которая только предлагает изменения.
// Численные эффекты — явно помеченные правила стола из research/world-models.md §4.2, не правило D&D.
// Начальная сила может получить source-backed подсказку; мастер подтверждает значение. L8-кандидат — только явно выбранная опора одного предложения, не принятый факт мира.
import type { State, Process, TerritoryController, WorldDelta, WorldPatch } from '../engine/state';
import { TEMPO_SECONDS } from '../engine/events';
import { harptos, MONTHS } from './calendar';
import { type ProcessKind, type TickContext, type TickResult, TICK_SEC } from './processes';
import { placeLocation } from './worldGraph';
import type { WarFrontPlan } from './warFront';
import type { WarStrengthCandidate, WarStrengthEvidence } from './l8Military';

const TEN_DAYS = TEMPO_SECONDS.tenday;

export const WAR_RULES = {
  version: 'dm-cockpit-war/1',
  ruleSource: 'research/world-models.md §4.2 (table rules; PF1 Mass Combat inspiration)',
  maxStrength: 10,
  maxDetermination: 10,
  mobilizationTicks: 3,
  mobilizationStrength: 1,
  battleChancePercent: 15,
  battleEncounterThreshold: 18, // 3 results on d20 = 15%; >=17 would be 20%.
  campaignMonths: [3, 10] as const, // Ches–Marpenoth
  battleTarget: 11,
  scoreForVictory: 10,
  scoreForRout: 25,
  routMargin: 8,
  loserStrengthLoss: 0.5,
  loserRoutLoss: 1,
  winnerStrengthLoss: 0.15,
  winterRecovery: 0.25,
  winterScoreRetention: 0.5,
  protractedStrengthRatio: 0.7,
  protractedScore: 5,
  capitulationScore: 100,
} as const;

export interface WarStrengthSuggestion { value: number; source: string; sourceUrl?: string }
export interface WarDeterminationSuggestion { value: number; source: string }
export interface WarPartyOption { id: string; name: string; government?: string; referenceUrl?: string; strengthSuggestion?: WarStrengthSuggestion; l8StrengthCandidates?: readonly WarStrengthCandidate[] }
export type WarOutcome = 'side-a' | 'side-b' | 'status-quo';
export interface WarOrder {
  sideA: WarPartyOption;
  sideB: WarPartyOption;
  strengthA: number;
  strengthB: number;
  determinationA: number;
  determinationB: number;
  determinationSourceA?: string;
  determinationSourceB?: string;
  /** A reviewed L8 quote may be chosen for this war only; it does not become an accepted world fact. */
  strengthEvidenceA?: WarStrengthEvidence;
  strengthEvidenceB?: WarStrengthEvidence;
  /** Optional campaign location used by the existing near/far process projection. */
  at?: string;
  /** Prepared, source-backed walking route; omitted only by legacy/manual callers. */
  front?: WarFrontPlan;
}

/** Explicit settlement terms for a front place; omitted places retain their current campaign record. */
export type WarSettlementTerritoryTerms = Readonly<Record<string, string | null>>;

interface WarFrontRecord extends WarFrontPlan { locationIds: readonly string[] }

interface WarData {
  version: 1;
  kind: 'war';
  ruleVersion: string;
  ruleSource: string;
  strengthSource: 'gm-provided';
  sideA: Omit<WarPartyOption, 'l8StrengthCandidates'>;
  sideB: Omit<WarPartyOption, 'l8StrengthCandidates'>;
  strengthEvidenceA?: WarStrengthEvidence;
  strengthEvidenceB?: WarStrengthEvidence;
  front?: WarFrontRecord;
  outcome?: WarOutcome;
  resolution?: { mode: 'gm-authored'; atSec: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const formatNumber = (n: number) => String(Math.round(n * 100) / 100);
const clampStrength = (n: number, cap: number) => round1(Math.max(0, Math.min(cap, n)));
const recoverStrength = (n: number, cap: number) => Math.round(Math.max(0, Math.min(cap, n)) * 100) / 100;
const num = (p: Process, key: string) => p.vars[key] ?? 0;
/** A numeric population contributes only when the source text dates it to the selected campaign year. */
export function warStrengthSuggestion(populationText: string | undefined, kingdomType: string | undefined, year: number): WarStrengthSuggestion | undefined {
  if (populationText) {
    for (const segment of populationText.split(/[;|]/)) {
      const dated = /\b(?:in|as of|as at)\s+(-?\d{1,4})\s*DR\b/i.exec(segment);
      if (!dated || Number(dated[1]) !== year) continue;
      const prefix = segment.slice(0, dated.index);
      if (/\b(?:up to|over|more than|less than|at least|approximately|approx\.?|about|ca\.?|circa|around)\b/i.test(prefix)) continue;
      const numbers = [...prefix.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)];
      if (numbers.length !== 1) continue;
      const amountText = numbers[0]![0];
      const amount = Number(amountText.replaceAll(',', '')) * (/\bmillion\b/i.test(prefix) ? 1_000_000 : /\bthousand\b/i.test(prefix) ? 1_000 : 1);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const value = round1(Math.max(0, Math.min(WAR_RULES.maxStrength, Math.log2(amount / 10_000))));
      return { value, source: `1% населения на ${year} DR · research/world-models.md §4.2.2 · ${WAR_RULES.version}` };
    }
  }

  const type = kingdomType?.trim().toLowerCase().replace(/[–—]/g, '-');
  const value = type && /\bempire\b/.test(type) ? 8
    : type && /\b(?:kingdom|country)\b/.test(type) ? 6
      : type && /\b(?:city-state|city)\b/.test(type) ? 4
        : type && /\bsettlement\b/.test(type) ? 2 : undefined;
  return value === undefined ? undefined : { value, source: `тип державы «${kingdomType}» · правило стола, research/world-models.md §4.2.2 · ${WAR_RULES.version}` };
}

/** Only the documented typical value and explicitly named government bonus are suggested. */
export function warDeterminationSuggestion(government: string | undefined): WarDeterminationSuggestion {
  const bonus = government && /\b(?:magocracy|theocracy)\b/i.test(government) ? 2 : 0;
  return {
    value: 6 + bonus,
    source: `порядок 6 как обычный${bonus ? '; +2 за магократию/теократию' : ''} · research/world-models.md §4.0.1, §4.2.3 · ${WAR_RULES.version}`,
  };
}
const inCampaignSeason = (sec: number) => {
  const month = harptos(sec).month;
  const monthNumber = month ? MONTHS.indexOf(month) + 1 : 0;
  return monthNumber >= WAR_RULES.campaignMonths[0] && monthNumber <= WAR_RULES.campaignMonths[1];
};
const dataOf = (p: Process): WarData | null => {
  const data = p.data;
  return data?.kind === 'war' && data.version === 1 && data.ruleVersion === WAR_RULES.version
    && data.sideA && data.sideB ? data as unknown as WarData : null;
};

function validateOrder(order: WarOrder): void {
  if (!order.sideA.id.trim() || !order.sideA.name.trim() || !order.sideB.id.trim() || !order.sideB.name.trim()) throw new Error('выберите две державы');
  if (order.sideA.id === order.sideB.id) throw new Error('держава не может объявить войну самой себе');
  for (const [label, value] of [['сила A', order.strengthA], ['сила B', order.strengthB]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > WAR_RULES.maxStrength) throw new Error(`${label}: укажите значение от 0 до ${WAR_RULES.maxStrength}`);
  }
  for (const [label, value] of [['решимость A', order.determinationA], ['решимость B', order.determinationB]] as const) {
    if (!Number.isInteger(value) || value < 0 || value > WAR_RULES.maxDetermination) throw new Error(`${label}: укажите целое от 0 до ${WAR_RULES.maxDetermination}`);
  }
  if (order.front) {
    const front = order.front;
    if (front.version !== 1 || !front.map.trim() || front.nodes.length < 2 || front.nodes[0]?.id !== front.fromPlace
      || front.nodes.at(-1)?.id !== front.toPlace || new Set(front.nodes.map(node => node.id)).size !== front.nodes.length
      || !front.sideAPlaceIds.includes(front.fromPlace) || !front.sideBPlaceIds.includes(front.toPlace)
      || !Number.isFinite(front.miles) || front.miles <= 0 || !Number.isFinite(front.days) || front.days <= 0
      || (front.tier !== 2 && front.tier !== 3)) throw new Error('маршрут фронта повреждён или не связан с выбранными державами');
  }
}

function validateStrengthEvidence(evidence: WarStrengthEvidence | undefined, party: WarPartyOption, value: number, year: number): void {
  if (!evidence) return;
  const parsedAmount = /^\d[\d,]*$/.test(evidence.amountRaw) ? Number(evidence.amountRaw.replaceAll(',', '')) : NaN;
  const expected = Number.isFinite(parsedAmount) && parsedAmount > 0 ? round1(Math.max(0, Math.min(10, Math.log2(parsedAmount / 100)))) : NaN;
  if (evidence.kind !== 'l8-candidate' || evidence.factAccepted !== false || evidence.usage !== 'gm-selected-for-war'
    || !evidence.candidateId.trim() || evidence.kingdomId !== party.id
    || evidence.kingdomName !== party.name || evidence.sourceTitle !== party.name || evidence.year !== year
    || evidence.amount !== parsedAmount || !Number.isSafeInteger(evidence.amount) || evidence.amount <= 0
    || !evidence.unitRaw.trim() || evidence.value !== expected || value !== expected
    || !evidence.sourceUrl.startsWith('https://') || !evidence.revisionId.trim() || !evidence.sourceTimestamp.trim()
    || !evidence.sourceLicense.trim() || !evidence.sourceLicenseId.trim()
    || !/^[a-f0-9]{64}$/i.test(evidence.sourceWikitextSha256)
    || evidence.ruleSource !== 'research/world-models.md §4.2.2') {
    throw new Error(`источник силы L8 не совпадает с державой, годом или введённым значением (${party.name})`);
  }
}

/** Создаёт только pending-предложение. Мастер подтверждает значения; выбранная цитата L8 сохраняется лишь как основание силы этой войны. */
export function warProposal(state: State, order: WarOrder, timeEventId: string): WorldDelta {
  validateOrder(order);
  const campaignYear = harptos(state.time.sec).year;
  validateStrengthEvidence(order.strengthEvidenceA, order.sideA, order.strengthA, campaignYear);
  validateStrengthEvidence(order.strengthEvidenceB, order.sideB, order.strengthB, campaignYear);
  if (!timeEventId.trim()) throw new Error('укажите причину начала войны');
  const name = `${order.sideA.name} — ${order.sideB.name}`;
  const subject = `Война · ${name}`;
  const parties = [`kingdom:${order.sideA.id}`, `kingdom:${order.sideB.id}`].sort();
  const sameSides = (candidate: readonly string[]) => candidate.filter(id => id.startsWith('kingdom:')).sort().join('|') === parties.join('|');
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && (
    delta.subject === subject || (delta.patch?.kind === 'process' && delta.patch.process.kind === 'war' && sameSides(delta.patch.process.parties))
  ))) {
    throw new Error(`война ${name} уже ждёт решения`);
  }
  if (Object.values(state.world.processes ?? {}).some(process => process.kind === 'war' && !process.ended && sameSides(process.parties))) {
    throw new Error(`между ${order.sideA.name} и ${order.sideB.name} уже идёт война`);
  }
  const id = `proc-war-${order.sideA.id}-${order.sideB.id}-${state.time.sec}`;
  const existing = state.world.processes?.[id];
  if (existing && !existing.ended) throw new Error(`война ${name} уже есть`);
  const worldPatches: WorldPatch[] = [];
  let workingState = state;
  let front: WarFrontRecord | undefined;
  if (order.front) {
    const locationIds: string[] = [];
    for (const node of order.front.nodes) {
      const placed = placeLocation(workingState, node, order.front.map);
      locationIds.push(placed.location.id);
      if (placed.patch) {
        worldPatches.push(placed.patch);
        workingState = { ...workingState, world: { ...workingState.world, locations: { ...workingState.world.locations, [placed.location.id]: placed.location } } };
      }
    }
    front = { ...order.front, nodes: order.front.nodes.map(node => ({ ...node })), locationIds };
  }
  const process: Process = {
    id, kind: 'war', name, scale: 'continent', stage: 'mobilization',
    parties: [`kingdom:${order.sideA.id}`, `kingdom:${order.sideB.id}`],
    ...(order.at ? { at: order.at } : front?.locationIds[0] ? { at: front.locationIds[0] } : {}),
    startedSec: state.time.sec, nextSec: state.time.sec + TEN_DAYS,
    vars: {
      strengthA: order.strengthA, strengthB: order.strengthB,
      initialA: order.strengthA, initialB: order.strengthB,
      determinationA: order.determinationA, determinationB: order.determinationB,
      score: 0, mobilizationTicks: 0, winterCouncilYear: -1, winterScoreYear: -1,
      battles: 0,
    },
    data: {
      version: 1, kind: 'war', ruleVersion: WAR_RULES.version, ruleSource: WAR_RULES.ruleSource,
      strengthSource: 'gm-provided',
      sideA: {
        id: order.sideA.id, name: order.sideA.name,
        ...(order.sideA.government ? { government: order.sideA.government } : {}),
        ...(order.sideA.referenceUrl ? { referenceUrl: order.sideA.referenceUrl } : {}),
        ...(order.sideA.strengthSuggestion ? { strengthSuggestion: { ...order.sideA.strengthSuggestion } } : {}),
      },
      sideB: {
        id: order.sideB.id, name: order.sideB.name,
        ...(order.sideB.government ? { government: order.sideB.government } : {}),
        ...(order.sideB.referenceUrl ? { referenceUrl: order.sideB.referenceUrl } : {}),
        ...(order.sideB.strengthSuggestion ? { strengthSuggestion: { ...order.sideB.strengthSuggestion } } : {}),
      },
      ...(order.strengthEvidenceA ? { strengthEvidenceA: { ...order.strengthEvidenceA } } : {}),
      ...(order.strengthEvidenceB ? { strengthEvidenceB: { ...order.strengthEvidenceB } } : {}),
      ...(front ? { front } : {}),
    } satisfies WarData,
    causeId: timeEventId,
  };
  const orderSource = (value: number, provided?: string) => `порядок ${value} подтверждён мастером · ${provided ?? `ручной ввод, ${WAR_RULES.ruleSource} §4.0.1, §4.2.3`} · ${WAR_RULES.version}`;
  const orderPatches: WorldPatch[] = [
    { kind: 'kingdomOrder', kingdomId: order.sideA.id, value: order.determinationA, source: orderSource(order.determinationA, order.determinationSourceA) },
    { kind: 'kingdomOrder', kingdomId: order.sideB.id, value: order.determinationB, source: orderSource(order.determinationB, order.determinationSourceB) },
  ];
  return {
    id: `sim-${timeEventId}-${id}`, scale: 'continent', subject,
    was: 'нет', now: `${front ? `мобилизация · фронт ${front.nodes[0].name} — ${front.nodes.at(-1)!.name} · ${front.miles} мили` : 'мобилизация'} · порядок держав ${order.determinationA}/${order.determinationB}`,
    cause: `мастер создал процесс войны; силы и начальный порядок подтверждены мастером по правилу стола${front ? '; пеший маршрут фронта зафиксирован по графу карты' : ''}`,
    causeId: timeEventId, status: 'pending', patch: { kind: 'batch', patches: [
      ...worldPatches, ...orderPatches, { kind: 'process', process },
    ] },
  };
}

/** Front nodes are GM-visible only while the accepted war is in its campaign stage. */
export function warFrontAtPlace(state: State, placeId: string, exceptProcessId?: string): { process: Process; front: WarFrontRecord } | undefined {
  for (const process of Object.values(state.world.processes ?? {})) {
    const data = dataOf(process);
    if (!data || process.id === exceptProcessId || process.ended || !['campaign', 'protracted'].includes(process.stage)
      || !data.front?.nodes.some(node => node.id === placeId)) continue;
    return { process, front: data.front };
  }
  return undefined;
}

export const isWarFrontPlace = (state: State, placeId: string): boolean => !!warFrontAtPlace(state, placeId);
export const warHasFrontPlace = (process: Process, placeId: string): boolean => !!dataOf(process)?.front?.nodes.some(node => node.id === placeId);
/** Fallback for the missing region-kind patch: an active campaign front is high danger while the process is active. */
export const warDangerAtPlace = (state: State, placeId: string): 'high' | undefined => isWarFrontPlace(state, placeId) ? 'high' : undefined;

const DAY = TEMPO_SECONDS.day;

function pricePatchesForCampaign(state: State, front: WarFrontRecord | undefined): WorldPatch[] {
  if (!front) return [];
  const memberPlaces = new Set([...front.sideAPlaceIds, ...front.sideBPlaceIds, ...front.nodes.map(node => node.id)]);
  const locationIds = new Set(front.locationIds);
  for (const location of Object.values(state.world.locations)) {
    const placeId = location.ref?.startsWith('place:') ? location.ref.slice('place:'.length) : undefined;
    if (placeId && memberPlaces.has(placeId)) locationIds.add(location.id);
  }
  return [...locationIds].flatMap(id => {
    const location = state.world.locations[id];
    return location?.scale === 'settlement' ? (['weapons', 'armor'] as const).map(goods => ({
      kind: 'price' as const, id, goods, value: (location.prices?.[goods] ?? 0) + 15,
    })) : [];
  });
}

function stillClosedAfterWar(state: State, placeId: string, warId: string, endingBlockadeIds: ReadonlySet<string>): boolean {
  if (warFrontAtPlace(state, placeId, warId)) return true;
  return Object.values(state.world.processes ?? {}).some(process => process.kind === 'blockade' && !process.ended
    && !endingBlockadeIds.has(process.id) && process.data?.kind === 'blockade' && process.data.targetPlaceId === placeId);
}

function linkedWarBlockades(state: State, war: Process, sec: number) {
  const processes = Object.values(state.world.processes ?? {}).filter(process => process.kind === 'blockade' && !process.ended
    && process.data?.kind === 'blockade' && process.data.warProcessId === war.id);
  const ids = new Set(processes.map(process => process.id));
  const places = new Set(processes.flatMap(process => {
    const placeId = process.data?.kind === 'blockade' && typeof process.data.targetPlaceId === 'string' ? process.data.targetPlaceId : undefined;
    return placeId ? [placeId] : [];
  }));
  return {
    ids,
    places,
    patches: processes.map(process => ({ kind: 'process' as const, process: { ...process, stage: 'ended', ended: true, nextSec: sec } })),
  };
}

function resumeWarBlockedCaravans(
  state: State,
  sec: number,
  war: Process,
  front: WarFrontRecord | undefined,
  endingBlockades: ReturnType<typeof linkedWarBlockades>,
): WorldPatch[] {
  const affectedPlaces = new Set([...(front?.nodes.map(node => node.id) ?? []), ...endingBlockades.places]);
  if (!affectedPlaces.size) return [];
  return Object.values(state.world.processes ?? {}).flatMap(caravan => {
    if (caravan.kind !== 'caravan' || caravan.stage !== 'blocked' || caravan.ended) return [];
    const nodes = (caravan.data?.route as { nodes?: readonly string[] } | undefined)?.nodes;
    const index = caravan.vars.blockedRouteIndex;
    const placeId = Number.isSafeInteger(index) ? nodes?.[index!] : undefined;
    if (!placeId || !affectedPlaces.has(placeId) || stillClosedAfterWar(state, placeId, war.id, endingBlockades.ids)) return [];
    const vars = { ...caravan.vars };
    delete (vars as Record<string, number>).blockedRouteIndex;
    return [{ kind: 'process' as const, process: { ...caravan, stage: 'transit', nextSec: sec + DAY, vars } }];
  });
}

function endWarSieges(state: State, war: Process, sec: number): WorldPatch[] {
  return Object.values(state.world.processes ?? {}).flatMap(process => process.kind === 'siege' && !process.ended
    && process.data?.kind === 'siege' && process.data.warProcessId === war.id
    ? [{ kind: 'process' as const, process: { ...process, stage: 'lifted', ended: true, nextSec: sec } }]
    : []);
}

function finish(p: Process, data: WarData, outcome: WarData['outcome'], stage: 'peace' | 'capitulation', line: string, ctx: TickContext, extra: readonly WorldPatch[] = []): TickResult {
  const blockades = linkedWarBlockades(ctx.state, p, ctx.sec);
  return {
    process: { ...p, stage, ended: true, data: { ...data, outcome }, vars: { ...p.vars }, nextSec: p.nextSec + TICK_SEC[p.scale] },
    patches: [...extra, ...endWarSieges(ctx.state, p, ctx.sec), ...blockades.patches, ...resumeWarBlockedCaravans(ctx.state, ctx.sec, p, data.front, blockades)],
    line,
  };
}

/** GM-authored settlement ends an active conflict; optional territorial terms are entered place by place. */
export function warSettlementProposal(
  state: State,
  warProcessId: string,
  outcome: WarOutcome,
  timeEventId: string,
  territoryTerms: WarSettlementTerritoryTerms = {},
): WorldDelta {
  if (!timeEventId.trim()) throw new Error('укажите причину урегулирования войны');
  if (!['side-a', 'side-b', 'status-quo'].includes(outcome)) throw new Error('выберите исход урегулирования');
  const war = state.world.processes?.[warProcessId];
  const data = war ? dataOf(war) : null;
  if (!war || war.kind !== 'war' || war.ended || !data) throw new Error('активная война больше не доступна');
  if (Object.keys(territoryTerms).length && (!data.front || !['campaign', 'protracted'].includes(war.stage))) {
    throw new Error('территориальные условия доступны только на активном принятом фронте');
  }
  const subject = `Урегулирование войны · ${war.name}`;
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.subject === subject)) {
    throw new Error(`${subject}: уже ждёт решения`);
  }
  const territoryPatches: Extract<WorldPatch, { kind: 'territoryControl' }>[] = Object.entries(territoryTerms).flatMap(([placeId, controllerId]) => {
    if (!data.front?.nodes.some(node => node.id === placeId)) throw new Error(`место ${placeId} не входит во фронт этой войны`);
    const location = Object.values(state.world.locations).find(candidate => candidate.scale === 'settlement' && candidate.ref === `place:${placeId}`);
    if (!location) throw new Error(`поселение фронта ${placeId} не найдено в кампании`);
    const side = controllerId === null ? undefined : [data.sideA, data.sideB].find(candidate => candidate.id === controllerId);
    if (controllerId !== null && !side) throw new Error(`контроль ${placeId} можно назначить только одной из держав-участниц войны`);
    const controller = side ? { kingdomId: side.id, kingdomName: side.name } : null;
    const current = state.world.territoryControl?.[placeId];
    if (controller?.kingdomId === current?.kingdomId || (!controller && !current)) return [];
    return [{ kind: 'territoryControl' as const, warProcessId: war.id, placeId, controller }];
  });
  const outcomeLabel = outcome === 'side-a' ? `мир с победой ${data.sideA.name}`
    : outcome === 'side-b' ? `мир с победой ${data.sideB.name}` : 'урегулирование без назначенного победителя';
  const resolved: Process = {
    ...war, stage: 'peace', ended: true, nextSec: state.time.sec,
    data: { ...data, outcome, resolution: { mode: 'gm-authored', atSec: state.time.sec } },
  };
  const blockades = linkedWarBlockades(state, war, state.time.sec);
  const patches: WorldPatch[] = [
    ...territoryPatches,
    { kind: 'process', process: resolved },
    ...endWarSieges(state, war, state.time.sec),
    ...blockades.patches,
    ...resumeWarBlockedCaravans(state, state.time.sec, war, data.front, blockades),
  ];
  return {
    id: `sim-${timeEventId}-${war.id}-settlement`, scale: 'continent', subject,
    was: `${war.stage} · война продолжается`, now: territoryPatches.length
      ? `${outcomeLabel} · изменён контроль поселений: ${territoryPatches.map(patch => {
        const place = data.front?.nodes.find(node => node.id === patch.placeId);
        return `${place?.name ?? patch.placeId} → ${patch.controller?.kingdomName ?? 'без кампанийной записи'}`;
      }).join(', ')}`
      : outcomeLabel,
    cause: `мастер предложил урегулирование; исход и ${territoryPatches.length ? 'контроль поселений ' : ''}указаны вручную; автоматического расчёта договора нет`,
    causeId: timeEventId, status: 'pending', patch: { kind: 'batch', patches },
  };
}

/** Records territory control only by an explicit GM decision on an accepted war front. */
export function warTerritoryProposal(state: State, warProcessId: string, placeId: string, controllerId: string | null, timeEventId: string): WorldDelta {
  if (!timeEventId.trim()) throw new Error('укажите причину решения о контроле территории');
  const war = state.world.processes?.[warProcessId];
  const data = war ? dataOf(war) : null;
  if (!war || war.kind !== 'war' || war.ended || !data || !['campaign', 'protracted'].includes(war.stage) || !data.front) {
    throw new Error('активный фронт войны больше не доступен');
  }
  if (!data.front.nodes.some(node => node.id === placeId)) throw new Error('место не входит в принятый фронт этой войны');
  const location = Object.values(state.world.locations).find(candidate => candidate.scale === 'settlement' && candidate.ref === `place:${placeId}`);
  if (!location) throw new Error('поселение фронта не найдено в кампании');

  let controller: TerritoryController | null = null;
  if (controllerId !== null) {
    const side = [data.sideA, data.sideB].find(candidate => candidate.id === controllerId);
    if (!side) throw new Error('контроль можно назначить только одной из держав-участниц войны');
    controller = { kingdomId: side.id, kingdomName: side.name };
  }
  const current = state.world.territoryControl?.[placeId];
  if (controller?.kingdomId === current?.kingdomId || (!controller && !current)) {
    throw new Error('такой контроль территории уже записан');
  }
  const subject = `Контроль территории · ${location.name}`;
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.subject === subject)) {
    throw new Error(`${subject}: уже ждёт решения`);
  }
  const next = controller ? `${controller.kingdomName} · решение мастера` : 'сбросить кампанийную запись контроля';
  const previous = current ? `${current.kingdomName} · кампанийная запись` : 'отдельная запись контроля не задана';
  const patch: WorldPatch = { kind: 'territoryControl', warProcessId: war.id, placeId, controller };
  return {
    id: `sim-${timeEventId}-${war.id}-territory-${placeId}`, scale: 'settlement', subject,
    was: previous, now: next,
    cause: 'контроль записан по отдельному решению мастера; ход битвы сам по себе владельца не меняет',
    causeId: timeEventId, status: 'pending', patch,
  };
}

function tick(p: Process, ctx: TickContext): TickResult {
  const data = dataOf(p);
  if (!data) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия модели войны' };
  const vars = { ...p.vars };
  let strengthA = num(p, 'strengthA'), strengthB = num(p, 'strengthB');
  let score = num(p, 'score');
  const sec = ctx.sec;
  const date = harptos(sec);
  const nextSec = sec + TICK_SEC[p.scale];
  let winterCouncilLine: string | undefined;

  if (p.stage === 'mobilization') {
    const mobilizationTicks = Math.min(WAR_RULES.mobilizationTicks, num(p, 'mobilizationTicks') + 1);
    const progress = WAR_RULES.mobilizationStrength * mobilizationTicks / WAR_RULES.mobilizationTicks;
    strengthA = clampStrength(num(p, 'initialA') + progress, num(p, 'initialA') + WAR_RULES.mobilizationStrength);
    strengthB = clampStrength(num(p, 'initialB') + progress, num(p, 'initialB') + WAR_RULES.mobilizationStrength);
    const stage = mobilizationTicks >= WAR_RULES.mobilizationTicks ? 'campaign' : 'mobilization';
    return {
      process: { ...p, stage, nextSec, vars: { ...vars, strengthA, strengthB, mobilizationTicks } },
      line: `мобилизация ${mobilizationTicks}/${WAR_RULES.mobilizationTicks}: сила ${strengthA} / ${strengthB}`,
    };
  }

  if (p.stage !== 'campaign' && p.stage !== 'protracted') return { process: { ...p, ended: true, stage: 'invalid' }, line: `неизвестная стадия войны: ${p.stage}` };

  // Winter council happens once per year in the first tenday of Hammer. Both sides must agree.
  const intervalStart = harptos(sec - TICK_SEC[p.scale]);
  const councilWindow = date.month === 'Hammer' && (date.day <= 10
    || (intervalStart.year === date.year && intervalStart.month === 'Hammer' && intervalStart.day <= 10));
  if (councilWindow && num(p, 'winterCouncilYear') !== date.year) {
    const losingBonusA = score < 0 ? Math.abs(score) / 10 : 0;
    const losingBonusB = score > 0 ? Math.abs(score) / 10 : 0;
    const rollA = ctx.roll('winter-council:side-a');
    const rollB = ctx.roll('winter-council:side-b');
    const totalA = round1(rollA + losingBonusA);
    const totalB = round1(rollB + losingBonusB);
    const targetA = 10 + num(p, 'determinationA');
    const targetB = 10 + num(p, 'determinationB');
    const agreeA = totalA >= targetA;
    const agreeB = totalB >= targetB;
    winterCouncilLine = `зимний совет: ${data.sideA.name} ${rollA} + ${round1(losingBonusA)} = ${totalA} против ${targetA} — ${agreeA ? 'за мир' : 'продолжает'}; ${data.sideB.name} ${rollB} + ${round1(losingBonusB)} = ${totalB} против ${targetB} — ${agreeB ? 'за мир' : 'продолжает'}`;
    vars.winterCouncilYear = date.year;
    if (agreeA && agreeB) {
      const outcome = Math.abs(score) >= 50 ? (score >= 0 ? 'side-a' : 'side-b') : 'status-quo';
      const result = finish({ ...p, vars }, { ...data }, outcome, 'peace', `${winterCouncilLine}; обе стороны согласились на ${outcome === 'status-quo' ? 'status quo' : 'мир с победителем'}`, ctx);
      return { ...result, summary: winterCouncilLine };
    }
  }

  // In Nightal the score cools once; in all winter tendays, forces recover toward their mobilized maximum.
  if (date.month === 'Nightal' && num(p, 'winterScoreYear') !== date.year) {
    score = round1(score * WAR_RULES.winterScoreRetention);
    vars.winterScoreYear = date.year;
  }
  if (!inCampaignSeason(sec)) {
    strengthA = recoverStrength(strengthA + WAR_RULES.winterRecovery, num(p, 'initialA') + WAR_RULES.mobilizationStrength);
    strengthB = recoverStrength(strengthB + WAR_RULES.winterRecovery, num(p, 'initialB') + WAR_RULES.mobilizationStrength);
    return {
      process: { ...p, nextSec, vars: { ...vars, strengthA, strengthB, score } },
      line: `${winterCouncilLine ? `${winterCouncilLine}; ` : ''}зимняя пауза: сила ${strengthA} / ${strengthB}`,
      ...(winterCouncilLine ? { summary: winterCouncilLine } : {}),
    };
  }

  const campaignPatches = num(p, 'campaignPriceYear') === date.year ? [] : pricePatchesForCampaign(ctx.state, data.front);
  if (num(p, 'campaignPriceYear') !== date.year) vars.campaignPriceYear = date.year;

  if (ctx.roll('battle-encounter') < WAR_RULES.battleEncounterThreshold) {
    return { process: { ...p, nextSec, vars: { ...vars, strengthA, strengthB, score } }, patches: campaignPatches,
      line: `за десятидневку сражения не было${campaignPatches.length ? '; оружие и доспехи подорожали на 15%' : ''}` };
  }

  const protracted = strengthA < num(p, 'initialA') * WAR_RULES.protractedStrengthRatio
    && strengthB < num(p, 'initialB') * WAR_RULES.protractedStrengthRatio;
  const combatRoll = ctx.roll(protracted ? 'raid' : 'battle');
  const combatModifier = 2 * (strengthA - strengthB);
  const combatTotal = combatRoll + combatModifier;
  const margin = combatTotal - WAR_RULES.battleTarget;
  const sideAWon = margin >= 0;
  const magnitude = protracted ? WAR_RULES.protractedScore : Math.abs(margin) >= WAR_RULES.routMargin ? WAR_RULES.scoreForRout : WAR_RULES.scoreForVictory;
  score = round1(Math.max(-100, Math.min(100, score + (sideAWon ? magnitude : -magnitude))));
  const battles = num(p, 'battles') + 1;
  if (!protracted) {
    if (sideAWon) {
      strengthA = clampStrength(strengthA - WAR_RULES.winnerStrengthLoss, num(p, 'initialA') + 1);
      strengthB = clampStrength(strengthB - (Math.abs(margin) >= WAR_RULES.routMargin ? WAR_RULES.loserRoutLoss : WAR_RULES.loserStrengthLoss), num(p, 'initialB') + 1);
    } else {
      strengthB = clampStrength(strengthB - WAR_RULES.winnerStrengthLoss, num(p, 'initialB') + 1);
      strengthA = clampStrength(strengthA - (Math.abs(margin) >= WAR_RULES.routMargin ? WAR_RULES.loserRoutLoss : WAR_RULES.loserStrengthLoss), num(p, 'initialA') + 1);
    }
  }
  const routed = !protracted && Math.abs(margin) >= WAR_RULES.routMargin;
  const battlePatches: WorldPatch[] = [...campaignPatches];
  if (routed) {
    const loser = sideAWon ? data.sideB : data.sideA;
    const determinationKey = sideAWon ? 'determinationB' : 'determinationA';
    const currentOrder = ctx.state.world.kingdomOrder?.[loser.id]?.value ?? num(p, determinationKey);
    const nextOrder = Math.max(0, currentOrder - 1);
    vars[determinationKey] = nextOrder;
    battlePatches.push({ kind: 'kingdomOrder', kingdomId: loser.id, value: nextOrder, source: `${WAR_RULES.ruleSource} §4.2.6 · −1 после проигранного разгрома · ${WAR_RULES.version}` });
  }
  vars.strengthA = strengthA; vars.strengthB = strengthB; vars.score = score; vars.battles = battles;
  const now = { ...p, stage: protracted ? 'protracted' : 'campaign', nextSec, vars };
  if (Math.abs(score) >= WAR_RULES.capitulationScore || strengthA <= 0 || strengthB <= 0) {
    const outcome = strengthA <= 0 && strengthB <= 0 ? 'status-quo' : strengthA <= 0 ? 'side-b' : strengthB <= 0 ? 'side-a' : score >= 0 ? 'side-a' : 'side-b';
    const modifierText = combatModifier >= 0 ? `+ ${formatNumber(combatModifier)}` : `− ${formatNumber(-combatModifier)}`;
    return finish({ ...p, stage: protracted ? 'protracted' : 'campaign', vars }, data, outcome, 'capitulation', `${protracted ? 'набег' : 'сражение'}: d20 ${combatRoll} ${modifierText} = ${formatNumber(combatTotal)} против ${WAR_RULES.battleTarget}; ${sideAWon ? data.sideA.name : data.sideB.name} продвинулась; война закончилась капитуляцией`, ctx, battlePatches);
  }
  const result = protracted ? 'набег' : Math.abs(margin) >= WAR_RULES.routMargin ? 'разгром' : 'победа';
  const orderLoss = routed ? `; порядок ${sideAWon ? data.sideB.name : data.sideA.name} −1` : '';
  const modifierText = combatModifier >= 0 ? `+ ${formatNumber(combatModifier)}` : `− ${formatNumber(-combatModifier)}`;
  return { process: now, patches: battlePatches, line: `${result}: ${sideAWon ? data.sideA.name : data.sideB.name}; d20 ${combatRoll} ${modifierText} = ${formatNumber(combatTotal)} против ${WAR_RULES.battleTarget}; счёт ${score >= 0 ? '+' : ''}${score}; сила ${strengthA} / ${strengthB}${orderLoss}${campaignPatches.length ? '; оружие и доспехи подорожали на 15%' : ''}` };
}

export const warKind: ProcessKind = {
  kind: 'war', label: 'Война',
  stages: { mobilization: 'мобилизация', campaign: 'кампания', protracted: 'затяжная', peace: 'мир', capitulation: 'капитуляция', invalid: 'ошибка данных' },
  progress: p => ({ segments: 10, filled: Math.min(10, Math.floor(Math.abs(num(p, 'score')) / 10)) }),
  tick,
};
