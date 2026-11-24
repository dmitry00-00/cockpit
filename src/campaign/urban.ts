// C5: поселковые кризисы. Каждое численное правило хранит версию и источник в самом процессе.
// Модель голода и SIR — правила стола из research/world-models.md §4.3; болезнь сверяется с SRD 5.1.
import type { EpidemicExposure, Location, Process, SettlementPolityRecord, State, WorldDelta, WorldPatch } from '../engine/state';
import { SECONDS_PER_DAY } from '../engine/state';
import type { ProcessKind, TickContext, TickResult } from './processes';
import { nearParty } from './processes';
import { isWarFrontPlace, warHasFrontPlace } from './war';
import type { Organization, PlaceFaith } from '../world/organizations';
import { orgExistsIn } from '../world/organizations';
import { harptos } from './calendar';
import { planReferenceActivation } from './activation';

const TENDAY = 10 * SECONDS_PER_DAY;
const DAY = SECONDS_PER_DAY;
export const URBAN_RULES = {
  version: 'dm-cockpit-urban/3',
  famineSource: 'research/world-models.md §4.3.2 (table rule)',
  epidemicSource: 'research/world-models.md §4.3.4; D&D 5.1 SRD, Sewer Plague',
  caravanTransmissionSource: 'research/world-models.md §4.3.4 (table rule; d20 by caravan, chance I/N)',
  treatmentSource: 'research/world-models.md §4.3.4; D&D 5.1 SRD, Lesser Restoration (table rule: one 3rd-level cleric per temple)',
  revoltSource: 'research/world-models.md §4.3.3 (table rule; PF1 Ultimate Campaign inspiration)',
  relationSource: 'research/world-models.md §4.3.1 (table rule)',
  capitalFamineSource: 'research/world-models.md §4.4 (table rule)',
  siegeSource: 'research/world-models.md §4.2.6 (table rule; A5E Supply units: food-days)',
  faminePopulationLoss: 0.01,
  famineOrderLoss: 1,
  diseaseDc: 11,
  diseaseRecoveryDays: 7.5,
  diseaseInfectiousDays: 5,
  incubationMinDays: 1,
  incubationMaxDays: 4,
  templeTreatmentPerDay: 2,
  diseaseMortality: 1 / 6,
  minR0: 1.5,
  maxR0: 2,
  revoltThreshold: (order: number) => 9 - 3 * order,
  revoltGarrisonShare: 0.001,
  revoltGarrisonTarget: (order: number) => 11 + 2 * (5 - order),
  revoltGarrisonMultiplier: 2,
} as const;

interface FamineData { version: 1; kind: 'famine'; ruleVersion: string; ruleSource: string }
export interface FamineCapitalOrder { kingdomId: string }
export interface FamineCapitalCandidate { id: string; capitalPlace?: string; founded?: number; dissolved?: number }
export interface RevoltKingdomCandidate extends FamineCapitalCandidate {
  name: string;
  place?: string;
  places?: readonly string[];
}
interface EpidemicData {
  version: 1; kind: 'epidemic'; ruleVersion: string; ruleSource: string; disease: 'Sewer Plague'; diseaseDc: number;
  treatmentPerDay?: number; treatmentTemples?: number; treatmentSource?: string; exposureIds?: readonly string[];
}
interface RevoltData { version: 1; kind: 'revolt'; ruleVersion: string; ruleSource: string }
interface BlockadeData {
  version: 1; kind: 'blockade'; ruleVersion: string; ruleSource: string; targetPlaceId: string; warProcessId?: string;
  relationFactions?: readonly [string, string]; relationPlaces?: readonly [string, string];
}
interface SiegeData { version: 1; kind: 'siege'; ruleVersion: string; ruleSource: string; targetPlaceId: string; warProcessId: string }

const activeAt = (state: State, kind: string, locationId: string) => Object.values(state.world.processes ?? {}).some(p => p.kind === kind && p.at === locationId && !p.ended);
const pendingAt = (state: State, subject: string) => Object.values(state.deltas).some(d => d.status === 'pending' && d.subject === subject);
const pendingKingdomOrder = (state: State, kingdomId: string) => Object.values(state.deltas).some(delta => {
  if (delta.status !== 'pending' || !delta.patch) return false;
  const contains = (patch: WorldPatch): boolean => patch.kind === 'kingdomOrder'
    ? patch.kingdomId === kingdomId : patch.kind === 'batch' ? patch.patches.some(contains) : false;
  return contains(delta.patch);
});
const supportedRuleVersion = (version: unknown) => [URBAN_RULES.version, 'dm-cockpit-urban/2', 'dm-cockpit-urban/1'].includes(String(version));
const settlement = (state: State, id: string): Location => {
  const location = state.world.locations[id];
  if (!location || location.scale !== 'settlement') throw new Error('выберите поселение кампании');
  return location;
};
const processId = (kind: string, locationId: string, sec: number) => `proc-${kind}-${locationId}-${sec}`;
const tickInterval = (state: State, process: Pick<Process, 'at'>) => nearParty(state, process) ? DAY : TENDAY;

function proposal(state: State, process: Process, was: string, now: string, cause: string, timeEventId: string): WorldDelta {
  const label = process.kind === 'famine' ? 'Голод' : process.kind === 'epidemic' ? 'Эпидемия' : process.kind === 'revolt' ? 'Волнения' : process.kind === 'blockade' ? 'Блокада' : 'Процесс';
  const subject = `${label} · ${process.name}`;
  if (pendingAt(state, subject)) throw new Error(`${subject}: уже ждёт решения`);
  return {
    id: `sim-${timeEventId}-${process.id}`, scale: 'settlement', subject, was, now, cause,
    causeId: timeEventId, status: 'pending', patch: { kind: 'process', process },
  };
}

/** Starts starvation only for a settlement with a known population and an explicitly recorded empty food stock. */
export function famineProposal(state: State, locationId: string, timeEventId: string, initialOrder?: number, capitalOrder?: FamineCapitalOrder): WorldDelta {
  const location = settlement(state, locationId);
  if (!Number.isSafeInteger(location.population) || (location.population ?? 0) < 1) throw new Error('для голода нужно известное население поселения');
  if (typeof location.stock?.food !== 'number' || location.stock.food > 0) throw new Error('голод можно начать, когда в кампании явно записан нулевой запас еды');
  const order = location.order ?? initialOrder;
  if (!Number.isSafeInteger(order) || (order ?? -1) < 0 || (order ?? 11) > 10) throw new Error('для голода задайте явный порядок поселения от 0 до 10');
  if (activeAt(state, 'famine', locationId)) throw new Error(`голод в ${location.name} уже идёт`);
  const campaignOrder = capitalOrder && state.world.kingdomOrder?.[capitalOrder.kingdomId];
  if (campaignOrder && pendingKingdomOrder(state, capitalOrder!.kingdomId)) {
    throw new Error('сначала разрешите ожидающее изменение порядка столицы в державе');
  }
  const nextCampaignOrder = campaignOrder && Math.max(0, campaignOrder.value - 1);
  const process: Process = {
    id: processId('famine', locationId, state.time.sec), kind: 'famine', name: location.name, scale: 'settlement', stage: 'shortage',
    parties: [location.id], at: location.id, startedSec: state.time.sec, nextSec: state.time.sec + tickInterval(state, { at: location.id }),
    vars: { emptyDays: 0 }, data: { version: 1, kind: 'famine', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.famineSource } satisfies FamineData,
    causeId: timeEventId,
  };
  const delta = proposal(state, process, 'голод не отмечен', tickInterval(state, process) === DAY ? 'первый такт завтра' : 'первый такт через 10 дней', URBAN_RULES.famineSource, timeEventId);
  const patches: WorldPatch[] = [];
  if (location.order === undefined) patches.push({ kind: 'order', id: location.id, value: order! });
  if (campaignOrder && nextCampaignOrder !== undefined && nextCampaignOrder !== campaignOrder.value) {
    patches.push({ kind: 'kingdomOrder', kingdomId: capitalOrder!.kingdomId, value: nextCampaignOrder,
      source: `${URBAN_RULES.capitalFamineSource} · столица ${location.name} · −1 при начале голода · ${URBAN_RULES.version}` });
    delta.now += `; порядок державы ${capitalOrder!.kingdomId}: ${campaignOrder.value} → ${nextCampaignOrder}`;
    delta.cause += `; голод в подтверждённой столице снижает порядок державы на 1 (${URBAN_RULES.capitalFamineSource})`;
  }
  patches.push({ kind: 'process', process });
  delta.patch = patches.length === 1 ? patches[0]! : { kind: 'batch', patches };
  return delta;
}

/** Resolves a capital only from one exact, year-valid catalog match; missing/ambiguous data stays unknown. */
export function famineCapitalOrderFor(
  state: State,
  locationId: string,
  kingdoms: readonly FamineCapitalCandidate[],
  year: number,
): FamineCapitalOrder | undefined {
  const placeRef = state.world.locations[locationId]?.ref;
  const placeId = placeRef?.startsWith('place:') ? placeRef.slice('place:'.length) : undefined;
  if (!placeId || !Number.isSafeInteger(year)) return undefined;
  const matches = kingdoms.filter(kingdom => kingdom.capitalPlace === placeId
    && (kingdom.founded === undefined || kingdom.founded <= year)
    && (kingdom.dissolved === undefined || kingdom.dissolved > year));
  return matches.length === 1 ? { kingdomId: matches[0]!.id } : undefined;
}

/** A revolt only removes a settlement from a uniquely evidenced, dated catalog membership. */
export function revoltSecessionFor(
  state: State,
  locationId: string,
  kingdoms: readonly RevoltKingdomCandidate[],
  year: number,
  atSec: number,
): WorldPatch | undefined {
  const location = state.world.locations[locationId];
  const placeId = location?.ref?.startsWith('place:') ? location.ref.slice('place:'.length) : undefined;
  if (!location || !placeId || (location.order ?? 11) > 4 || state.world.settlementPolity?.[locationId]
    || state.world.territoryControl?.[placeId]) return undefined;
  const selfPolities = kingdoms.filter(kingdom => kingdom.capitalPlace === placeId || kingdom.place === placeId);
  if (selfPolities.length) return undefined;
  const members = kingdoms.filter(kingdom => kingdom.places?.includes(placeId)
    && (kingdom.founded === undefined || kingdom.founded <= year)
    && (kingdom.dissolved === undefined || kingdom.dissolved > year));
  if (members.length !== 1) return undefined;
  const former = members[0]!;
  const value: SettlementPolityRecord = {
    status: 'independent', separatedFrom: { kingdomId: former.id, kingdomName: former.name }, atSec,
    source: `${URBAN_RULES.revoltSource}; §4.3.3: successful revolt removes a city from the uniquely matching polity's places; ${URBAN_RULES.version}`,
  };
  return { kind: 'settlementPolity', locationId, value };
}

export interface EpidemicTreatment { temples: number; perDay: number; source: string }

/** Count only dated church records whose listed base and deity both match the place's faith record. */
export function confirmedTempleTreatment(
  placeId: string | undefined,
  year: number,
  organizations: Iterable<Organization> | undefined,
  faiths: Readonly<Record<string, PlaceFaith>> | undefined,
): EpidemicTreatment {
  const faithDeities = new Set(placeId ? faiths?.[placeId]?.deities ?? [] : []);
  const temples = organizations && placeId && Number.isSafeInteger(year)
    ? new Set([...organizations].filter(org => org.church === true && org.places?.includes(placeId)
      && orgExistsIn(org, year) && org.deities?.some(deity => faithDeities.has(deity))).map(org => org.id)).size
    : 0;
  const perDay = temples * URBAN_RULES.templeTreatmentPerDay;
  const coverage = organizations && faiths ? `${temples} подтверждённых храмов` : 'данные храмов недоступны';
  return {
    temples, perDay,
    source: `${URBAN_RULES.treatmentSource}; ${coverage}; лечение ${perDay} чел./день`,
  };
}

/** Creates a deterministic aggregate outbreak proposal; only the GM supplies initial cases and the chosen R0. */
export function epidemicProposal(
  state: State,
  locationId: string,
  initialCases: number,
  r0: number,
  timeEventId: string,
  treatment: EpidemicTreatment = { temples: 0, perDay: 0, source: `${URBAN_RULES.treatmentSource}; данные храмов не подключены` },
): WorldDelta {
  const location = settlement(state, locationId);
  const population = location.population;
  if (typeof population !== 'number' || !Number.isSafeInteger(population) || population < 1) throw new Error('для эпидемии нужно известное население поселения');
  if (!Number.isSafeInteger(initialCases) || initialCases < 1 || initialCases >= population) throw new Error('начальные случаи должны быть целым числом от 1 до населения − 1');
  if (!Number.isFinite(r0) || r0 < URBAN_RULES.minR0 || r0 > URBAN_RULES.maxR0) throw new Error(`R₀ — правило стола от ${URBAN_RULES.minR0} до ${URBAN_RULES.maxR0}`);
  if (!Number.isSafeInteger(treatment.temples) || treatment.temples < 0 || !Number.isSafeInteger(treatment.perDay)
    || treatment.perDay !== treatment.temples * URBAN_RULES.templeTreatmentPerDay || !treatment.source.trim()) {
    throw new Error('мощность лечения требует неотрицательное число храмов и источник');
  }
  if (activeAt(state, 'epidemic', locationId)) throw new Error(`эпидемия в ${location.name} уже идёт`);
  const process: Process = {
    id: processId('epidemic', locationId, state.time.sec), kind: 'epidemic', name: location.name, scale: 'settlement', stage: 'outbreak',
    parties: [location.id], at: location.id, startedSec: state.time.sec, nextSec: state.time.sec + tickInterval(state, { at: location.id }),
    vars: {
      population, initialPopulation: population, susceptible: population - initialCases, infected: initialCases,
      recovered: 0, dead: 0, r0, days: 0, incubating1: 0, incubating2: 0, incubating3: 0, incubating4: 0,
    },
    data: {
      version: 1, kind: 'epidemic', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.epidemicSource,
      disease: 'Sewer Plague', diseaseDc: URBAN_RULES.diseaseDc,
      treatmentPerDay: treatment.perDay, treatmentTemples: treatment.temples, treatmentSource: treatment.source,
    } satisfies EpidemicData,
    causeId: timeEventId,
  };
  const delta = proposal(
    state, process, 'вспышка не зарегистрирована',
    `Sewer Plague · ${initialCases} исходных случаев · подтверждено храмов: ${treatment.temples}, лечение ${treatment.perDay}/день`,
    URBAN_RULES.epidemicSource, timeEventId,
  );
  delta.cause += `; ${treatment.source}`;
  return delta;
}

/** A successful caravan carries one exposed case; the process is merged only when the arrival proposal is accepted. */
export function epidemicExposurePatch(
  state: State,
  locationId: string,
  exposure: EpidemicExposure,
  r0: number,
  atSec: number,
  locationOverride?: Location,
): WorldPatch | undefined {
  const location = state.world.locations[locationId] ?? locationOverride;
  const population = location?.population;
  if (!location || location.scale !== 'settlement' || !Number.isSafeInteger(population) || (population ?? 0) < 2) return undefined;
  const incubating = [1, 2, 3, 4].map(days => exposure.incubationDays === days ? 1 : 0);
  const infectiousNow = exposure.incubationDays === 0 ? 1 : 0;
  const template: Process = {
    id: `proc-epidemic-${location.id}-${exposure.id}`, kind: 'epidemic', name: location.name, scale: 'settlement',
    stage: infectiousNow ? 'outbreak' : 'incubation', parties: [location.id], at: location.id,
    startedSec: atSec, nextSec: atSec + tickInterval(state, { at: location.id }),
    vars: {
      population: population!, initialPopulation: population!, susceptible: population! - 1, infected: infectiousNow,
      recovered: 0, dead: 0, r0, days: 0, incubating1: incubating[0]!, incubating2: incubating[1]!,
      incubating3: incubating[2]!, incubating4: incubating[3]!,
    },
    data: {
      version: 1, kind: 'epidemic', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.epidemicSource,
      disease: 'Sewer Plague', diseaseDc: URBAN_RULES.diseaseDc,
      treatmentPerDay: exposure.treatmentPerDay, treatmentTemples: exposure.treatmentTemples,
      treatmentSource: exposure.treatmentSource, exposureIds: [exposure.id],
    } satisfies EpidemicData,
    causeId: exposure.id,
  };
  return { kind: 'epidemicExposure', locationId, exposure, template };
}

/** Explicitly activates a campaign settlement as a faction that can hold city relations. */
export function cityFactionProposal(state: State, locationId: string, timeEventId: string): WorldDelta {
  const location = settlement(state, locationId);
  if (!location.ref?.startsWith('place:')) throw new Error('для городской фракции нужна ссылка на место справочника');
  if (Object.values(state.world.factions).some(faction => faction.ref === location.ref)
    || Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.patch?.kind === 'newFaction' && delta.patch.faction.ref === location.ref)) {
    throw new Error(`${location.name} уже представлено фракцией кампании или ждёт принятия`);
  }
  if (!timeEventId.trim()) throw new Error('укажите причину добавления городской фракции');
  const placeId = location.ref.slice('place:'.length);
  const plan = planReferenceActivation(state, { kind: 'faction', reference: location.ref, name: location.name });
  if (plan.kind !== 'faction' || !plan.patch) throw new Error(`${location.name} уже представлено фракцией кампании`);
  const subject = `Городская фракция · ${location.name}`;
  if (pendingAt(state, subject)) throw new Error(`${subject}: уже ждёт решения`);
  return {
    id: `sim-${timeEventId}-city-faction-${placeId}`, scale: 'settlement', subject,
    was: 'город не представлен фракцией кампании', now: 'город активирован как фракция кампании',
    cause: 'явное подключение мастером · research/world-models.md §4.3.1',
    causeId: timeEventId, status: 'pending', patch: plan.patch,
  };
}

export interface CityTradeFlow { relation?: number; multiplier: 0.5 | 1 | 1.5; blocked: boolean }

/** City relation effects apply only when both endpoints were explicitly activated as campaign factions. */
export function cityTradeFlow(state: State, fromPlaceId: string, toPlaceId: string): CityTradeFlow {
  const a = Object.values(state.world.factions).find(faction => faction.ref === `place:${fromPlaceId}`);
  const b = Object.values(state.world.factions).find(faction => faction.ref === `place:${toPlaceId}`);
  if (!a || !b || a.id === b.id) return { multiplier: 1, blocked: false };
  const relation = a.relations?.[b.id] ?? b.relations?.[a.id] ?? 0;
  return { relation, multiplier: relation >= 2 ? 1.5 : relation === -2 ? 0.5 : 1, blocked: relation === -3 };
}

/** Changes the symmetric campaign relation only after the master's pending proposal is accepted. */
export function factionRelationProposal(state: State, factionAId: string, factionBId: string, value: number, timeEventId: string): WorldDelta {
  const a = state.world.factions[factionAId];
  const b = state.world.factions[factionBId];
  if (!a || !b) throw new Error('выберите две фракции кампании');
  if (a.id === b.id) throw new Error('отношение фракции к самой себе не ведётся');
  if (!Number.isInteger(value) || value < -3 || value > 3) throw new Error('отношение должно быть целым числом от −3 до +3');
  if (!timeEventId.trim()) throw new Error('укажите причину изменения отношений');
  const [first, second] = [a, b].sort((x, y) => x.id.localeCompare(y.id));
  const subject = `Отношения · ${first.name} — ${second.name}`;
  if (pendingAt(state, subject)) throw new Error(`${subject}: уже ждёт решения`);
  const was = state.world.factions[first.id]?.relations?.[second.id] ?? 0;
  if (was === value) throw new Error('отношение уже имеет это значение');
  const patches: WorldPatch[] = [{ kind: 'relation', id: first.id, other: second.id, value }];
  const firstPlaceId = first.ref?.startsWith('place:') ? first.ref.slice('place:'.length) : undefined;
  const secondPlaceId = second.ref?.startsWith('place:') ? second.ref.slice('place:'.length) : undefined;
  const firstLocation = firstPlaceId ? Object.values(state.world.locations).find(location => location.scale === 'settlement' && location.ref === first.ref) : undefined;
  const secondLocation = secondPlaceId ? Object.values(state.world.locations).find(location => location.scale === 'settlement' && location.ref === second.ref) : undefined;
  const pair = [first.id, second.id].sort() as [string, string];
  const samePair = (candidate: Process) => {
    const data = candidate.data as { kind?: string; relationFactions?: readonly string[] } | undefined;
    return candidate.kind === 'blockade' && !candidate.ended && data?.kind === 'blockade'
      && data.relationFactions?.slice().sort().join('|') === pair.join('|');
  };
  const activeRelationBlockade = Object.values(state.world.processes ?? {}).find(samePair);
  if (value === -3 && firstPlaceId && secondPlaceId && firstLocation && secondLocation && !activeRelationBlockade) {
    const process: Process = {
      id: `proc-blockade-rel-${pair[0]}-${pair[1]}-${state.time.sec}`,
      kind: 'blockade', name: `${first.name} — ${second.name}`, scale: 'region', stage: 'active',
      parties: pair, at: firstLocation.id, startedSec: state.time.sec, nextSec: state.time.sec + TENDAY,
      vars: { blockedTendays: 0, foodEquilibriumLoss: 0 },
      data: {
        version: 1, kind: 'blockade', ruleVersion: URBAN_RULES.version,
        ruleSource: `${URBAN_RULES.relationSource}; relation −3 between two activated city factions`,
        targetPlaceId: firstPlaceId, relationFactions: pair, relationPlaces: [firstPlaceId, secondPlaceId],
      } satisfies BlockadeData,
      causeId: timeEventId,
    };
    patches.push({ kind: 'process', process });
  } else if (was === -3 && value > -3 && activeRelationBlockade) {
    patches.push({ kind: 'process', process: { ...activeRelationBlockade, stage: 'ended', ended: true, nextSec: state.time.sec } });
    const blockadeData = activeRelationBlockade.data as unknown as BlockadeData;
    for (const caravan of Object.values(state.world.processes ?? {})) {
      if (caravan.kind !== 'caravan' || caravan.ended || caravan.vars.blockedByRelation !== 1) continue;
      const route = caravan.data as { fromPlace?: string; toPlace?: string; route?: { nodes?: readonly string[] } } | undefined;
      if (!route || [route.fromPlace, route.toPlace].sort().join('|') !== blockadeData.relationPlaces?.slice().sort().join('|')) continue;
      const vars = { ...caravan.vars };
      delete (vars as Record<string, number>).blockedByRelation;
      const remainsClosed = route.route?.nodes?.some(placeId => isPlaceBlockaded(state, placeId) || isWarFrontPlace(state, placeId));
      if (remainsClosed) {
        patches.push({ kind: 'process', process: { ...caravan, stage: 'blocked', nextSec: Number.MAX_SAFE_INTEGER, vars } });
      } else {
        delete (vars as Record<string, number>).blockedRouteIndex;
        patches.push({ kind: 'process', process: { ...caravan, stage: 'transit', nextSec: state.time.sec + DAY, vars } });
      }
    }
  }
  return {
    id: `sim-${timeEventId}-relation-${first.id}-${second.id}`,
    scale: 'continent', subject, was: String(was), now: String(value),
    cause: 'ручное изменение мастером · research/world-models.md §4.3.1 (правило стола)',
    causeId: timeEventId, status: 'pending',
    patch: patches.length === 1 ? patches[0] : { kind: 'batch', patches },
  };
}

function famineData(p: Process): FamineData | null {
  const d = p.data;
  return d?.kind === 'famine' && d.version === 1 && supportedRuleVersion(d.ruleVersion) ? d as unknown as FamineData : null;
}
function epidemicData(p: Process): EpidemicData | null {
  const d = p.data;
  return d?.kind === 'epidemic' && d.version === 1 && supportedRuleVersion(d.ruleVersion) ? d as unknown as EpidemicData : null;
}
function revoltData(p: Process): RevoltData | null {
  const d = p.data;
  return d?.kind === 'revolt' && d.version === 1 && supportedRuleVersion(d.ruleVersion) ? d as unknown as RevoltData : null;
}
const legacyUrbanProcess = (p: Process) => p.data?.ruleVersion === 'dm-cockpit-urban/1';
const placeOf = (state: State, p: Process) => p.at ? state.world.locations[p.at] : undefined;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function tickFamine(p: Process, ctx: TickContext): TickResult {
  if (!famineData(p)) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия модели голода' };
  const location = placeOf(ctx.state, p);
  if (!location) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'поселение голода больше не найдено' };
  if ((location.stock?.food ?? -1) >= 10) return { process: { ...p, ended: true, stage: 'relieved' }, line: `голод в ${location.name} прекращён: запас восстановлен до 10 дней` };
  if (location.order === undefined) return { process: { ...p, ended: true, stage: 'invalid' }, line: `голод в ${location.name} остановлен: порядок поселения не записан` };
  if (legacyUrbanProcess(p)) {
    const population = location.population ?? 0;
    const loss = population > 0 ? Math.max(1, Math.round(population * URBAN_RULES.faminePopulationLoss)) : 0;
    const nextPopulation = Math.max(0, population - loss);
    const order = Math.max(0, location.order - URBAN_RULES.famineOrderLoss);
    const emptyTendays = (p.vars.emptyTendays ?? 0) + 1;
    return {
      process: { ...p, nextSec: ctx.sec + TENDAY, vars: { ...p.vars, emptyTendays } },
      patches: [{ kind: 'population', id: location.id, value: nextPopulation }, { kind: 'order', id: location.id, value: order }],
      line: `десятидневка ${emptyTendays} без еды: порядок ${location.order} → ${order}, население ${population} → ${nextPopulation}`,
    };
  }
  const interval = tickInterval(ctx.state, p);
  const previousDays = p.vars.emptyDays ?? 0;
  const elapsedDays = previousDays + (interval === DAY ? 1 : 10);
  const impacts = Math.floor(elapsedDays / 10) - Math.floor(previousDays / 10);
  if (!impacts) {
    return { process: { ...p, nextSec: ctx.sec + interval, vars: { ...p.vars, emptyDays: elapsedDays } }, line: `день ${elapsedDays} без еды в ${location.name}` };
  }
  const population = location.population ?? 0;
  const loss = population > 0 ? Math.max(1, Math.round(population * URBAN_RULES.faminePopulationLoss * impacts)) : 0;
  const nextPopulation = Math.max(0, population - loss);
  const order = Math.max(0, location.order - URBAN_RULES.famineOrderLoss * impacts);
  const patches: WorldPatch[] = [
    { kind: 'population', id: location.id, value: nextPopulation },
    { kind: 'order', id: location.id, value: order },
  ];
  return {
    process: { ...p, nextSec: ctx.sec + interval, vars: { ...p.vars, emptyDays: elapsedDays } }, patches,
    line: `${impacts} десятидневка(и) без еды: порядок ${location.order} → ${order}, население ${population} → ${nextPopulation}`,
  };
}

function tickEpidemic(p: Process, ctx: TickContext): TickResult {
  const data = epidemicData(p);
  if (!data) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия модели эпидемии' };
  const loc = placeOf(ctx.state, p);
  if (!loc) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'поселение эпидемии больше не найдено' };
  if (data.ruleVersion === URBAN_RULES.version) return tickEpidemicV3(p, ctx, loc, data);
  let population = Math.max(0, p.vars.population ?? 0);
  let susceptible = Math.max(0, p.vars.susceptible ?? 0);
  let infected = Math.max(0, p.vars.infected ?? 0);
  let recovered = Math.max(0, p.vars.recovered ?? 0);
  let dead = Math.max(0, p.vars.dead ?? 0);
  const gamma = 1 / URBAN_RULES.diseaseRecoveryDays;
  const beta = (p.vars.r0 ?? URBAN_RULES.minR0) * gamma;
  const interval = legacyUrbanProcess(p) ? DAY : tickInterval(ctx.state, p);
  const days = interval === DAY ? 1 : 10;
  for (let day = 0; day < days && infected >= 0.5 && population > 0; day++) {
    const newInfections = Math.min(susceptible, beta * susceptible * infected / Math.max(1, population));
    const newlyRecovered = Math.min(infected, gamma * infected);
    const newlyDead = newlyRecovered * URBAN_RULES.diseaseMortality;
    susceptible = Math.max(0, susceptible - newInfections);
    infected = Math.max(0, infected + newInfections - newlyRecovered);
    recovered += newlyRecovered - newlyDead;
    dead = Math.min(population, dead + newlyDead);
    population = Math.max(0, population - newlyDead);
  }
  const nextSusceptible = round3(susceptible);
  const nextInfected = round3(infected);
  const nextRecovered = round3(recovered);
  const nextDead = round3(dead);
  const nextPopulation = Math.max(0, Math.round((loc.population ?? (p.vars.population ?? 0)) - (nextDead - (p.vars.dead ?? 0))));
  const vars = {
    ...p.vars, population: round3(population), susceptible: nextSusceptible, infected: nextInfected,
    recovered: nextRecovered, dead: nextDead, days: (p.vars.days ?? 0) + days,
  };
  const ended = nextInfected < 0.5 || vars.population <= 0;
  return {
    process: { ...p, stage: ended ? 'ended' : 'outbreak', ended, nextSec: ctx.sec + interval, vars },
    patches: nextPopulation !== loc.population ? [{ kind: 'population', id: loc.id, value: nextPopulation }] : [],
    line: `${dataLabel(p)} · день ${vars.days}: болеют ${Math.round(nextInfected)}, переболели ${Math.round(nextRecovered)}, умерли ${Math.round(nextDead)}`,
  };
}

/** Version 3 separates the 1d4 latent period, five infectious days and treatment capacity. */
function tickEpidemicV3(p: Process, ctx: TickContext, loc: Location, data: EpidemicData): TickResult {
  let population = Math.max(0, p.vars.population ?? 0);
  let susceptible = Math.max(0, p.vars.susceptible ?? 0);
  let infected = Math.max(0, p.vars.infected ?? 0);
  let recovered = Math.max(0, p.vars.recovered ?? 0);
  let dead = Math.max(0, p.vars.dead ?? 0);
  const incubating = [1, 2, 3, 4].map(days => Math.max(0, p.vars[`incubating${days}`] ?? 0));
  const r0 = p.vars.r0 ?? URBAN_RULES.minR0;
  const beta = r0 / URBAN_RULES.diseaseInfectiousDays;
  const naturalRecovery = 1 / URBAN_RULES.diseaseInfectiousDays;
  const treatmentPerDay = Math.max(0, data.treatmentPerDay ?? 0);
  const interval = tickInterval(ctx.state, p);
  const days = interval === DAY ? 1 : 10;
  let treatedTotal = 0;
  for (let day = 0; day < days && population > 0; day++) {
    const newlySymptomatic = incubating[0]!;
    incubating[0] = incubating[1]!;
    incubating[1] = incubating[2]!;
    incubating[2] = incubating[3]!;
    incubating[3] = 0;
    infected += newlySymptomatic;

    const newInfections = Math.min(susceptible, beta * susceptible * infected / Math.max(1, population));
    susceptible = Math.max(0, susceptible - newInfections);
    for (let i = 0; i < incubating.length; i++) incubating[i] += newInfections / 4;

    const treated = Math.min(infected, treatmentPerDay);
    treatedTotal += treated;
    infected = Math.max(0, infected - treated);
    recovered += treated;
    const newlyRecovered = Math.min(infected, naturalRecovery * infected);
    const newlyDead = newlyRecovered * URBAN_RULES.diseaseMortality;
    infected = Math.max(0, infected - newlyRecovered);
    recovered += newlyRecovered - newlyDead;
    dead = Math.min(population, dead + newlyDead);
    population = Math.max(0, population - newlyDead);
  }
  const rounded = (value: number) => round3(value);
  const nextSusceptible = rounded(susceptible);
  const nextInfected = rounded(infected);
  const nextRecovered = rounded(recovered);
  const nextDead = rounded(dead);
  const nextIncubating = incubating.map(rounded);
  const nextPopulation = Math.max(0, Math.round((loc.population ?? (p.vars.population ?? 0)) - (nextDead - (p.vars.dead ?? 0))));
  const vars = {
    ...p.vars, population: rounded(population), susceptible: nextSusceptible, infected: nextInfected,
    recovered: nextRecovered, dead: nextDead, days: (p.vars.days ?? 0) + days,
    incubating1: nextIncubating[0]!, incubating2: nextIncubating[1]!, incubating3: nextIncubating[2]!, incubating4: nextIncubating[3]!,
  };
  const exposed = nextIncubating.reduce((sum, cases) => sum + cases, 0);
  const ended = nextInfected < 0.5 && exposed < 0.5 || vars.population <= 0;
  const patches: WorldPatch[] = nextPopulation !== loc.population ? [{ kind: 'population', id: loc.id, value: nextPopulation }] : [];
  return {
    process: { ...p, stage: ended ? 'ended' : nextInfected >= 0.5 ? 'outbreak' : 'incubation', ended, nextSec: ctx.sec + interval, vars },
    patches,
    line: `${data.disease} · день ${vars.days}: инкубация ${Math.round(exposed)}, болеют ${Math.round(nextInfected)}, переболели ${Math.round(nextRecovered)}, умерли ${Math.round(nextDead)}; храмы лечат ${Math.round(treatedTotal)} из ${treatmentPerDay}/день`,
  };
}
function dataLabel(p: Process): string { return epidemicData(p)?.disease ?? 'эпидемия'; }

function spawnRevolts(state: State, sec: number): readonly Process[] {
  return Object.values(state.world.locations).flatMap(location => {
    if (location.scale !== 'settlement' || location.order === undefined || location.order > 2 || (location.population ?? 0) < 1) return [];
    if (activeAt(state, 'revolt', location.id)) return [];
    if (Object.values(state.world.processes ?? {}).some(p => p.kind === 'revolt' && p.at === location.id
      && ['revolt', 'suppressed', 'authority-changed'].includes(p.stage))) return [];
    return [{
      id: processId('revolt', location.id, sec), kind: 'revolt', name: location.name, scale: 'settlement', stage: 'unrest',
      parties: [location.id], at: location.id, startedSec: sec, nextSec: sec + TENDAY,
      vars: { tries: 0, order: location.order },
      data: { version: 1, kind: 'revolt', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.revoltSource } satisfies RevoltData,
    }];
  });
}
function tickRevolt(p: Process, ctx: TickContext, kingdoms: readonly RevoltKingdomCandidate[] = []): TickResult {
  const data = revoltData(p);
  if (!data) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия модели восстания' };
  const location = placeOf(ctx.state, p);
  if (!location) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'поселение восстания больше не найдено' };
  if (location.order === undefined) return { process: { ...p, ended: true, stage: 'invalid' }, line: `волнения в ${location.name} остановлены: порядок поселения не записан` };
  const order = location.order;
  if (p.stage === 'revolt') {
    const garrison = Math.floor((location.population ?? 0) * URBAN_RULES.revoltGarrisonShare);
    const garrisonStrength = garrison > 0 ? Math.round(Math.max(0, Math.min(10, Math.log2(garrison / 100))) * 10) / 10 : 0;
    const garrisonRoll = ctx.roll('garrison');
    const garrisonTotal = garrisonRoll + URBAN_RULES.revoltGarrisonMultiplier * garrisonStrength;
    const garrisonDc = URBAN_RULES.revoltGarrisonTarget(order);
    const suppressed = garrisonTotal >= garrisonDc;
    const secession = !suppressed && data.ruleVersion === URBAN_RULES.version
      ? revoltSecessionFor(ctx.state, location.id, kingdoms, harptos(ctx.sec).year, ctx.sec)
      : undefined;
    const line = suppressed
      ? `восстание в ${location.name} подавлено: d20 ${garrisonRoll} + 2 × сила гарнизона ${garrisonStrength} = ${garrisonTotal} против Сл ${garrisonDc}`
      : secession
        ? `гарнизон ${location.name} уступил: d20 ${garrisonRoll} + 2 × сила ${garrisonStrength} = ${garrisonTotal} против Сл ${garrisonDc}; город вышел из состава ${secession.kind === 'settlementPolity' ? secession.value?.separatedFrom.kingdomName : 'державы'}`
        : `гарнизон ${location.name} уступил: d20 ${garrisonRoll} + 2 × сила ${garrisonStrength} = ${garrisonTotal} против Сл ${garrisonDc}; членство города не изменено: нет единственной подтверждённой державы для каскада`;
    return {
      process: {
        ...p,
        stage: suppressed ? 'suppressed' : 'authority-changed',
        ended: true,
        vars: { ...p.vars, garrison, garrisonStrength, garrisonRoll, garrisonTotal, garrisonDc },
      },
      ...(secession ? { patches: [secession] } : {}),
      line,
      summary: suppressed ? 'восстание подавлено' : secession ? 'город вышел из состава державы' : 'власть сменилась; членство державы не изменено',
    };
  }
  if (order > 2) return { process: { ...p, ended: true, stage: 'stabilized' }, line: `порядок в ${location.name} восстановлен` };
  const threshold = URBAN_RULES.revoltThreshold(order);
  const roll = ctx.roll('revolt');
  const tries = (p.vars.tries ?? 0) + 1;
  if (roll <= threshold) {
    const patches: WorldPatch[] = [
      { kind: 'location', id: location.id, field: 'danger', value: 'high' },
      { kind: 'location', id: location.id, field: 'pricePercent', value: (location.pricePercent ?? 0) + 15 },
    ];
    return {
      process: { ...p, stage: 'revolt', ended: legacyUrbanProcess(p), nextSec: legacyUrbanProcess(p) ? ctx.sec : ctx.sec + TENDAY, vars: { ...p.vars, tries, roll, threshold } },
      patches, line: `вспыхнуло восстание в ${location.name}: d20 ${roll} ≤ ${threshold}; опасность высокая, индекс цен +15%`,
    };
  }
  return { process: { ...p, nextSec: ctx.sec + TENDAY, vars: { ...p.vars, tries, roll, threshold } }, line: `волнения в ${location.name}: d20 ${roll} > ${threshold}; попытка ${tries}` };
}

export const famineKind: ProcessKind = { kind: 'famine', label: 'Голод', stages: { shortage: 'нехватка еды', relieved: 'завершён', invalid: 'ошибка данных' }, tick: tickFamine };
export const epidemicKind: ProcessKind = { kind: 'epidemic', label: 'Эпидемия', stages: { outbreak: 'вспышка', ended: 'завершена', invalid: 'ошибка данных' }, tick: tickEpidemic };
export const revoltKind = (kingdoms: readonly RevoltKingdomCandidate[] = []): ProcessKind => ({
  kind: 'revolt', label: 'Волнения',
  stages: { unrest: 'волнения', revolt: 'восстание', suppressed: 'подавлено', 'authority-changed': 'власть сменилась', stabilized: 'стабилизировано', invalid: 'ошибка данных' },
  spawn: spawnRevolts,
  tick: (process, ctx) => tickRevolt(process, ctx, kingdoms),
});

function siegeData(p: Process): SiegeData | null {
  const d = p.data;
  return d?.kind === 'siege' && d.version === 1 && supportedRuleVersion(d.ruleVersion)
    && typeof d.targetPlaceId === 'string' && typeof d.warProcessId === 'string' ? d as unknown as SiegeData : null;
}

/** A GM starts a siege only for a front settlement with an explicitly recorded food-days stock. */
export function siegeProposal(state: State, locationId: string, warProcessId: string, timeEventId: string): WorldDelta {
  const location = settlement(state, locationId);
  const targetPlaceId = location.ref?.startsWith('place:') ? location.ref.slice('place:'.length) : '';
  const war = warProcessId ? state.world.processes?.[warProcessId] : undefined;
  if (!targetPlaceId || !war || war.kind !== 'war' || war.ended || !warHasFrontPlace(war, targetPlaceId) || !isWarFrontPlace(state, targetPlaceId)) {
    throw new Error('осада требует поселение на активном фронте выбранной войны');
  }
  const foodStock = location.stock?.food;
  if (typeof foodStock !== 'number' || !Number.isFinite(foodStock) || foodStock <= 0) throw new Error('для осады нужен явно записанный запас еды больше нуля (в днях)');
  if (activeAt(state, 'siege', location.id)) throw new Error(`осада в ${location.name} уже идёт`);
  const process: Process = {
    id: processId('siege', location.id, state.time.sec), kind: 'siege', name: location.name, scale: 'settlement', stage: 'siege',
    parties: [war.id, location.id], at: location.id, startedSec: state.time.sec, nextSec: state.time.sec + DAY,
    vars: { foodDays: foodStock, elapsedDays: 0 },
    data: { version: 1, kind: 'siege', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.siegeSource, targetPlaceId, warProcessId: war.id } satisfies SiegeData,
    causeId: timeEventId,
  };
  return proposal(state, process, 'осада не отмечена', `осада · запас еды ${foodStock} дн.`, `${URBAN_RULES.siegeSource}; запас уменьшается на один food-day в день, торговое снабжение через фронт закрыто`, timeEventId);
}

function tickSiege(p: Process, ctx: TickContext): TickResult {
  const data = siegeData(p);
  if (!data) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия модели осады' };
  const location = placeOf(ctx.state, p);
  const war = ctx.state.world.processes?.[data.warProcessId];
  if (!location) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'поселение осады больше не найдено' };
  if (!war || war.ended || !isWarFrontPlace(ctx.state, data.targetPlaceId)) {
    return { process: { ...p, ended: true, stage: 'lifted' }, line: `осада ${location.name} снята: связанный фронт завершён` };
  }
  const food = location.stock?.food;
  if (!Number.isFinite(food)) return { process: { ...p, ended: true, stage: 'invalid' }, line: `осада ${location.name} остановлена: запас еды не записан` };
  if ((food ?? 0) <= 0) return { process: { ...p, ended: true, stage: 'exhausted' }, line: `запас еды в ${location.name} исчерпан; осада достигла предела снабжения` };
  const nextFood = Math.max(0, food! - 1);
  const elapsedDays = (p.vars.elapsedDays ?? 0) + 1;
  const exhausted = nextFood <= 0;
  return {
    process: { ...p, stage: exhausted ? 'exhausted' : 'siege', ended: exhausted, nextSec: ctx.sec + DAY, vars: { ...p.vars, foodDays: nextFood, elapsedDays } },
    patches: [{ kind: 'stock', id: location.id, goods: 'food', value: nextFood }],
    line: `осада · день ${elapsedDays}: запас еды ${food} → ${nextFood} дн.${exhausted ? '; запас исчерпан' : ''}`,
  };
}

export const siegeKind: ProcessKind = {
  kind: 'siege', label: 'Осада', stages: { siege: 'осада', exhausted: 'запас исчерпан', lifted: 'снята', invalid: 'ошибка данных' }, tick: tickSiege,
};

/** Active blockades stop new caravans and pause existing routes at the blocked settlement until the DM ends them. */
export function isPlaceBlockaded(state: State, placeId: string, exceptProcessId?: string): boolean {
  return Object.values(state.world.processes ?? {}).some(process => {
    const data = process.data;
    return process.id !== exceptProcessId && process.kind === 'blockade' && !process.ended && data?.kind === 'blockade'
      && data.version === 1 && !Array.isArray(data.relationFactions) && data.targetPlaceId === placeId;
  });
}

export function isCityTradeBlocked(state: State, fromPlaceId: string, toPlaceId: string): boolean {
  return cityTradeFlow(state, fromPlaceId, toPlaceId).blocked;
}

export function blockadeProposal(state: State, locationId: string, timeEventId: string, warProcessId?: string): WorldDelta {
  const location = settlement(state, locationId);
  const targetPlaceId = location.ref?.startsWith('place:') ? location.ref.slice('place:'.length) : '';
  if (!targetPlaceId) throw new Error('блокада маршрутов требует поселение со ссылкой на место карты');
  const war = warProcessId ? state.world.processes?.[warProcessId] : undefined;
  if (warProcessId && (!war || war.kind !== 'war' || war.ended)) throw new Error('для блокады нужна действующая война');
  if (isPlaceBlockaded(state, targetPlaceId)) throw new Error(`блокада ${location.name} уже действует`);
  const process: Process = {
    id: processId('blockade', location.id, state.time.sec), kind: 'blockade', name: location.name, scale: 'region', stage: 'active',
    parties: [location.id], at: location.id, startedSec: state.time.sec, nextSec: state.time.sec + TENDAY, vars: { blockedTendays: 0, foodEquilibriumLoss: 0 },
    data: {
      version: 1, kind: 'blockade', ruleVersion: URBAN_RULES.version,
      ruleSource: war ? 'manual blockade linked to an active war; front and route were chosen by the GM' : 'manual campaign process; relation threshold not inferred',
      targetPlaceId, ...(war ? { warProcessId: war.id } : {}),
    } satisfies BlockadeData,
    causeId: timeEventId,
  };
  const cause = war
    ? `мастер связал блокаду ${location.name} с войной «${war.name}»; точка выбрана вручную`
    : 'блокада введена мастером; автоматическая связь с отношениями фракций не выводится';
  return proposal(state, process, 'блокады нет', 'маршруты к поселению перекрыты', cause, timeEventId);
}

export function blockadeEndProposal(state: State, processIdValue: string, timeEventId: string): WorldDelta {
  const process = state.world.processes?.[processIdValue];
  if (!process || process.kind !== 'blockade' || process.ended || process.data?.kind !== 'blockade') throw new Error('действующая блокада не найдена');
  const data = process.data as unknown as BlockadeData;
  if (data.relationFactions) throw new Error('дипломатическую блокаду можно снять только изменением отношения выше −3');
  const ended: Process = { ...process, stage: 'ended', ended: true, nextSec: state.time.sec };
  const subject = `Блокада · ${process.name}`;
  if (pendingAt(state, subject)) throw new Error(`${subject}: уже ждёт решения`);
  const patches: WorldPatch[] = [{ kind: 'process', process: ended }];
  for (const caravan of Object.values(state.world.processes ?? {})) {
    if (caravan.kind !== 'caravan' || caravan.stage !== 'blocked' || caravan.ended) continue;
    const index = caravan.vars.blockedRouteIndex;
    const routeData = caravan.data?.route as { nodes?: readonly string[] } | undefined;
    const blockedNode = Number.isSafeInteger(index) ? routeData?.nodes?.[index!] : undefined;
    if (blockedNode !== data.targetPlaceId || isPlaceBlockaded(state, blockedNode, processIdValue)) continue;
    if (isWarFrontPlace(state, blockedNode)) continue;
    const caravanData = caravan.data as { fromPlace?: string; toPlace?: string } | undefined;
    const vars = { ...caravan.vars };
    if (caravanData?.fromPlace && caravanData.toPlace && isCityTradeBlocked(state, caravanData.fromPlace, caravanData.toPlace)) {
      vars.blockedByRelation = 1;
      patches.push({ kind: 'process', process: { ...caravan, stage: 'blocked', nextSec: Number.MAX_SAFE_INTEGER, vars } });
      continue;
    }
    delete (vars as Record<string, number>).blockedRouteIndex;
    delete (vars as Record<string, number>).blockedByRelation;
    patches.push({ kind: 'process', process: { ...caravan, stage: 'transit', nextSec: state.time.sec + DAY, vars } });
  }
  return {
    id: `sim-${timeEventId}-end-${process.id}`, scale: 'region', subject,
    was: 'маршруты перекрыты', now: 'блокада снята', cause: 'мастер завершил блокаду', causeId: timeEventId, status: 'pending', patch: { kind: 'batch', patches },
  };
}

export const blockadeKind: ProcessKind = {
  kind: 'blockade', label: 'Блокада', stages: { active: 'действует', ended: 'снята' },
  tick: (process, ctx) => {
    const data = process.data as unknown as BlockadeData | undefined;
    if (!data || data.kind !== 'blockade' || data.version !== 1 || !supportedRuleVersion(data.ruleVersion)) {
      return { process: { ...process, stage: 'invalid', ended: true }, line: 'неподдерживаемая версия блокады' };
    }
    if (data.relationFactions) {
      const [aId, bId] = data.relationFactions;
      const relation = ctx.state.world.factions[aId]?.relations?.[bId] ?? 0;
      if (relation > -3) return { process: { ...process, stage: 'ended', ended: true }, line: `блокада снята: отношение поднялось до ${relation}` };
    }
    const blockedTendays = (process.vars.blockedTendays ?? 0) + 1;
    const foodEquilibriumLoss = (process.vars.foodEquilibriumLoss ?? 0) + 1;
    return {
      process: { ...process, nextSec: ctx.sec + TENDAY, vars: { ...process.vars, blockedTendays, foodEquilibriumLoss } },
      line: `блокада · ${blockedTendays}-я десятидневка: равновесие еды города снижено на ${foodEquilibriumLoss}`,
    };
  },
};
