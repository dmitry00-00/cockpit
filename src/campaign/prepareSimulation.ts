// Асинхронная граница перед любым действием, которое двигает мировое время. UI импортирует этот модуль лениво;
// код и данные каравана остаются в отдельном чанке, а stepTime после подготовки остаётся синхронным и детерминированным.
import type { State, WorldDelta } from '../engine/state';
import { registerProcessKind } from './processes';
import type { CaravanPlaceOption, CaravanRequestInput, CaravanRouteOptions, CaravanRoutePreview, TradeLineRequestInput } from './caravan';
import type { WarOrder, WarOutcome, WarPartyOption, WarSettlementTerritoryTerms } from './war';
import type { WarFrontPreview } from './warFront';
import type { RumorRequestInput, RumorRoutePreview } from './rumor';
import { l8WarStrengthCandidates } from './l8Military';

export interface PreparedSimulation {
  ready: boolean;
  /** Valid campaign place IDs backed by the loaded route graph. */
  caravanPlaces: () => readonly CaravanPlaceOption[];
  /** Route preview is pure; errors keep a user-readable reason. */
  previewCaravanRoute: (from: string, to: string, options?: CaravanRouteOptions) => CaravanRoutePreview;
  /** Returns a pending proposal only; caller writes it to the event log explicitly. */
  proposeCaravan: (state: State, input: CaravanRequestInput) => WorldDelta | null;
  /** Creates a reversible repeating trade schedule; cargo only moves on accepted scheduled departures. */
  proposeTradeLine: (state: State, input: TradeLineRequestInput) => WorldDelta;
  /** Stops future scheduled departures through an ordinary reversible process patch. */
  endTradeLine: (state: State, processId: string, timeEventId: string) => WorldDelta;
  /** Первая демонстрационная торговая цепочка; её вызов только возвращает предложение, не меняет мир. */
  waterdeepToNeverwinter: (state: State, timeEventId: string) => WorldDelta | null;
  /** Субъекты справочника с source-backed подсказкой начальной силы, если хватает данных на выбранный год. */
  warParties: (year: number) => readonly WarPartyOption[];
  /** Graph-backed places owned by a kingdom; capitals sort first when available. */
  warPlaces: (kingdomId: string, year: number) => readonly CaravanPlaceOption[];
  /** Pure walking-route preview between two linked kingdom places. */
  previewWarFront: (sideA: string, sideB: string, year: number, fromPlace?: string, toPlace?: string) => WarFrontPreview;
  /** Returns a pending war process proposal; does not mutate campaign state. */
  proposeWar: (state: State, order: WarOrder, timeEventId: string) => WorldDelta;
  /** Proposes a GM-authored settlement with optional explicit place-by-place territory terms. */
  proposeWarSettlement: (state: State, processId: string, outcome: WarOutcome, timeEventId: string, territoryTerms?: WarSettlementTerritoryTerms) => WorldDelta;
  /** Records a campaign-only territory control override on the chosen war front node. */
  proposeWarTerritory: (state: State, processId: string, placeId: string, controllerId: string | null, timeEventId: string) => WorldDelta;
  /** Gazetteer places suitable for a rumor route. */
  rumorPlaces: () => readonly CaravanPlaceOption[];
  /** Pure land-route preview for a rumor; speed remains an explicit table rule. */
  previewRumorRoute: (from: string, to: string, checkpoints?: readonly string[]) => RumorRoutePreview | null;
  /** Creates a pending route proposal; the rumor text stays out of player facts until accepted on arrival. */
  proposeRumor: (state: State, input: RumorRequestInput) => WorldDelta;
  /** Starts a manually authored famine process for a settlement with an explicit zero food stock. */
  proposeFamine: (state: State, locationId: string, timeEventId: string, initialOrder?: number) => WorldDelta;
  /** Starts a source-labeled aggregate Sewer Plague outbreak with GM-entered cases and R0. */
  proposeEpidemic: (state: State, locationId: string, initialCases: number, r0: number, timeEventId: string) => WorldDelta;
  proposeCityFaction: (state: State, locationId: string, timeEventId: string) => WorldDelta;
  proposeFactionRelation: (state: State, factionAId: string, factionBId: string, value: number, timeEventId: string) => WorldDelta;
  proposeBlockade: (state: State, locationId: string, timeEventId: string, warProcessId?: string) => WorldDelta;
  proposeSiege: (state: State, locationId: string, warProcessId: string, timeEventId: string) => WorldDelta;
  endBlockade: (state: State, processId: string, timeEventId: string) => WorldDelta;
}

let prepared: Promise<PreparedSimulation> | null = null;

/** Граф/экономика загружаются до TIME_ADVANCED; отсутствие графа только отключает процессы караванов. */
export function prepareSimulation(): Promise<PreparedSimulation> {
  prepared ??= Promise.all([import('./war'), import('./warFront'), import('../world/kingdoms'), import('./caravan'), import('./rumor'), import('./urban'), import('./cosmic'), import('../../research/simulation/l8-pilot-review.json').catch(() => null)]).then(async ([war, warFront, kingdomModule, caravan, rumor, urban, cosmic, l8PilotModule]) => {
    registerProcessKind(war.warKind);
    registerProcessKind(rumor.rumorKind);
    registerProcessKind(urban.famineKind);
    registerProcessKind(urban.epidemicKind);
    registerProcessKind(urban.blockadeKind);
    registerProcessKind(urban.siegeKind);
    registerProcessKind(cosmic.cosmicKind);
    const kingdoms = await kingdomModule.loadKingdoms().catch(() => new Map());
    registerProcessKind(urban.revoltKind([...kingdoms.values()]));
    const l8Candidates: readonly unknown[] = l8PilotModule?.default?.manual_review_candidates ?? [];
    const warParties = (year: number): readonly WarPartyOption[] => [...kingdoms.values()]
      .filter(kingdom => kingdomModule.kingdomExistsIn(kingdom, year))
      .map(kingdom => {
        const strengthSuggestion = war.warStrengthSuggestion(kingdom.population, kingdom.type, year);
        const l8StrengthCandidates = l8WarStrengthCandidates(l8Candidates, { id: kingdom.id, name: kingdom.name }, year);
        return {
          id: kingdom.id, name: kingdom.name,
          ...(kingdom.government ? { government: kingdom.government } : {}),
          referenceUrl: kingdomModule.kingdomUrl(kingdom),
          ...(strengthSuggestion ? { strengthSuggestion: { ...strengthSuggestion, sourceUrl: kingdomModule.kingdomUrl(kingdom) } } : {}),
          ...(l8StrengthCandidates.length ? { l8StrengthCandidates } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
    const resources = await caravan.loadCaravanResources();
    const warApi = {
      warParties,
      warPlaces: (kingdomId: string, year: number) => resources ? warFront.warPlaces(resources, kingdomId, year) : [],
      previewWarFront: (sideA: string, sideB: string, year: number, fromPlace?: string, toPlace?: string) => warFront.previewWarFront(resources, sideA, sideB, year, fromPlace, toPlace),
      proposeWar: (state: State, order: WarOrder, timeEventId: string) => war.warProposal(state, order, timeEventId),
      proposeWarSettlement: (state: State, processId: string, outcome: WarOutcome, timeEventId: string, territoryTerms?: WarSettlementTerritoryTerms) => war.warSettlementProposal(state, processId, outcome, timeEventId, territoryTerms),
      proposeWarTerritory: (state: State, processId: string, placeId: string, controllerId: string | null, timeEventId: string) => war.warTerritoryProposal(state, processId, placeId, controllerId, timeEventId),
    };
    if (!resources) {
      prepared = null; // A later explicit retry may find restored graph files/network access.
      return {
        ready: false,
        caravanPlaces: () => [],
        previewCaravanRoute: (from: string, to: string, options?: CaravanRouteOptions) => caravan.previewCaravanRoute(null, from, to, options),
        proposeCaravan: () => null,
        proposeTradeLine: () => { throw new Error('граф торговых путей недоступен'); },
        endTradeLine: (state: State, processId: string, timeEventId: string) => caravan.tradeLineEndProposal(state, processId, timeEventId),
        waterdeepToNeverwinter: () => null,
        ...warApi,
        rumorPlaces: () => [],
        previewRumorRoute: () => null,
        proposeRumor: () => { throw new Error('граф маршрутов недоступен'); },
        proposeFamine: urban.famineProposal, proposeEpidemic: urban.epidemicProposal, proposeCityFaction: urban.cityFactionProposal, proposeFactionRelation: urban.factionRelationProposal,
        proposeBlockade: urban.blockadeProposal, endBlockade: urban.blockadeEndProposal,
        proposeSiege: urban.siegeProposal,
      };
    }
    registerProcessKind(caravan.caravanKind(resources));
    registerProcessKind(caravan.tradeLineKind(resources));
    return {
      ready: true,
      caravanPlaces: () => caravan.caravanPlaces(resources),
      previewCaravanRoute: (from: string, to: string, options?: CaravanRouteOptions) => caravan.previewCaravanRoute(resources, from, to, options),
      proposeCaravan: (state: State, input: CaravanRequestInput) => caravan.caravanProposal(state, resources, input),
      proposeTradeLine: (state: State, input: TradeLineRequestInput) => caravan.tradeLineProposal(state, resources, input),
      endTradeLine: (state: State, processId: string, timeEventId: string) => caravan.tradeLineEndProposal(state, processId, timeEventId),
      waterdeepToNeverwinter: (state: State, timeEventId: string) => caravan.waterdeepToNeverwinter(state, resources, timeEventId),
      ...warApi,
      rumorPlaces: () => rumor.rumorPlaces(resources),
      previewRumorRoute: (from: string, to: string, checkpoints?: readonly string[]) => rumor.previewRumorRoute(resources, from, to, checkpoints),
      proposeRumor: (state: State, input: RumorRequestInput) => rumor.rumorProposal(state, resources, input),
      proposeFamine: urban.famineProposal, proposeEpidemic: urban.epidemicProposal, proposeCityFaction: urban.cityFactionProposal, proposeFactionRelation: urban.factionRelationProposal,
      proposeBlockade: urban.blockadeProposal, endBlockade: urban.blockadeEndProposal,
      proposeSiege: urban.siegeProposal,
    };
  }).catch(error => {
    // Не запоминаем ошибку: повторный пользовательский шаг может быть сделан после восстановления ресурса.
    prepared = null;
    throw error;
  });
  return prepared!;
}
