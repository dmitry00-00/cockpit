import { settlementPlanDelta } from '../campaign/settlementPlan';
import { locationGeoDelta } from '../campaign/locationGeo';
import { adventureLaunchDelta } from '../campaign/adventureSession';
import { builtInCampaignContent } from '../packages/campaigns';
// Рабочий стол (шаги 5–6) — скелет HANDOFF §4 на сиде: полоса часов, корешок партии слева, главная зона,
// справа — отмена, тост, последний бросок и журнал. Стор один на страницу; всё ниже получает срезы состояния
// и колбэки пропсами и в стор не ходит. Критерий шага 5: урон виден в корешке и в карточке одновременно,
// потому что оба читают один actor.hp из State — здесь нет ни одной копии хитов. Шаг 6: «Начать бой»
// пишет ENCOUNTER_STARTED, главная зона переключается на боевую сетку, внизу — полоса инициативы; урон
// с токена меняет число на токене, в корешке и в журнале — те же хиты. Выбор актёра, вкладка, попап,
// заметка, скрытость будущих бросков и открытая карточка в бою — состояние экрана, не события (§7).
// Шаг 10: главная зона — лестница масштабов и под ней уровень: выше боя — карточки (MVP: карт нет),
// в бою — сетка; `[` и `]` двигают уровень, путь помнит точку фокуса, темп часов следует за уровнем.
// Живой стол (21.09.2026): «Начать бой» открывает редактор инициативы (числа игроков вводит мастер, монстрам
// бросает система — DICE_ROLLED, порядок — снимком в ENCOUNTER_STARTED; в бою «Порядок» → INITIATIVE_SET),
// «Добавить» в шапке главной зоны — противник из блока SRD (ACTOR_SPAWNED, в бою сразу в порядок),
// «Концентрация» в карточке — CONCENTRATION_STARTED со сроком SRD. Пустые входящие — «Мир спокоен» и ближайший
// праздник (CLAUDE.md, единственное исключение из правила пустых секций).
import { MaterialArtwork } from '../art/MaterialArtwork';
import './DeskPage.css';
import type { CaravanOrder } from './desk/CaravanPlanner';
import type { RumorOrder } from './desk/RumorPlanner';
import type { WarOrder, WarOutcome, WarSettlementTerritoryTerms } from '../campaign/war';
import type { CosmicRequestInput } from '../campaign/cosmic';
import { GOODS_LABEL } from '../components/labels';
import { previewLevelUp } from '../campaign/levelUpPreview';
import { needsTimePreview, previewTimeStep, timeStepEnd, type TimeStepPreview } from '../campaign/timeStepPreview';
import { commitTimeStepPlan } from '../campaign/simulation';
import { Dialog, Popover, ToggleGroup } from 'radix-ui';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type SetStateAction } from 'react';
import type { CosmologyViewId } from '../cosmos/postSpellplagueFr4e.types';
import {
  calendarAdapterForState, conModOf, cosmologyOfSetting, pathOf, nextLevelText, levelUp, levelUpPlan, type LevelUpPlan, KNOWLEDGE_DC, KNOWLEDGE_RULE, KNOWLEDGE_SKILLS, isLore, knowledgeSkillOf, knownFacts, knownLine, passiveVoices, deceptionDcOf, playersEntityView, currentOrder, NEAR_SCALES, eraOfSetting, harptos, dayPhase, encounterCandidates, hitDiceOf, initiativeMod, nextFestival, nextHolyDayFor, partyDeitiesOf, placeChain, pcActor, placedActors, prestigeProfileCommand,
  poolLabel, resourcePoolsOf, restCandidates, restResourcesOf, seedBattlefield, seedEngine, seedStateForEvents, createCampaignProfile, campaignProfileFromEvents, sortInitiative,
  suggestMonsterName, encounterMonsterId, LEGENDARY_RESOURCE, legendaryTrackOf, regainLegendary, takeRest, a5eRestCompletes, locationHavenDelta, travel, supplyOf, tensionThreadDelta, sameDayIn, weatherOf, seasonOf, sheetViewOf, passportOf, newPlaceDelta, renownDelta, standingDelta, referenceFactionDelta, factionOf, oddsTargetOf, explain, signedTotal, concentrationSpellsOf, type PcSpec,
} from '../campaign';
import {
  ArmillaryScale, CardStack, ConditionGrid, DerivationPanel, EntityCard, EntityViewBody, OpenEntityContext, cardTypeOf, HpControl, InitiativeBar, Paperdoll, PlayerFrame, ScaleLadder, type ActivityMember, type RollMode, OUTCOME_LABEL,
  SCALE_LABELS, SCALE_TEMPO_LABELS, TAB_ACTIONS, TAB_NOW, TAB_OVERVIEW, TAB_SUBJECT, TAB_HISTORY, SubjectProfileShell, actorCardProps, battleTokenOf, exhaustionCommand, factionCardProps, initiativeFormula,
  initiativeTokenOf, lastDamageOf, lastRollOf, placeCardProps, stackItemOf, toggleCommand, type CompareColumn,
  dollExtrasOf, SkillVoices, type KnowledgeMember, type IconRailItem, type InitiativeBarEntry, type InitiativeRow, type RestRow, type SpawnOption,
} from '../components';
import {
  EventLog, LEVEL_TEMPO, SCALE_LEVELS, SECONDS_PER_DAY, childrenOf, createEngineStore, filterJournal, focusOf, initialLadder, journalEntries, jumpTo, ladderLevels,
  localStorageStore, memoryStore, parseLog, roll, serializeLog, type EventStore, moveLevel, normalizeLadder, partyPlaceId, pendingFor, pendingTargets,
  placeCounts, plural, selectPlace, threadSummaries, type Actor, type Command, type EngineStoreApi, type InitiativeEntry, type Process, type TimelinePlanDraft,
  type JournalEntry as JournalRecord, type Ladder, type RestContext, type RestHitDice, type RestKind, type ScaleLevel, type State, type Tempo, type A5ePrestigeProfile,
} from '../engine';
import { useEngine, useHpFlashes, useUndoKeys } from '../engine/useEngine';
import { KIND_LABEL, isEntityRef, isStateKind, parseRef, ref, type AnySubjectEnvelope, type EntityFact, type EntityRef, type EntityView } from '../entities';
import { stateView } from '../entities/state';
import { useEntity } from '../entities/useEntity';
import { Icon } from '../icons/Icon';
import { classById } from '../rules/compendium';
import type { SkillId } from '../rules/srd/abilities';
import { lairActionsOf } from '../rules/book/lairActions';
import { a5eDevotionActivitySpec, a5eDevotionFavorAward, a5eDowntimeJournalText, a5eInformationActivitySpec, a5eInformationCheckOutcome, a5eWorkActivitySpec, downtimeTimeStep, planA5eDowntimeCoinPayment, prepareA5eDowntimePeriod, type A5eDowntimeActivityRecord, type A5eDowntimePeriod } from '../rules/a5e/downtime';
// Экран создания — ленивым куском (ROADMAP 0.5): догружается после первой отрисовки, до открытия редактора.
import { WorkspaceHub, TimelineRibbon, BranchPanel, CharacterEditor, CharacterPathView, ChronologyView, PlanetosChronologyView, CompareSheet, ConcentrationForm, JournalView, LevelUpForm, PulseView, SpawnForm, TimeView, LevelZone, ToolsPanel, PartyPanel, TimeStepReview, NotebookView, BattleGrid, SceneView, JourneyActivities, KnowledgeCheck } from '../lazyParts';
import { levelMap } from '../map/levelMap';
import type { MapView } from '../map/projection';
import type { JourneyProps, TravelRoute } from '../map/WorldMap';
import {
  ENCOUNTER_TYPE_LABEL, JOURNEY_ACTIVITIES, JOURNEY_REGIONS, WARM_REGIONS, encounterAt, journeyLoaded, loadJourney, regionActivityMods, tierOfLevel, weatherAt, weatherRollLabel,
} from '../rules/a5e/journey';
import { useMapData } from './desk/useMapData';
import { useMapToolBridge } from './desk/useMapToolBridge';
import { MapToolChip } from './desk/MapToolChip';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import { useScene } from './desk/useScene';
import { suggestNpcName } from './desk/npcName';
import {
  INFLUENCE_RULE, MONSTER_IDS, MONSTER_ORIGIN_LABEL, MONSTERS, SKILLS, loadMonsterLibraries, monsterLibrariesLoaded, monsterOrigin, needsMonsterLibraries, type MonsterId,
} from '../rules/srd';
import type { BodyProps } from './desk/bodies';
import { pcHeaderData } from './desk/characterBodyData';
import { DmTab, FactionOverview, MonsterActions, MonsterOverview, MonsterSeen, NpcSocialPanel, PersonRelationshipPanel, OrgCampaignLine, PcLore, PcOverview, PcSkills, PlaceOverview } from '../lazyParts';
import { chronicleOf } from './desk/characterBodyData';
import { characterCardProps } from '../campaign/characterCard';
import { characterSubjectEnvelope, citySubjectEnvelope, deitySubjectEnvelope, organizationSubjectEnvelope, kingdomSubjectEnvelope, partySubjectEnvelope } from '../entities/subjectAdapters';
import { SKILL_LABEL } from '../components/labels';
import {
  type OpenRail, BATTLE_CELL, DESK_HASH, DESK_LOG_KEY, JOURNAL_TAIL, NARROW_QUERY, NEW_PC_HASH, concentrationRemindersOf, conditionRemindersOf,
  d20Formula, deskDollItems, dmFactsAbout, dmFactsOf, factionItems, hereItems, isDeskHotkey, isNarrow, journalEntryProps, ladderSteps,
} from './desk/helpers';
import { downloadText, readText, sessionFileName } from './desk/session';
import { BTN, BTN_HEAD, CONDITION_DURATIONS, HEAD, OPT, OPT_OFF, OPT_ON, type DeskView } from './desk/styles';
import { ClockBar } from './desk/ClockBar';
import { PartyMemberCard } from './desk/PartyMemberCard';
import { PartySpread } from '../components/PartySpread';
import { CharacterCardSpine } from '../components/CharacterCardSpine';
import { readSelectedPartyHero, writeSelectedPartyHero } from '../components/partyPresentation';
import { PartyContextPanel } from './desk/PartyContextPanel';
import { InventoryPanel as PartyInventory } from '../components/InventoryPanel';
import { withPlayerVisibleInventory } from '../engine/inventory';
import { partyContextOf } from '../campaign/partyContext';
import { useTensions } from './desk/useTensions';
import { useBranches } from './desk/useBranches';
import type { ChronoEvent } from '../world/chronology';
import { useOverlayBounds } from './desk/useOverlayBounds';
import { campaignPlanScope } from '../campaign/planScope';
import { isMonsterReference, planReferenceActivation } from '../campaign/activation';
import { combineRollModes, mentalStressRollMode, resolveRollModes, strifeRollMode, type StrifeRollIntent } from '../campaign/strife';
import { A5E_LONG_STRESS_EFFECTS, A5E_SHORT_STRESS_EFFECTS, A5E_STRESS_EFFECT_REMINDERS, A5E_STRIFE_LEVEL_REMINDERS, activeA5eStressEffect, a5eStressEffectName } from '../rules/a5e/strife';
import { hashForView, type ProductRoute } from '../routes';
/* ---------- Страница ---------- */

export interface DeskPageProps {
  /** Стор снаружи — для тестов (seedEngine с memoryStore); без него страница поднимает сид из хранилища. */
  store?: EngineStoreApi;
  /** Хранилище лога: localStorage по умолчанию; «Новая сессия» чистит его и поднимает сид заново. Тесты подставляют memoryStore. */
  persist?: EventStore;
  /** Стол мастера. false — стол игроков с самого начала (как после `P`): секретов в DOM нет. */
  dmView?: boolean;
  /** Чем открывается персонаж с листом (Д9): картой на лице или листом целиком; дальше — кнопками «Лист» / «Карта». */
  cardFace?: CardFace;
  productRoute?: ProductRoute;
  onAudienceChange?: (dmView: boolean) => void;
}

type CardFace = 'card' | 'sheet';

interface DeskProps {
  productRoute?: ProductRoute;
  onAudienceChange?: (dmView: boolean) => void;
  planScope?: string;
  store: EngineStoreApi;
  dmView: boolean;
  cardFace: CardFace;
  /** Сохранённый лог не поднялся или файл не открылся — первая заметка мастеру. */
  recoverNote: string | null;
  /** Точный текст исходного журнала, сохранённый до восстановления; доступен для скачивания. */
  recoveryCopy: string | null;
  /** Причина текущего восстановления, если журнал не открылся на этом запуске. */
  recoveryReason: string | null;
  onExportRecovery: () => void;
  /** «Новая сессия»: стереть журнал и собрать стол из сида заново. */
  onReset: () => void;
  /** Начать новую пустую кампанию на выбранном сеттинге. */
  onNewCampaign?: (settingPackageId: string, campaignPackageId?: string) => void;
  /** «Сохранить» — журнал сессии файлом; «Открыть…» — стол из файла (проверяется реплеем до подмены). */
  onExport: () => void;
  onImport: (file: File) => void;
  /** «Стол на этот день» из хроники журнала (Д5): реплей лога до конца дня — отдельным стором в памяти. */
  onViewPast?: (endSec: number) => void;
  /** Стол прошлого дня: плашка сверху и «Вернуться»; что сделано здесь, в сессию не попадает. */
  past?: { label: string; onExit: () => void };
}

/**
 * Страница: один стор на сессию. Сохранённый лог мог перестать реплеиться (сид изменился) — seedEngine сохраняет
 * исходный текст для экспорта, собирает стол из сида и показывает причину мастеру: потеря сессии не проходит
 * молча. «Новая сессия» — не событие (нечего отменять: журнала больше нет): хранилище чистится, стор поднимается
 * из сида, стол перемонтируется целиком — выбор, лестница и фильтры начинаются заново.
 */
export function DeskPage({ store: given, persist: givenPersist, dmView = true, cardFace = 'card', productRoute, onAudienceChange }: DeskPageProps) {
  const persist = useRef<EventStore>(givenPersist ?? localStorageStore(DESK_LOG_KEY));
  const recovered = useRef<{ reason: string | null; raw: string | null } | null>(null);
  const make = (
    campaignProfile?: NonNullable<Parameters<typeof seedEngine>[0]>['campaignProfile'],
    targetPersist: EventStore = persist.current,
  ) => seedEngine({
    persist: targetPersist,
    ...(campaignProfile ? { campaignProfile } : {}),
    onRecover: (reason, raw) => { recovered.current = { reason, raw: raw ?? recovered.current?.raw ?? null }; },
    onRecoveryCopy: raw => { recovered.current = { reason: null, raw }; },
  });
  const [session, setSession] = useState(() => ({ n: 0, store: given ?? make(), planScope: given ? crypto.randomUUID() : campaignPlanScope(), note: null as string | null }));
  const reset = () => {
    const profile = campaignProfileFromEvents(session.store.getState().events);
    persist.current.clear();
    recovered.current = null;
    setSession(s => ({ n: s.n + 1, store: make(profile), planScope: campaignPlanScope(true), note: null }));
  };
  const createCampaign = (settingPackageId: string, campaignPackageId?: string) => {
    const profile = createCampaignProfile(settingPackageId, campaignPackageId);
    // Build and validate the replacement in memory first, leaving the current journal intact if preparation fails.
    const candidatePersist = memoryStore();
    const candidate = make(profile, candidatePersist);
    const firstLaunch = campaignPackageId
      ? adventureLaunchDelta(
          candidate.getState().state,
          builtInCampaignContent(campaignPackageId, profile.campaignBundle),
          false,
        )
      : null;
    if (firstLaunch) candidate.getState().propose(firstLaunch);
    const saved = persist.current.save(candidate.getState().events);
    recovered.current = null;
    const store = saved === false ? candidate : make();
    setSession(s => ({
      n: s.n + 1,
      store,
      planScope: campaignPlanScope(true),
      note: saved === false
        ? `Кампания создана в памяти, но браузер не сохранил её. Скачайте журнал, чтобы не потерять его.${firstLaunch ? ' Предложение запуска находится во «Входящих».': ''}`
        : firstLaunch ? 'Кампания создана. Предложение запуска находится во «Входящих»; примите его, чтобы открыть первую сцену.' : null,
    }));
  };
  const exportLog = () => downloadText(sessionFileName(), serializeLog(session.store.getState().events));
  const exportRecovery = () => {
    const raw = recovered.current?.raw;
    if (raw !== null && raw !== undefined) downloadText('dm-cockpit-recovery-original.txt', raw);
  };
  // Стол на прошлый день (Д5): начало лога до конца дня — реплеем на сиде в памяти, только просмотр.
  const [past, setPast] = useState<{ sec: number; store: EngineStoreApi } | null>(null);
  const viewPast = (endSec: number) => {
    const events = session.store.getState().events;
    const base = seedStateForEvents(events);
    const mem = memoryStore();
    const prefix = EventLog.prefixUntil(base, events, endSec);
    mem.save(prefix);
    setPast({ sec: endSec, store: createEngineStore(seedStateForEvents(prefix), { persist: mem }) });
  };
  /**
   * Файл сессии: разобрать, прогнать реплеем на сиде в памяти — и только если лог связный, положить в хранилище
   * и пересобрать стол. Битый файл текущую сессию не трогает: причина уходит заметкой мастеру.
   */
  const importLog = async (file: File) => {
    let note: string;
    try {
      const events = parseLog(await readText(file));
      const trial = memoryStore();
      trial.save(events);
      createEngineStore(seedStateForEvents(events), { persist: trial });
      const opened = `Открыт файл ${file.name}: ${events.length} ${plural(events.length, ['событие', 'события', 'событий'])}.`;
      recovered.current = null;
      // Браузер не принял лог (квота): стол из файла живёт в памяти — иначе make() поднял бы старую сессию из хранилища.
      if (persist.current.save(events) === false) {
        const fromFile: EventStore = { load: () => trial.load(), save: e => persist.current.save(e), clear: () => persist.current.clear() };
        setSession(s => ({ n: s.n + 1, store: createEngineStore(seedStateForEvents(events), { persist: fromFile }), planScope: campaignPlanScope(true), note: `${opened} В браузер он не сохранился — место кончилось; сохраняйте сессию файлом.` }));
        return;
      }
      setSession(s => ({ n: s.n + 1, store: make(), planScope: campaignPlanScope(true), note: opened }));
      return;
    } catch (err) {
      note = `Файл ${file.name} не открылся: ${err instanceof Error ? err.message : String(err)}. Сессия осталась прежней.`;
    }
    setSession(s => ({ ...s, n: s.n + 1, note }));
  };
  // Библиотеки монстров Black Flag и A5E — отдельный кусок (ROADMAP 0.5): грузятся после первой отрисовки. Если в
  // сессии уже стоит монстр из них, стол ждёт загрузки — иначе карточка не нашла бы его блок.
  const [libsReady, setLibsReady] = useState(monsterLibrariesLoaded);
  useEffect(() => {
    if (libsReady) return;
    let live = true;
    void loadMonsterLibraries().then(() => { if (live) setLibsReady(true); });
    return () => { live = false; };
  }, [libsReady]);
  if (!libsReady && needsMonsterLibraries(Object.values(session.store.getState().state.actors).map(a => a.monsterId))) {
    return <p role="status" className="p-4 type-body text-t2">Загружаются библиотеки монстров Black Flag и A5E…</p>;
  }
  if (past) {
    return (
      <Desk
        key={`past-${past.sec}`}
        store={past.store}
        dmView={dmView}
        cardFace={cardFace}
        productRoute={productRoute} onAudienceChange={onAudienceChange} planScope={session.planScope}
        recoverNote={null}
        recoveryCopy={null}
        recoveryReason={null}
        onExportRecovery={() => {}}
        onReset={() => setPast(null)}
        onExport={() => downloadText(sessionFileName(), serializeLog(past.store.getState().events))}
        onImport={() => {}}
        past={{ label: calendarAdapterForState(past.store.getState().state).formatDateOnly(past.sec), onExit: () => setPast(null) }}
      />
    );
  }
  return (
    <Desk
      key={session.n}
      onViewPast={viewPast}
      store={session.store}
      dmView={dmView}
      cardFace={cardFace}
      productRoute={productRoute} onAudienceChange={onAudienceChange} planScope={session.planScope}
      recoverNote={session.note ?? (recovered.current?.reason ? `Сохранённая сессия не открылась: ${recovered.current.reason}.` : null)}
      recoveryCopy={recovered.current?.raw ?? null}
      recoveryReason={recovered.current?.reason ?? null}
      onExportRecovery={exportRecovery}
      onReset={reset}
      onNewCampaign={createCampaign}
      onExport={exportLog}
      onImport={file => { void importLog(file); }}
    />
  );
}

/** Откуда падает попап хитов: от ячейки HP карточки или от токена (сетка, полоса инициативы). */
type PopoverAnchor = 'card' | 'token';

/** Числа полосы показателей с выводом (ROADMAP 5.4): КХ раскрывает максимум хитов — он из костей хитов. */
type WhyKey = 'ac' | 'initiative' | 'pp' | 'hp';
/** Место справочника карты (Д2): карточка по вики и сцена «Сейчас». */
const PLACE_TABS = [{ ...TAB_OVERVIEW, title: 'Карточка места по вики: боги, церкви, организации, жители' }, TAB_NOW];
const FULL_SHEET_TABS = [
  { id: 'sheet-skills', label: 'Навыки', title: 'Навыки и проверки персонажа' },
  { id: 'sheet-features', label: 'Умения', title: 'Умения класса, выборы, черты и особенности расы' },
] as const;
const WHY_TITLE: Readonly<Record<WhyKey, string>> = { ac: 'AC', initiative: 'Инициатива', pp: 'Пассивная Внимательность', hp: 'Максимум хитов' };

/** Что показывает слот карточки: выбранного актёра, место в фокусе лестницы или державу по id. */
/** Слот карточки: актёр, место в фокусе, фракция — свои карточки; любая другая сущность по ссылке — общая (ROADMAP 0.3). */
type CardSlot = { kind: 'actor' } | { kind: 'place' } | { kind: 'faction'; id: string } | { kind: 'entity'; ref: EntityRef };

function Desk({ store, dmView: dmViewProp, cardFace, recoverNote, recoveryCopy, recoveryReason, onExportRecovery, onReset, onNewCampaign, onExport, onImport, onViewPast, past, productRoute, onAudienceChange, planScope }: DeskProps) {
  const [overlayHost,setOverlayHost]=useState<HTMLDivElement|null>(null);
  const [clockDock,setClockDock]=useState<HTMLDivElement|null>(null);
  const [partyClockDock,setPartyClockDock]=useState<HTMLDivElement|null>(null);
  // Режим «глазами игроков» — состояние вида, не событие: P переключает, рамка обозначает, модель фильтрует.
  // Всё, чего игрокам видеть нельзя, в DOM не попадает (CLAUDE.md «Правила экрана»), а не приглушается.
  // Отложенная загрузка не должна дописывать события в закрытый/заменённый стол.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [playersView, setPlayersView] = useState(!dmViewProp);
  const dmView = !playersView;
  const workspace = dmView && (productRoute?.context === 'workshop' || productRoute?.context === 'library') ? productRoute.context : null;
  const [workspaceVisited,setWorkspaceVisited] = useState(Boolean(workspace));
  useEffect(() => { if(workspace)setWorkspaceVisited(true); },[workspace]);
  useEffect(() => { onAudienceChange?.(dmView); },[dmView,onAudienceChange]);
  const state = useEngine(store, s => s.state);
  const events = useEngine(store, s => s.events);
  const toast = useEngine(store, s => s.toast);
  const saveFailed = useEngine(store, s => s.saveFailed);
  const canUndo = useEngine(store, s => s.canUndo);
  const canRedo = useEngine(store, s => s.canRedo);
  useUndoKeys(store, !playersView);
  const flashes = useHpFlashes(store);

  // Состояние экрана: кого смотрим, какая вкладка, открыт ли попап хитов и от чего, заметка про восстановление,
  // скрыты ли следующие броски, какой бросок мастер уже закрыл, открыта ли карточка рядом с сеткой в бою.
  const [selectedId, setSelectedId] = useState(() => readSelectedPartyHero(state.party));
  useEffect(() => { writeSelectedPartyHero(selectedId, state.party); }, [selectedId, state.party]);
  const [tab, setTab] = useState(TAB_OVERVIEW.id);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<PopoverAnchor>('card');
  const [note, setNote] = useState<string | null>(recoverNote);
  const importContent = async (file: File) => {
    try {
      setNote(`Разбираю ${file.name}; если найдутся текстовые фрагменты и запись одна, её оценит локальный классификатор.`);
      const lowerName = file.name.toLowerCase();
      const candidates = lowerName.endsWith('.rptok')
        ? [await (await import('../import/mapTool')).parseMapToolToken(file.name, await file.arrayBuffer())]
        : lowerName.endsWith('.rpmap') || lowerName.endsWith('.cmpgn')
          ? await (await import('../import/mapTool')).parseMapToolContainer(file.name, await file.arrayBuffer())
          : (await import('../import/content')).parseContentImport(file.name, await readText(file));
      const classifier = candidates.length === 1 ? (await import('../import/localMaterialClassifier')).localMaterialClassifier : undefined;
      const classifiedCandidates = await (await import('../import/materialClassification')).classifyParsedMaterials(candidates, classifier);
      let proposed = 0;
      for (const content of classifiedCandidates) {
        const current = store.getState().state;
        const id = `d-${content.id}`;
        if (current.world.importedContent?.[content.id] || current.deltas[id]) continue;
        const scale: ScaleLevel = content.kind === 'location' || content.kind === 'dungeon' ? 'building' : content.kind === 'scene' ? 'battle' : 'settlement';
        const { summary, ...record } = content;
        const assessmentLabel = content.materialAssessment.status === 'awaiting-classifier'
          ? `механическая разметка ожидает локальный классификатор (${content.materialAssessment.evidenceCount} фрагментов); пакетный импорт автоматически не отправлялся`
          : content.materialAssessment.status === 'no-evidence'
            ? 'классификатору не передан текстовый источник'
            : content.materialAssessment.status === 'pending-review'
              ? `черновая разметка механики: ${content.materialAssessment.kind}; проверка цитат ожидает мастера`
              : `классификатор остановлен: ${content.materialAssessment.reason}`;
        const proposalSummary = `${summary} · ${assessmentLabel}`;
        // Catalog acceptance stores the source record only. A location or dungeon becomes a campaign place through
        // a second, explicit activation proposal from the accepted-imports panel.
        const patch = { kind: 'importedContent' as const, content: record };
        store.getState().propose({
          id, scale, subject: content.name, was: 'не добавлено в кампанию', now: `Импорт: ${proposalSummary}`,
          cause: `Файл ${content.sourceFile}; проверьте содержимое и происхождение перед принятием. Принятие каталога не активирует место в кампании.`,
          causeId: `import:${content.id}`, status: 'pending', patch,
        });
        proposed++;
      }
      setNote(proposed ? `Импорт ${file.name}: ${proposed} предложений добавлено во «Входящие». Кампания не меняется до принятия.` : `В ${file.name} не найдено новых записей для импорта.`);
    } catch (error) {
      setNote(`Импорт ${file.name} не выполнен: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  // «Новая сессия» — в два клика: первый спрашивает, второй стирает. Не событие: журнала после него нет.
  const [resetArmed, setResetArmed] = useState(false);
  const [hiddenRolls, setHiddenRolls] = useState(false);
  const [closedRollId, setClosedRollId] = useState<string | null>(null);
  // Открытый вывод числа листа (ROADMAP 5.4): чей и какой; у другого актёра не показывается.
  const [why, setWhy] = useState<{ actorId: string; key: WhyKey } | null>(null);
  const [cardInCombat, setCardInCombat] = useState(false);
  // Попапы живого стола — редактор инициативы, появление противника, начало концентрации: состояние вида.
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  // Встреча A5E (M15): итог последнего броска под регионом и блок для «Появился» — состояние вида, не событие.
  const [lastEncounter, setLastEncounter] = useState<{ regionId: string; text: string; monsterId?: MonsterId } | null>(null);
  const [spawnPick, setSpawnPick] = useState<string | undefined>(undefined);
  const [concentrationOpen, setConcentrationOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  /** Срок следующего состояния из сетки, секунд мирового времени; 0 — пока мастер не снимет. */
  const [conditionDuration, setConditionDuration] = useState(0);
  // Оверлей карточки 720px (F3) — вид: та же карточка в две колонки с бронзовой рамкой поверх главной зоны.
  const [cardOverlay, setCardOverlay] = useState(false);
  const cardOverlayTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openCardOverlay = () => {
    cardOverlayTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setCardOverlay(true);
  };
  // Отметки строк партии и лист сравнения — состояние вида (CLAUDE.md: выбор и оверлеи событиями не являются).
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  /** Редактор персонажа (шаг B) — оверлей в главной зоне; черновик — его собственное состояние, в лог идёт только ACTOR_SPAWNED. */
  // #/desk/new — вход в создание персонажа извне стола (кнопка на экране компендиума): открыть редактор, хэш вернуть к столу.
  // Открывается после монтирования: диалог порталится в главную зону, а её узел появляется только с первым рендером.
  const [editorOpen, setEditorOpenRaw] = useState(false);
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const setEditorOpen = (open: boolean) => {
    if (open && typeof document !== 'undefined') {
      editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setEditorOpenRaw(open);
    if (!open && globalThis.location?.hash === NEW_PC_HASH) history.replaceState(null, '', DESK_HASH);
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => { if (location.hash === NEW_PC_HASH) setEditorOpenRaw(true); };
    check();
    addEventListener('hashchange', check);
    return () => removeEventListener('hashchange', check);
  }, []);
  // Лестница масштабов (шаг 10) — навигация, не событие: уровень и путь (по месту на уровень) живут здесь.
  // Что в слоте карточки: актёр из корешка, место в фокусе лестницы или держава со стопки континента.
  const [ladderState, setLadderState] = useState<Ladder>(() => initialLadder(state));
  const [cardOf, setCardOf] = useState<CardSlot>({ kind: 'actor' });
  // Линза года канона (ROADMAP Х3): год, выбранный в «Хронике», — карточки справочника и карта показывают канон на него.
  // Не событие: состояние кампании не меняется; у игроков линзы нет; год кампании — линзы нет.
  const calendar = calendarAdapterForState(state);
  const settingPackageId = state.settingPackageId ?? DEFAULT_SETTING_PACKAGE;
  const isForgottenRealms = settingPackageId === DEFAULT_SETTING_PACKAGE;
  const isPlanetos = settingPackageId === 'planetos';
  const chronologyAvailable = isPlanetos || (isForgottenRealms && calendar.id === 'harptos' && calendar.yearAt(state.time.sec) !== null);
  const campaignYear = calendar.yearAt(state.time.sec);
  const [lens, setLens] = useState<number | null>(null);
  // Камера карты — состояние представления: при переходе в хронику карта размонтируется, поэтому храним
  // её отдельно по паспорту и рамке, чтобы вернуться к той же точке, не смешивая соседние уровни.
  const mapViews = useRef<Record<string, MapView>>({});
  const pendingMapFocus = useRef(false);
  const lensYear = dmView && campaignYear !== null && lens !== null && lens !== campaignYear ? lens : null;
  const activeEra = eraOfSetting(lensYear ?? campaignYear, settingPackageId);
  const entityView = useEntity(cardOf.kind === 'entity' ? cardOf.ref : null, { state, era: activeEra, year: lensYear ?? campaignYear ?? undefined });
  const entitySubjectRef = entityView && entityView !== 'loading' ? entityView.ref : null;
  const entitySubjectKey = `${settingPackageId}:${entitySubjectRef ?? ''}:${dmView ? 'dm' : 'players'}:${lensYear ?? campaignYear ?? 'without-year'}`;
  const [entitySubjectState, setEntitySubjectState] = useState<{ key: string; envelope: AnySubjectEnvelope | null }>({ key: '', envelope: null });
  const entitySubjectEnvelope = entitySubjectState.key === entitySubjectKey ? entitySubjectState.envelope : null;
  useEffect(() => {
    let live = true;
    setEntitySubjectState({ key: entitySubjectKey, envelope: null });
    if (!isForgottenRealms || !entityView || entityView === 'loading') return () => { live = false; };
    const parsed = parseRef(entityView.ref);
    const audience = dmView ? 'dm' : 'players';
    void (async () => {
      let envelope: AnySubjectEnvelope | null = null;
      if (parsed?.kind === 'deity') {
        const [deities, planes] = await Promise.all([import('../cosmos/deities'), import('../cosmos/planes')]);
        const deity = deities.deityById(parsed.id);
        if (deity) {
          const deityNames = Object.fromEntries(deities.DEITIES.map(item => [item.id, item.name]));
          const pantheonNames = Object.fromEntries(deities.PANTHEONS.map(item => [item.id, item.name]));
          const planeNames = Object.fromEntries([...planes.GREAT_WHEEL.planes, ...planes.WORLD_TREE.planes].map(item => [item.id, item.name]));
          envelope = deitySubjectEnvelope(state, deity, activeEra, audience, { deityNames, pantheonNames, planeNames }) as AnySubjectEnvelope | null;
        }
      } else if (parsed?.kind === 'organization') {
        const [organizationsModule, gazetteerModule, deitiesModule] = await Promise.all([import('../world/organizations'), import('../map/gazetteer'), import('../cosmos/deities')]);
        const [organizations, memberIndex, memberSources, places] = await Promise.all([
          organizationsModule.loadOrganizations(), organizationsModule.loadOrgMembers(), organizationsModule.loadOrgMemberSources(),
          gazetteerModule.loadGazetteer('toril'),
        ]);
        const organization = organizations.get(parsed.id);
        if (organization) envelope = organizationSubjectEnvelope(
          state, organization, audience, memberIndex[parsed.id] ?? [], memberSources[parsed.id],
          {
            placeNames: Object.fromEntries(places.map(place => [place.id, place.name])),
            relatedNames: {
              ...Object.fromEntries([...organizations.values()].map(item => [`organization:${item.id}`, item.name])),
              ...Object.fromEntries(deitiesModule.DEITIES.map(item => [`deity:${item.id}`, item.name])),
            },
          },
        ) as AnySubjectEnvelope | null;
      } else if (parsed?.kind === 'kingdom') {
        const [kingdomsModule, gazetteerModule, organizationsModule, deitiesModule] = await Promise.all([import('../world/kingdoms'), import('../map/gazetteer'), import('../world/organizations'), import('../cosmos/deities')]);
        const [kingdoms, places, organizations] = await Promise.all([kingdomsModule.loadKingdoms(), gazetteerModule.loadGazetteer('toril'), organizationsModule.loadOrganizations()]);
        const kingdom = kingdoms.get(parsed.id);
        if (kingdom) {
          const year = lensYear ?? campaignYear;
          const history = audience === 'dm' && year !== null ? await kingdomsModule.loadKingdomHistory(kingdom, year) : { lines: [], later: 0 };
          envelope = kingdomSubjectEnvelope(state, kingdom, audience, year, history.lines, {
            placeNames: Object.fromEntries(places.map(place => [place.id, place.name])),
            relatedNames: {
              ...Object.fromEntries([...kingdoms.values()].map(item => [`kingdom:${item.id}`, item.name])),
              ...Object.fromEntries([...organizations.values()].map(item => [`organization:${item.id}`, item.name])),
              ...Object.fromEntries(deitiesModule.DEITIES.map(item => [`deity:${item.id}`, item.name])),
            },
          }) as AnySubjectEnvelope | null;
        }
      }
      if (live) setEntitySubjectState({ key: entitySubjectKey, envelope });
    })().catch(() => { if (live) setEntitySubjectState({ key: entitySubjectKey, envelope: null }); });
    return () => { live = false; };
  }, [entitySubjectKey, state, dmView, campaignYear, lensYear, activeEra, isForgottenRealms]);
  const [lensEvents, setLensEvents] = useState<readonly Pick<ChronoEvent, 'id' | 'year' | 'text' | 'links'>[]>([]);
  useEffect(() => {
    if (lensYear === null || !isForgottenRealms) { setLensEvents([]); return; }
    let live = true;
    // Канон и летописи — своими кусками; публикации не становятся отметками исторических событий.
    void import('../world/chronology').then(async m => {
      const [events, articles] = await Promise.all([m.loadEvents(lensYear, lensYear), m.loadArticleEvents(lensYear, lensYear)]);
      return [...events, ...articles.filter(event => event.kind !== 'publications')];
    }).then(e => { if (live) setLensEvents(e); });
    return () => { live = false; };
  }, [lensYear, isForgottenRealms]);
  /** События года линзы у мест справочника карты: место → строки. */
  const eventMarks = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const e of lensEvents) {
      for (const l of e.links ?? []) if (l.ref?.startsWith('place:')) {
        const placeId = l.ref.slice(6);
        const lines = out.get(placeId) ?? [];
        if (!lines.includes(e.text)) lines.push(e.text);
        out.set(placeId, lines);
      }
    }
    return out;
  }, [lensEvents]);
  /** Уровень планеты: глобус или плоская карта — состояние экрана, не событие. */
  const [planetView, setPlanetView] = useState<'globe' | 'map'>('globe');
  /** Поселение с планом (M10): по умолчанию план; карта мира — для похода и окрестностей. */
  const [cityView, setCityView] = useState<'plan' | 'map'>('plan');
  // Выбор космологической схемы — визуальная линза, не событие. FR 4e доступна вручную;
  // дата источника 1479 DR не превращается в неподтверждённый период её «истинности».
  const [cosmologyView, setCosmologyView] = useState<CosmologyViewId>(() => cosmologyOfSetting(campaignYear, settingPackageId));
  // Журнал сессии (F7) — вид главной зоны, не событие: фильтр по нитям и уровням, черновик заметки,
  // отложенные напоминания о секретах («Позже») — всё живёт здесь и не переживает перезагрузку.
  const [view, setDeskView] = useState<DeskView>(productRoute?.view ?? 'desk');
  useEffect(() => { if(productRoute?.view) setDeskView(productRoute.view); },[productRoute?.view]);
  // Темп — переключатель, не событие (HANDOFF §7): начальный — из состояния, в бою всегда раунды.
  const [tempoChoice, setTempoChoice] = useState<Tempo>(() => state.time.tempo);
  const [timePreview, setTimePreview] = useState<TimeStepPreview | null>(null);
  const [timePreviewStale, setTimePreviewStale] = useState(false);
  const [timePreviewDowntime, setTimePreviewDowntime] = useState<{ period: A5eDowntimePeriod; records: readonly A5eDowntimeActivityRecord[] } | null>(null);
  const [stepPreparing, setStepPreparing] = useState(false);
  const timeRequestBusy = useRef(false);
  useEffect(() => {
    if (!dmView && timePreview) {
      store.getState().releaseReservedEventId(timePreview.eventId);
      setTimePreview(null);
      setTimePreviewDowntime(null);
    }
    return () => { if (timePreview) store.getState().releaseReservedEventId(timePreview.eventId); };
  }, [dmView, timePreview, store]);
  // Последний шаг времени этого экрана: сводка «что изменилось» — предложения именно этого шага, пока они ждут решения.
  const [lastStep, setLastStep] = useState<{ eventId: string; deltaIds: string[] } | null>(null);
  const [filterThreads, setFilterThreads] = useState<string[]>([]);
  const [filterScales, setFilterScales] = useState<ScaleLevel[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  /** Заметка видна игрокам — переключатель формы; по умолчанию заметка секретна (Q1). */
  const [noteForPlayers, setNoteForPlayers] = useState(false);
  const [laterFacts, setLaterFacts] = useState<string[]>([]);
  // «Позже» у напоминаний о концентрации — по ключу актёр + заклинание + срок: новое заклинание напомнит заново.
  const [laterConcentration, setLaterConcentration] = useState<string[]>([]);
  // F9: боковые панели свёрнуты в полосы 40px — состояние вида. На планшете — с самого начала обе; мастер
  // сворачивает и закрепляет руками. Раскрытая из полосы панель лежит оверлеем поверх главной зоны до Esc.
  const [narrow, setNarrow] = useState(isNarrow);
  const [mobilePartyView, setMobilePartyView] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 700px)').matches);
  const [railParty, setRailParty] = useState(narrow);
  const [railTools, setRailTools] = useState(narrow);
  const [openRail, setOpenRail] = useState<OpenRail>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => {
      setNarrow(mq.matches);
      setRailParty(mq.matches);
      setRailTools(mq.matches);
      setOpenRail(null);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 700px)');
    const onChange = () => setMobilePartyView(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const cardRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLElement>(null);
  const [partyExpanded, setPartyExpanded] = useState(false);
  const [partyManagementOpen, setPartyManagementOpen] = useState(false);
  const partyManagementTriggerRef = useRef<HTMLButtonElement>(null);
  const setView = (choice: SetStateAction<DeskView>) => {
    const next = typeof choice === 'function' ? choice(view) : choice;
    setPartyExpanded(false); setDeskView(next);
    if(productRoute) location.hash = hashForView(next,productRoute.context);
  };
  const barRef = useRef<HTMLDivElement>(null);
  // Якорь попапа от токена — сам элемент токена: Radix меряет его через virtualRef, DOM-обёртка не нужна.
  const tokenAnchor = useRef<HTMLElement | null>(null);
  // Поле боя — данные сида (расстановка F2): стены, шаблон, стартовые клетки; дальше клетку несёт актёр (TOKEN_MOVED).
  const [field] = useState(seedBattlefield);

  const actor: Actor | undefined = state.actors[selectedId];
  const party = state.party.map(id => state.actors[id]).filter((a): a is Actor => a !== undefined);
  const knowledgeMembers: KnowledgeMember[] = party.filter(a => !a.removed && a.sheet).map(a => ({ id: a.id, name: a.name, mods: Object.fromEntries((sheetViewOf(a)?.skills ?? []).map(sk => [sk.id, sk.mod])) }));
  // Противники — монстры, что не выбыли; в бою их место — на сетке и в полосе инициативы.
  const foes = Object.values(state.actors).filter(a => a.kind === 'monster' && !a.removed);
  // На столе игроков секретов нет вовсе — ни в записях, ни в счётчиках, ни в сводке нитей.
  const allEntries = filterJournal(journalEntries(events, state), { dmView });
  const journal = allEntries.slice(-JOURNAL_TAIL);
  const filtered = filterJournal(allEntries, { threads: filterThreads, scales: filterScales });
  const threads = threadSummaries(allEntries, state, state.time.sec, dmView);
  const pending = Object.values(state.deltas).filter(d => d.status === 'pending');
  const quickInboxDelta = pending.find(item => !item.far && NEAR_SCALES.includes(item.scale)) ?? pending[0];
  const reminders = dmView ? Object.values(state.facts).filter(f => f.visibility === 'dm' && !laterFacts.includes(f.id)) : [];
  // Что система предлагает, но не делает сама (HANDOFF §7): концентрация на нуле хитов и по вышедшему сроку.
  const concentrationReminders = dmView ? concentrationRemindersOf(state).filter(r => !laterConcentration.includes(r.key)) : [];
  const conditionReminders = dmView ? conditionRemindersOf(state).filter(r => !laterConcentration.includes(r.key)) : [];
  const { encounter } = state;
  const combat = encounter.active;
  const tempo: Tempo = combat ? 'round' : tempoChoice === 'year' && !calendar.addYears ? 'season' : tempoChoice;
  const phase = dayPhase(state.time.sec);
  const places = placeChain(state);
  const scaleLabel = (sc: ScaleLevel) => (places[sc] ? `${SCALE_LABELS[sc]} · ${places[sc]}` : SCALE_LABELS[sc]);
  const stepDeltas = dmView ? (lastStep?.deltaIds ?? []).map(id => state.deltas[id]).filter(d => d?.status === 'pending') : [];
  // Тетрадь (Д6) — когда партия что-то узнала: пустого вида нет.
  const hasNotebook = Object.keys(state.knowledge ?? {}).length > 0;
  const views: readonly DeskView[] = ['desk', ...(dmView ? ['time', 'pulse'] as const : []), ...(dmView && chronologyAvailable ? ['chrono'] as const : []), 'journal', ...(hasNotebook ? ['notebook'] as const : [])];
  // Виды «Время» и «Пульс» — экраны мастера: на столе игроков вместо них стол, а состояние вида не теряется до возврата.
  const shownView = (!dmView && (view === 'time' || view === 'pulse' || view === 'chrono')) || (view === 'chrono' && !chronologyAvailable) || (view === 'notebook' && !hasNotebook) ? 'desk' : view;
  useEffect(() => {
    if (shownView !== 'desk' || !pendingMapFocus.current) return;
    pendingMapFocus.current = false;
    viewRef.current?.focus();
  }, [shownView]);
  const openThreads = Object.values(state.world.threads).filter(t => t.status === 'open');
  const activeId = combat && !encounter.lairActionWindow ? encounter.order[encounter.turnIndex] : undefined;
  const initiative: InitiativeBarEntry[] = encounter.order.flatMap(id => {
    const a = state.actors[id];
    if (!a) return [];
    // Легендарные действия блока (Q13) — только мастеру: на столе игроков у монстра нет блока (Q1).
    const legendaryActions = dmView ? legendaryTrackOf(a) : null;
    const lostFirstRoundActions = encounter.round === 1 && encounter.lostFirstRoundActions?.includes(id) === true;
    return [{ ...initiativeTokenOf(a, a.initiative ?? 0, { players: !dmView }), ...(lostFirstRoundActions ? { lostFirstRoundActions: true } : {}), ...(legendaryActions ? { legendaryActions } : {}) }];
  });
  // Книжные действия логова 2014 (owner layer) идут отдельным слотом 20 и видны только мастеру.
  // Новые бои без подтверждённого контекста явно помечают профильный слот недоступным; player view его не получает.
  const lairEntries: InitiativeBarEntry[] = dmView ? encounter.order.flatMap(id => {
    const actor = state.actors[id];
    if (!actor || actor.kind !== 'monster' || actor.removed || actor.hp.current <= 0) return [];
    const lairActions = lairActionsOf(actor.monsterId);
    if (!lairActions) return [];
    const previous = encounter.lairActionsUsed?.[actor.id];
    const lairRound = encounter.lairActionWindow?.round ?? encounter.round;
    return [{
      id: `lair:${actor.id}`,
      name: `Логово · ${actor.name}`,
      type: 'location' as const,
      initiative: lairActions.initiative,
      lair: true,
      lairActions: {
        ...lairActions,
        actorId: actor.id,
        ...(encounter.lairContextVersion === 1 && encounter.lairContextConfirmed !== true ? { unavailableOutsideLair: true } : {}),
        round: lairRound,
        ...(previous?.round === lairRound ? { usedThisRound: previous.optionId } : {}),
        ...(previous?.round === lairRound - 1 ? { previousRoundOption: previous.optionId } : {}),
      },
    }];
  }) : [];
  initiative.push(...lairEntries);
  initiative.sort((a, b) => b.initiative - a.initiative || Number(Boolean(a.lair)) - Number(Boolean(b.lair)));
  const tokens = placedActors(state, field).map(({ actor: a, cell }) => battleTokenOf(a, cell, { players: !dmView }));
  // Мост к MapTool (Q17): клетки оттуда — событиями, хиты и состояния — туда. Прошлый день только смотрят.
  const maptool = useMapToolBridge(past ? null : store, state, field.positions);
  const lastRoll = lastRollOf(events);
  // Скрытый бросок на столе игроков не показывается — ни карточкой, ни строкой истории.
  const shownRoll = lastRoll && lastRoll.id !== closedRollId && (dmView || !lastRoll.roll.hidden) ? lastRoll : null;
  // Вне боя токенов нет — попап падает только от карточки, даже если последний раз открывался с токена.
  const anchor: PopoverAnchor = combat ? popoverAnchor : 'card';
  // Лестница, приведённая к сеттингу: бой кончился (или его начало отменили) — с уровня боя на место, откуда он начался.
  const ladder = normalizeLadder(state, ladderState);
  const focus = focusOf(state, ladder);
  const focusParent = focus?.parentId ? state.world.locations[focus.parentId] : undefined;
  // Место как сцена (Д2, ROADMAP 6.2): вкладка «Сейчас» у места кампании и у места справочника карты; справочник
  // грузится, только когда вкладка открыта. Год сцены — линза «Хроники»: тот же день в выбранном году.
  const entityPlace = cardOf.kind === 'entity' && parseRef(cardOf.ref)?.kind === 'place' ? parseRef(cardOf.ref)!.id : undefined;
  const sceneAt = tab !== TAB_NOW.id ? null : cardOf.kind === 'place' && focus ? { location: focus.id } : entityPlace ? { place: entityPlace } : null;
  const sceneSec = lensYear !== null && lensYear !== campaignYear ? sameDayIn(state.time.sec, lensYear) : state.time.sec;
  // Карта уровня (планета, континент, регион, поселение), если у места есть координаты и паспорт карты.
  const map = combat && ladder.level === 'battle' ? undefined : levelMap(state, ladder, { plan: cityView === 'plan' });
  const mapViewKey = map
    ? `${settingPackageId}:${map.passport.id}:${map.frameKey}:${map.frame.x0},${map.frame.y0},${map.frame.x1},${map.frame.y1}`
    : undefined;
  // Напряжения (Д3, ROADMAP 7.2): справочник мира — куском, когда мастеру он нужен: «Пульс», карта уровня, сцена места.
  const tensionData = useTensions(state, dmView && (shownView === 'pulse' || map !== undefined || sceneAt !== null));
  const tensions = tensionData?.list ?? null;
  // Ветки «что если» (Д4) — сторы в памяти страницы; видны только в «Пульсе» мастера.
  const branchApi = useBranches(store);
  const { scene, loading: sceneLoading } = useScene(state, sceneAt, sceneSec, dmView, tensions);
  const steps = ladderSteps(state, ladder);
  const here = focus ? childrenOf(state, focus.id) : [];
  // Цели ждущих предложений пульсируют только у мастера: на столе игроков симуляции нет вовсе.
  const pendingIds = dmView ? pendingTargets(state) : new Set<string>();
  const visibleFacts = Object.values(state.facts).filter(f => dmView || f.visibility === 'players');
  const counts = placeCounts(allEntries, state, visibleFacts);
  const factions = Object.values(state.world.factions);
  const faction = cardOf.kind === 'faction' ? state.world.factions[cardOf.id] : undefined;
  // ВЫБРАНО на уровне: место пути ниже фокуса — куда `]` спустится.
  const chosen = focus ? ladderLevels(state).filter(l => l !== 'battle' && SCALE_LEVELS.indexOf(l) > SCALE_LEVELS.indexOf(ladder.level)).map(l => ladder.path[l]).find(Boolean) : undefined;
  const chosenPlace = chosen ? state.world.locations[chosen] : undefined;

  const api = store.getState();
  const onRoll = (formula: string, label: string, intent?: StrifeRollIntent, actorId?: string, baseMode: RollMode = 'normal', baseModeLabel?: string, forceHidden = false): number => {
    const current = store.getState().state;
    const actor = actorId ? current.actors[actorId] : undefined;
    const enabled = current.a5eStrifeEnabled === true;
    const strife = enabled ? actor?.a5eConditions?.strife ?? 0 : 0;
    const strifeMode = intent ? strifeRollMode(enabled, strife, intent) : 'normal';
    const stressEffect = enabled ? activeA5eStressEffect(actor?.a5eConditions?.mentalStress, current.time.sec) : undefined;
    const stressMode = intent ? mentalStressRollMode(stressEffect, intent) : 'normal';
    const mode = resolveRollModes(baseMode, strifeMode, stressMode);
    let total: number;
    if (mode !== 'normal') {
      const sources = [baseMode !== 'normal' && baseMode === mode ? baseModeLabel ?? 'условие' : '', strifeMode === mode ? 'Strife' : '', stressMode === mode && stressEffect ? a5eStressEffectName(stressEffect.id) : ''].filter(Boolean).join(' · ');
      const rolls = [1, 2].map(index => api.rollDice(formula, { label: `${label} · ${sources}: ${mode === 'advantage' ? 'преимущество' : 'помеха'} ${index}/2`, hidden: hiddenRolls || forceHidden }).payload.total);
      total = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
    } else {
      total = api.rollDice(formula, { label, hidden: hiddenRolls || forceHidden }).payload.total;
    }
    if (dmView && stressEffect?.id === 'bewildered' && intent?.kind === 'check') {
      setNote(`${actor?.name ?? 'Персонаж'} · A5E Bewildered: если проверка проходит по Сл, дополнительный d20; 1–15 оставляет успех, 16–20 отменяет его.`);
    }
    if (dmView && stressEffect?.id === 'distorted-perceptions' && intent?.kind === 'check'
      && intent.skill === 'perception' && actor && total <= actor.passivePerception) {
      setNote(`${actor.name} · A5E Distorted Perceptions: результат Perception ${total} не выше пассивного ${actor.passivePerception}; опишите краткое искажение восприятия.`);
    }
    return total;
  };
  const scenePrestige = dmView ? {
    party,
    locations: state.world.locations,
    state,
    onProfileUpdate: (actorId: string, profile: A5ePrestigeProfile) => api.dispatch(prestigeProfileCommand(actorId, profile)),
    onRoll: (formula: string, label: string, actorId: string, mode: 'normal' | 'disadvantage') => onRoll(formula, label, undefined, actorId, mode, 'A5E Prestige'),
  } : undefined;
  const damageActor = (actorId: string, amount: number) => {
    const current = store.getState().state;
    const target = current.actors[actorId];
    if (amount > 0 && current.encounter.active && current.a5eStrifeEnabled && target) {
      const effect = activeA5eStressEffect(target.a5eConditions?.mentalStress, current.time.sec);
      if (effect?.id === 'cowed') setNote(`${target.name} получил урон при A5E Cowed: на следующем ходу Dash всем движением к безопасности; если это невозможно — Dodge.`);
      if (effect?.id === 'inimical' && target.hp.current > target.hp.max / 2
        && Math.max(0, target.hp.current - Math.max(0, amount - target.hp.temp)) <= target.hp.max / 2) {
        setNote(`${target.name} стал кровавым при A5E Inimical: на следующем ходу должен атаковать ближайшее существо с помехой.`);
      }
    }
    api.damage(actorId, amount);
  };
  const onCommand = (cmd: Command) => { api.dispatch(cmd); };
  const open = (id: string) => {
    if (!state.party.includes(id)) { setPartyExpanded(false); }
    setSelectedId(id);
    setCardOf(c => (c.kind === 'actor' ? c : { kind: 'actor' }));
    setPopoverOpen(false);
    setConcentrationOpen(false);
  };
  /**
   * Клик по токену: выбрать актёра и открыть попап хитов от этого токена (F2 — «попап хитов открывается по
   * клику на токене»). Токен ищется по data-actor в своей зоне — сетке или полосе инициативы: у актёра их два.
   */
  const openFromToken = (zone: RefObject<HTMLElement | null>) => (id: string) => {
    const el = zone.current?.querySelector<HTMLElement>(`[data-actor="${id}"]`) ?? null;
    setSelectedId(id);
    setCardOf(c => (c.kind === 'actor' ? c : { kind: 'actor' }));
    if (!dmView) return; // стол игроков: токен выбирает актёра, хиты не правит
    tokenAnchor.current = el;
    setPopoverAnchor(el ? 'token' : 'card');
    setPopoverOpen(true);
  };
  const openFromCard = () => {
    setPopoverAnchor('card');
    setPopoverOpen(true);
  };
  /**
   * Переход по лестнице меняет уровень и выбранное место, но оставляет мировое время и выбранный темп как есть.
   * Масштаб показывает рекомендацию темпа; он не продвигает часы и не переписывает выбор мастера.
   */
  const goLadder = (next: Ladder) => {
    if (next === ladder) return;
    setLadderState(next);
    setCardOf({ kind: 'place' });
    setTab(TAB_OVERVIEW.id);
    setPopoverOpen(false);
    setView('desk');
  };
  const showCard = (slot: CardSlot) => {
    setCardOf(slot);
    setTab(TAB_OVERVIEW.id);
    setPopoverOpen(false);
    setConcentrationOpen(false);
  };

  // Шаг по клавише T берёт текущий темп через ref: обработчик клавиш подписан один раз, темп меняется чаще.
  const stepRef = useRef<(steps: number) => void>(() => {});
  const moveRef = useRef<(dir: -1 | 1) => void>(() => {});
  const playersRef = useRef(playersView);
  playersRef.current = playersView;

  // Ход перешёл — карточка следует за активным актёром: что у него осталось (ресурсы, состояния, концентрация) видно
  // без клика; мастер, глядящий на другого, кликнет снова. Первый вопрос экрана — «чей ход и что с партией» (§1).
  useEffect(() => {
    if (activeId && state.actors[activeId]) {
      setSelectedId(activeId);
      setCardOf(c => (c.kind === 'actor' ? c : { kind: 'actor' }));
    }
  }, [activeId]);

  // Space — следующий ход, R — переброс последнего броска, J — журнал, T — шаг времени; только вне полей и кнопок (isDeskHotkey).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape закрывает именно менеджер и с фокуса на его триггере; общий фильтр ниже
      // намеренно не принимает клавиши с кнопок, чтобы Space не запускал действие дважды.
      if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && partyManagementOpen) {
        e.preventDefault();
        setPartyManagementOpen(false);
        setOpenRail(null);
        partyManagementTriggerRef.current?.focus();
        return;
      }
      // Стол игроков пассивен: ход, переброс и шаг времени — клавиши мастера, здесь их нет (Ctrl+Z остаётся — он не секрет).
      if (isDeskHotkey(e, 'Space')) {
        const s = store.getState();
        if (playersRef.current || !s.state.encounter.active) return;
        e.preventDefault();
        s.nextTurn();
        regainLegendary(store.getState());
      } else if (isDeskHotkey(e, 'KeyR')) {
        const last = lastRollOf(store.getState().events);
        if (playersRef.current || !last) return;
        e.preventDefault();
        store.getState().rollDice(last.roll.formula, { label: last.roll.label, hidden: hiddenRolls });
      } else if (isDeskHotkey(e, 'KeyJ')) {
        e.preventDefault();
        setView(v => (v === 'journal' ? 'desk' : 'journal'));
      } else if (isDeskHotkey(e, 'KeyN')) {
        // Тетрадь партии (Д6): у мастера и у игроков; пока пуста — вида нет, клавиша ничего не делает.
        if (!Object.keys(store.getState().state.knowledge ?? {}).length) return;
        e.preventDefault();
        setView(v => (v === 'notebook' ? 'desk' : 'notebook'));
      } else if (isDeskHotkey(e, 'KeyW')) {
        // Пульс мира (F5) — экран мастера: у игроков вида нет.
        if (playersRef.current) return;
        e.preventDefault();
        setView(v => (v === 'pulse' ? 'desk' : 'pulse'));
      } else if (isDeskHotkey(e, 'KeyH')) {
        // Хроника канона (ROADMAP Х3) — экран мастера.
        if (playersRef.current) return;
        e.preventDefault();
        setView(v => (v === 'chrono' ? 'desk' : 'chrono'));
      } else if (isDeskHotkey(e, 'KeyT')) {
        if (playersRef.current) return;
        e.preventDefault();
        stepRef.current(1);
      } else if (isDeskHotkey(e, 'KeyP')) {
        e.preventDefault();
        setPlayersView(v => !v);
      } else if (isDeskHotkey(e, 'BracketLeft') || isDeskHotkey(e, 'BracketRight')) {
        // `[` — вверх по лестнице, `]` — вниз (HANDOFF §3); навигация не секрет — работает и на столе игроков.
        e.preventDefault();
        moveRef.current(e.code === 'BracketLeft' ? -1 : 1);
      } else if (isDeskHotkey(e, 'Escape')) {
        setView('desk');
        setOpenRail(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, hiddenRolls, partyManagementOpen]);

  /** @упоминание открывает карточку: актёра — в слоте, место — прыжком лестницы к нему, фракцию — со стопки держав. */
  const onMention = (entity: 'actor' | 'location' | 'faction' | 'ref', id: string) => {
    if (entity === 'ref') { if (isEntityRef(id)) openEntity(id); return; }
    if (entity === 'actor' && state.actors[id]) { setView('desk'); open(id); }
    else if (entity === 'location' && state.world.locations[id]) goLadder(selectPlace(state, ladder, id));
    else if (entity === 'faction' && state.world.factions[id]) { showCard({ kind: 'faction', id }); setView('desk'); }
  };
  /** Карточка по ссылке «вид:id»: актёр, место кампании и фракция — своими слотами, остальное — общей карточкой. */
  const openEntity = (r: EntityRef) => {
    const p = parseRef(r);
    if (!p) return;
    setPartyExpanded(false);
    if (p.kind === 'actor' || p.kind === 'location' || p.kind === 'faction') { onMention(p.kind, p.id); return; }
    showCard({ kind: 'entity', ref: r });
    setView('desk');
  };
  /** #нить в записи — журнал с фильтром по ней (как на F7); повторный клик по чипу снимает фильтр. */
  const onThread = (id: string) => {
    setFilterThreads(t => (t.includes(id) ? t : [...t, id]));
    setView('journal');
  };
  /** Заметка — NOTE_ADDED: нити из фильтра, масштаб — из фильтра, иначе «бой» в бою и «поселение» вне его. */
  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const scale: ScaleLevel = filterScales.length === 1 ? filterScales[0] : combat ? 'battle' : 'settlement';
    api.note(text, filterThreads, scale, noteForPlayers);
    setNoteDraft('');
    setNoteForPlayers(false);
  };
  const entryProps = (entry: JournalRecord) => ({ ...journalEntryProps(entry, state), onMention, onThread });
  /** A failed preparation must not advance time past a simulation that could not run. */
  const prepareBeforeTime = async () => {
    try {
      const { prepareSimulation } = await import('../campaign/prepareSimulation');
      const prepared = await prepareSimulation();
      const activeTradeProcess = Object.values(store.getState().state.world.processes ?? {}).some(p => (p.kind === 'caravan' || p.kind === 'trade-line') && !p.ended);
      if (!prepared.ready && activeTradeProcess) {
        if (mounted.current) setNote('Данные активных торговых маршрутов недоступны; время не изменено. Повторите после восстановления данных.');
        return null;
      }
      return prepared;
    } catch (error) {
      if (mounted.current) setNote(`Торговые данные не загрузились; время не изменено. ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  const prepareCaravans = async () => (await import('../campaign/prepareSimulation')).prepareSimulation();
  const prepareRumors = async () => (await import('../campaign/prepareSimulation')).prepareSimulation();
  const sendCaravan = async (order: CaravanOrder): Promise<string> => {
    const prepared = await prepareCaravans();
    if (!mounted.current) throw new Error('Стол закрыт; караван не предложен.');
    if (!prepared.ready) throw new Error('Граф торговых путей недоступен.');
    // Validate against the latest state before recording the explicit request's cause.
    // Invalid cargo/routes must not leave a misleading campaign journal entry.
    const proposalFor = (timeEventId: string) => order.intervalDays !== undefined
      ? prepared.proposeTradeLine(store.getState().state, { ...order, intervalDays: order.intervalDays, timeEventId })
      : prepared.proposeCaravan(store.getState().state, { ...order, timeEventId });
    if (!proposalFor('caravan-preflight')) {
      throw new Error('Караван не подготовлен.');
    }
    const places = prepared.caravanPlaces();
    const from = places.find(p => p.id === order.from)!.name;
    const to = places.find(p => p.id === order.to)!.name;
    const label = order.intervalDays !== undefined ? `регулярную линию ${from} → ${to}, каждые ${order.intervalDays} дн.` : `караван ${from} → ${to}`;
    const cause = api.note(`Мастер предложил ${label}: ${GOODS_LABEL[order.goods]}, ${order.quantity} ед. запаса`, [], 'region');
    const delta = proposalFor(cause.id);
    if (!delta) throw new Error('Караван не подготовлен.');
    api.propose(delta);
    return `${order.intervalDays !== undefined ? 'Регулярная линия' : 'Караван'} ${from} → ${to} предложен во входящих. Мир изменится после принятия.`;
  };
  const sendRumor = async (order: RumorOrder): Promise<string> => {
    const prepared = await prepareRumors();
    if (!mounted.current) throw new Error('Стол закрыт; слух не предложен.');
    if (!prepared.ready) throw new Error('Граф дорог недоступен.');
    const current = store.getState().state;
    const input = { ...order, timeEventId: 'rumor-preflight' };
    prepared.proposeRumor(current, input);
    const places = prepared.rumorPlaces();
    const from = places.find(place => place.id === order.from)?.name;
    const to = places.find(place => place.id === order.to)?.name;
    if (!from || !to) throw new Error('Начальное или конечное поселение больше не доступно.');
    const cause = api.note(`Мастер отправил слух ${from} → ${to}; скорость — правило стола`, [], 'region');
    const delta = prepared.proposeRumor(store.getState().state, { ...order, timeEventId: cause.id });
    api.propose(delta);
    return `Слух ${from} → ${to} предложен во входящих; игроки узнают его после прибытия и принятия предложения.`;
  };
  const endTradeLine = async (processId: string): Promise<string> => {
    if (!mounted.current) throw new Error('Стол закрыт; остановка линии не предложена.');
    const process = store.getState().state.world.processes?.[processId];
    if (!process) throw new Error('Торговая линия больше не найдена.');
    const { tradeLineEndProposal } = await import('../campaign/caravan');
    tradeLineEndProposal(store.getState().state, processId, 'trade-line-stop-preflight');
    const cause = api.note(`Мастер предложил остановить торговую линию ${process.name}`, [], 'region');
    const delta = tradeLineEndProposal(store.getState().state, processId, cause.id);
    api.propose(delta);
    return `Остановка линии ${process.name} предложена во входящих; расписание действует до принятия.`;
  };
  const prepareWar = async () => (await import('../campaign/prepareSimulation')).prepareSimulation();
  const prepareCosmic = async () => (await import('../campaign/prepareCosmic')).prepareCosmicSimulation();
  const proposeCosmic = async (input: Omit<CosmicRequestInput, 'timeEventId'>): Promise<string> => {
    const prepared = await prepareCosmic();
    if (!mounted.current) throw new Error('Стол закрыт; космический процесс не предложен.');
    const current = store.getState().state;
    const preflight: CosmicRequestInput = { ...input, timeEventId: 'cosmic-process-preflight' };
    prepared.propose(current, preflight);
    const target = prepared.targets().find(option => option.id === input.targetId);
    if (!target) throw new Error('Цель космического процесса больше не доступна.');
    const label: Readonly<Record<CosmicRequestInput['eventKind'], string>> = {
      'blood-war': 'Война Крови', 'divine-conflict': 'конфликт богов', 'canon-cataclysm': 'катаклизм канона', authored: 'сценарий мастера',
    };
    const cause = api.note(
      `Мастер предложил процесс «${label[input.eventKind]}» у ${target.name}: ${input.text.trim()} · срок ${input.durationDays} дн.; правила и последствия заданы мастером`,
      [], target.scale,
    );
    const delta = prepared.propose(store.getState().state, { ...input, timeEventId: cause.id });
    api.propose(delta);
    return `${label[input.eventKind]} у ${target.name} предложена во входящих; процесс начнётся после принятия.`;
  };
  const prepareUrban = async () => {
    const [urban, kingdomData, organizationsModule] = await Promise.all([
      import('../campaign/urban'), import('../world/kingdoms'), import('../world/organizations'),
    ]);
    const [kingdoms, organizations, placeFaiths] = await Promise.all([
      kingdomData.loadKingdoms().catch(() => new Map()),
      organizationsModule.loadOrganizations().catch(() => undefined),
      organizationsModule.loadPlaceFaiths().catch(() => undefined),
    ]);
    return {
      proposeFamine: (current: State, locationId: string, timeEventId: string, initialOrder?: number) =>
        urban.famineProposal(current, locationId, timeEventId, initialOrder,
          urban.famineCapitalOrderFor(current, locationId, [...kingdoms.values()], harptos(current.time.sec).year)),
      epidemicTreatment: (world: State['world'], locationId: string, year: number) => {
        const location = world.locations[locationId];
        const placeId = location?.ref?.startsWith('place:') ? location.ref.slice('place:'.length) : undefined;
        return urban.confirmedTempleTreatment(placeId, year, organizations?.values(), placeFaiths);
      },
      proposeEpidemic: (current: State, locationId: string, initialCases: number, r0: number, timeEventId: string) => {
        const location = current.world.locations[locationId];
        const treatment = urban.confirmedTempleTreatment(
          location?.ref?.startsWith('place:') ? location.ref.slice('place:'.length) : undefined,
          harptos(current.time.sec).year, organizations?.values(), placeFaiths,
        );
        return urban.epidemicProposal(current, locationId, initialCases, r0, timeEventId, treatment);
      },
      proposeCityFaction: urban.cityFactionProposal,
      proposeBlockade: urban.blockadeProposal,
      endBlockade: urban.blockadeEndProposal,
      proposeFactionRelation: urban.factionRelationProposal,
    };
  };
  const proposeFamine = async (locationId: string, initialOrder?: number): Promise<string> => {
    const prepared = await prepareUrban();
    if (!mounted.current) throw new Error('Стол закрыт; голод не предложен.');
    const current = store.getState().state;
    const location = current.world.locations[locationId];
    if (!location) throw new Error('Поселение больше не доступно.');
    prepared.proposeFamine(current, locationId, 'urban-famine-preflight', initialOrder);
    const cause = api.note(`Мастер предложил начать голод в ${location.name}; явный запас еды: ${location.stock?.food}`, [], 'settlement');
    const delta = prepared.proposeFamine(store.getState().state, locationId, cause.id, initialOrder);
    api.propose(delta);
    return `Голод в ${location.name} предложен во входящих; такты начнутся после принятия.`;
  };
  const proposeEpidemic = async (locationId: string, initialCases: number, r0: number): Promise<string> => {
    const prepared = await prepareUrban();
    if (!mounted.current) throw new Error('Стол закрыт; вспышка не предложена.');
    const current = store.getState().state;
    const location = current.world.locations[locationId];
    if (!location) throw new Error('Поселение больше не доступно.');
    prepared.proposeEpidemic(current, locationId, initialCases, r0, 'urban-epidemic-preflight');
    const cause = api.note(`Мастер предложил вспышку Sewer Plague в ${location.name}: ${initialCases} исходных случаев, R₀ ${r0}`, [], 'settlement');
    const delta = prepared.proposeEpidemic(store.getState().state, locationId, initialCases, r0, cause.id);
    api.propose(delta);
    return `Вспышка в ${location.name} предложена во входящих; расчёт начнётся после принятия.`;
  };
  const proposeCityFaction = async (locationId: string): Promise<string> => {
    const prepared = await prepareUrban();
    if (!mounted.current) throw new Error('Стол закрыт; городская фракция не предложена.');
    const current = store.getState().state;
    const location = current.world.locations[locationId];
    if (!location) throw new Error('Поселение больше не доступно.');
    prepared.proposeCityFaction(current, locationId, 'urban-city-faction-preflight');
    const cause = api.note(`Мастер предложил включить ${location.name} во фракции кампании для моделирования городских отношений`, [], 'settlement');
    const delta = prepared.proposeCityFaction(store.getState().state, locationId, cause.id);
    api.propose(delta);
    return `${location.name} предложен как фракция кампании; отношения станут доступны после принятия.`;
  };
  const proposeUrbanBlockade = async (locationId: string): Promise<string> => {
    const prepared = await prepareUrban();
    if (!mounted.current) throw new Error('Стол закрыт; блокада не предложена.');
    const current = store.getState().state;
    const location = current.world.locations[locationId];
    if (!location) throw new Error('Поселение больше не доступно.');
    prepared.proposeBlockade(current, locationId, 'urban-blockade-preflight');
    const cause = api.note(`Мастер предложил городскую блокаду ${location.name}; точка выбрана вручную`, [], 'region');
    const delta = prepared.proposeBlockade(store.getState().state, locationId, cause.id);
    api.propose(delta);
    return `Блокада ${location.name} предложена во входящих; маршрут изменится после принятия.`;
  };
  const endBlockade = async (processId: string): Promise<string> => {
    const prepared = await prepareUrban();
    if (!mounted.current) throw new Error('Стол закрыт; снятие блокады не предложено.');
    const current = store.getState().state;
    const process = current.world.processes?.[processId];
    if (!process) throw new Error('Блокада больше не доступна.');
    prepared.endBlockade(current, processId, 'urban-blockade-end-preflight');
    const cause = api.note(`Мастер предложил снять блокаду ${process.name}`, [], 'region');
    const delta = prepared.endBlockade(store.getState().state, processId, cause.id);
    api.propose(delta);
    return `Снятие блокады ${process.name} предложено во входящих.`;
  };
  const proposeFactionRelation = async (a: string, b: string, value: number): Promise<string> => {
    const prepared = await prepareUrban();
    if (!mounted.current) throw new Error('Стол закрыт; отношение не предложено.');
    const current = store.getState().state;
    prepared.proposeFactionRelation(current, a, b, value, 'urban-relation-preflight');
    const first = current.world.factions[a], second = current.world.factions[b];
    if (!first || !second) throw new Error('Фракции больше не доступны.');
    const cause = api.note(`Мастер предложил отношение фракций ${first.name} и ${second.name}: ${value > 0 ? '+' : ''}${value}`, [], 'continent');
    const delta = prepared.proposeFactionRelation(store.getState().state, a, b, value, cause.id);
    api.propose(delta);
    return `Изменение отношений предложено во входящих; значение изменится после принятия.`;
  };
  const proposeWar = async (order: WarOrder): Promise<string> => {
    const prepared = await prepareWar();
    if (!mounted.current) throw new Error('Стол закрыт; война не предложена.');
    const current = store.getState().state;
    // Validate before writing a cause note so stale or malformed form values leave no journal noise.
    prepared.proposeWar(current, order, 'war-preflight');
    const cause = api.note(
      `Мастер предложил войну: ${order.sideA.name} (${order.strengthA} силы / решимость ${order.determinationA}) против ${order.sideB.name} (${order.strengthB} / ${order.determinationB}); значения введены вручную по правилу стола`,
      [], 'continent',
    );
    const delta = prepared.proposeWar(store.getState().state, order, cause.id);
    api.propose(delta);
    return `Война ${order.sideA.name} — ${order.sideB.name} предложена во входящих. Мобилизация начнётся после принятия.`;
  };
  const proposeWarBlockade = async (warProcessId: string, locationId: string): Promise<string> => {
    const prepared = await prepareWar();
    if (!mounted.current) throw new Error('Стол закрыт; блокада не предложена.');
    const current = store.getState().state;
    const war = current.world.processes?.[warProcessId];
    const location = current.world.locations[locationId];
    if (!war || !location) throw new Error('Война или поселение больше не доступны.');
    prepared.proposeBlockade(current, locationId, 'war-blockade-preflight', warProcessId);
    const cause = api.note(`Мастер предложил связать блокаду ${location.name} с войной «${war.name}»; точка выбрана вручную`, [], 'region');
    const delta = prepared.proposeBlockade(store.getState().state, locationId, cause.id, warProcessId);
    api.propose(delta);
    return `Блокада ${location.name} в связи с войной предложена во входящих; маршрут изменится после принятия.`;
  };
  const proposeWarSiege = async (warProcessId: string, locationId: string): Promise<string> => {
    const prepared = await prepareWar();
    if (!mounted.current) throw new Error('Стол закрыт; осада не предложена.');
    const current = store.getState().state;
    const location = current.world.locations[locationId];
    if (!location) throw new Error('Поселение больше не доступно.');
    prepared.proposeSiege(current, locationId, warProcessId, 'war-siege-preflight');
    const war = current.world.processes?.[warProcessId];
    if (!war) throw new Error('Война больше не доступна.');
    const cause = api.note(`Мастер предложил осаду ${location.name} в связи с войной «${war.name}»`, [], 'settlement');
    const delta = prepared.proposeSiege(store.getState().state, locationId, warProcessId, cause.id);
    api.propose(delta);
    return `Осада ${location.name} предложена во входящих; запас еды начнёт уменьшаться после принятия.`;
  };
  const proposeWarSettlement = async (warProcessId: string, outcome: WarOutcome, territoryTerms: WarSettlementTerritoryTerms = {}): Promise<string> => {
    const prepared = await prepareWar();
    if (!mounted.current) throw new Error('Стол закрыт; урегулирование не предложено.');
    const current = store.getState().state;
    const war = current.world.processes?.[warProcessId];
    if (!war) throw new Error('Война больше не доступна.');
    const preview = prepared.proposeWarSettlement(current, warProcessId, outcome, 'war-settlement-preflight', territoryTerms);
    const cause = api.note(`Мастер предложил урегулировать войну «${war.name}»; условия выбраны вручную: ${preview.now}`, [], 'continent');
    const delta = prepared.proposeWarSettlement(store.getState().state, warProcessId, outcome, cause.id, territoryTerms);
    api.propose(delta);
    return `Урегулирование войны «${war.name}» предложено во входящих; она завершится после принятия.`;
  };
  const proposeWarTerritoryControl = async (warProcessId: string, placeId: string, controllerId: string | null): Promise<string> => {
    const prepared = await prepareWar();
    if (!mounted.current) throw new Error('Стол закрыт; контроль территории не предложен.');
    const current = store.getState().state;
    const preview = prepared.proposeWarTerritory(current, warProcessId, placeId, controllerId, 'war-territory-preflight');
    const cause = api.note(`Мастер предложил запись контроля территории: ${preview.was} → ${preview.now}; исход битвы владельца не меняет`, [], 'settlement');
    const delta = prepared.proposeWarTerritory(store.getState().state, warProcessId, placeId, controllerId, cause.id);
    api.propose(delta);
    return `${preview.subject} предложено во входящих; изменение появится после принятия.`;
  };
  const proposeProcessClockVisibility = (process: Process, visible: boolean, label: string) => {
    const current = store.getState().state.world.processes?.[process.id];
    if (!current?.clock) return;
    const subject = `Часы процесса · ${current.name}`;
    if (Object.values(store.getState().state.deltas).some(d => d.status === 'pending' && d.subject === subject)) return;
    const was = current.clock.playerVisible ? `открыты игрокам: ${current.clock.playerLabel ?? ''}` : 'скрыты';
    const updatedClock = { ...current.clock, playerVisible: visible };
    if (visible) updatedClock.playerLabel = label;
    else delete updatedClock.playerLabel;
    const updated: Process = { ...current, clock: updatedClock };
    api.propose({
      id: `process-clock-visibility-${process.id}-${crypto.randomUUID()}`, scale: current.scale, subject,
      was, now: visible ? `открыты игрокам: ${label}` : 'скрыты',
      cause: 'Мастер изменил видимость часов; процесс не меняется до принятия предложения',
      causeId: current.causeId ?? current.id, status: 'pending', patch: { kind: 'process', process: updated },
    });
  };

  /** Prepare downtime commands and one deterministic forecast under a reserved time-event ID. */
  const buildTimeStepPlan = (before: State, requestedTempo: Tempo, steps: number, downtime?: { period: A5eDowntimePeriod; records: readonly A5eDowntimeActivityRecord[] }): TimeStepPreview => {
    const eventId = store.getState().reserveEventId();
    const commands: Command[] = [];
    try {
    if (downtime) {
      const participantIds = before.party.filter(id => !before.actors[id]?.removed);
      const endSec = timeStepEnd(before.time.sec, requestedTempo, steps, before.settingPackageId);
      const preparedProjects = prepareA5eDowntimePeriod(
        downtime.period,
        downtime.records,
        Object.values(before.a5eDowntimeProjects ?? {}),
        before.time.sec,
      );
      const projectsToSave = preparedProjects.updates;
      const preparedDowntime = { ...downtime, records: preparedProjects.records };
      const text = a5eDowntimeJournalText(preparedDowntime.period, participantIds, preparedDowntime.records);
      const confirmedFacts = preparedDowntime.records.flatMap(record => {
        if ((record.activity !== 'gather-information' && record.activity !== 'research') || !record.information?.check) return [];
        const info = record.information;
        if (!info.progress?.completes) return [];
        const check = info.check;
        if (!check) return [];
        const spec = a5eInformationActivitySpec(record.activity, info.obscurity);
        const outcome = a5eInformationCheckOutcome(check.total, spec.dc);
        if (outcome === 'failure' || outcome === 'failure-by-5') return [];
        const parsed = info.target ? parseRef(info.target.ref) : null;
        const target = parsed && isStateKind(parsed.kind) ? stateView(before, parsed.kind, parsed.id) : undefined;
        if (!target) throw new Error(`Сущность для фактов ${record.actorName} больше не существует.`);
        const facts = info.facts ?? [];
        const expected = outcome === 'success-by-5' ? 2 : 1;
        if (facts.length !== expected) throw new Error(`${record.actorName}: число подтверждённых фактов не соответствует результату проверки.`);
        const existingLabels = new Set((before.knowledge?.[target.ref]?.facts ?? []).map(fact => fact.label));
        for (const fact of facts) {
          if (!fact.label.trim() || !fact.value.trim() || existingLabels.has(fact.label.trim())) throw new Error(`${target.name}: факт «${fact.label.trim()}» пуст или уже известен партии.`);
          existingLabels.add(fact.label.trim());
        }
        const skill = info.skill;
        if (!skill) throw new Error(`${record.actorName}: не указан навык проверки.`);
        return facts.map(fact => ({ target, fact: { label: fact.label.trim(), value: fact.value.trim() }, actorId: record.actorId, skill, dc: spec.dc, total: check.total }));
      });
      const pendingKnowledgeLabels = new Set<string>();
      for (const item of confirmedFacts) {
        const key = `${item.target.ref}\u0000${item.fact.label}`;
        if (pendingKnowledgeLabels.has(key) || !before.actors[item.actorId]) throw new Error(`${item.target.name}: сведения повторяются или персонаж уже отсутствует.`);
        pendingKnowledgeLabels.add(key);
      }
      const keyKnowledgeAwards = new Map<string, { actorId: string; subjectRef: EntityRef; subjectName: string; amount: number }>();
      for (const item of confirmedFacts) {
        const key = `${item.actorId}\u0000${item.target.ref}`;
        const award = keyKnowledgeAwards.get(key);
        if (award) award.amount += 1;
        else keyKnowledgeAwards.set(key, { actorId: item.actorId, subjectRef: item.target.ref, subjectName: item.target.name, amount: 1 });
      }
      const downtimePayments = preparedDowntime.records.flatMap(record => {
        if (record.activity !== 'gather-information' && record.activity !== 'research') return [];
        if (record.information?.paymentCharged === false) return [];
        if (record.activity === 'research' && record.information?.suitableLibrary) return [];
        const spec = a5eInformationActivitySpec(record.activity, record.information?.obscurity ?? 'uncommon');
        const coins = Object.values(before.inventory ?? {}).filter(stack =>
          stack.owner.kind === 'actor' && stack.owner.id === record.actorId && stack.storage.kind === 'actor' && stack.storage.id === record.actorId,
        ).map(stack => ({ stackId: stack.id, itemId: stack.itemId, qty: stack.qty }));
        const payment = planA5eDowntimeCoinPayment(coins, spec.minimumCostGp);
        if (!payment) throw new Error(`${record.actorName}: нет точной оплаты минимума ${spec.minimumCostGp} gp для занятия A5E.`);
        return payment.map(item => ({ ...item, costGp: spec.minimumCostGp }));
      });
      const languageTrainingPayments = preparedDowntime.records.flatMap(record => {
        if (record.activity !== 'train') return [];
        const progress = record.training?.progress;
        const actor = before.actors[record.actorId];
        if (!progress || !actor || actor.kind !== 'pc' || actor.removed || !participantIds.includes(actor.id)) {
          throw new Error(`${record.actorName}: Train требует активного персонажа с листом и полным календарным интервалом.`);
        }
        const coins = Object.values(before.inventory ?? {}).filter(stack =>
          stack.owner.kind === 'actor' && stack.owner.id === record.actorId && stack.storage.kind === 'actor' && stack.storage.id === record.actorId,
        ).map(stack => ({ stackId: stack.id, itemId: stack.itemId, qty: stack.qty }));
        const payment = planA5eDowntimeCoinPayment(coins, progress.costChargedGp);
        if (!payment) throw new Error(`${record.actorName}: для Train нужно точно оплатить ${progress.costChargedGp} gp за ${progress.creditedMonths} засчитанный(ых) месяц(ев).`);
        return payment.map(item => ({ ...item, costGp: progress.costChargedGp, actorName: record.actorName }));
      });
      const devotion = preparedDowntime.records.filter(record => record.activity === 'religious-devotion');
      const devotionPayments = devotion.flatMap(record => {
        const detail = record.devotion;
        if (!detail) throw new Error(`${record.actorName}: не указаны параметры Religious Devotion.`);
        const deity = parseRef(detail.deityRef);
        const actor = before.actors[record.actorId];
        if (!actor || actor.kind !== 'pc' || actor.removed || !participantIds.includes(actor.id)
          || deity?.kind !== 'deity' || actor.sheet?.deity?.id !== deity.id || !detail.sacredSiteConfirmed || !detail.check) {
          throw new Error(`${record.actorName}: божество, священное место или проверка Religious Devotion изменились.`);
        }
        if (detail.offeringWaived) return [];
        const costGp = a5eDevotionActivitySpec(detail.similarity).offeringGp;
        const coins = Object.values(before.inventory ?? {}).filter(stack =>
          stack.owner.kind === 'actor' && stack.owner.id === record.actorId && stack.storage.kind === 'actor' && stack.storage.id === record.actorId,
        ).map(stack => ({ stackId: stack.id, itemId: stack.itemId, qty: stack.qty }));
        const payment = planA5eDowntimeCoinPayment(coins, costGp);
        if (!payment) throw new Error(`${record.actorName}: нет точной оплаты подношения ${costGp} gp для Religious Devotion.`);
        return payment.map(item => ({ ...item, costGp }));
      });
      const devotionAwards = devotion.flatMap(record => {
        const detail = record.devotion;
        if (!detail?.check) return [];
        const amount = a5eDevotionFavorAward(detail.check.total, a5eDevotionActivitySpec(detail.similarity).dc);
        return amount > 0 ? [{ actorId: record.actorId, deityRef: detail.deityRef, deityName: detail.deityName, similarity: detail.similarity, skill: detail.skill, checkTotal: detail.check.total, amount }] : [];
      });
      const workResolutions = preparedDowntime.records.flatMap(record => {
        if (record.activity !== 'work' || !record.work?.check) return [];
        if (preparedDowntime.period !== 'tenday') throw new Error('Legal Work автоматизирована только для одной десятидневки.');
        const actor = before.actors[record.actorId];
        if (!actor || actor.kind === 'monster' || actor.removed || !participantIds.includes(actor.id)) throw new Error(`${record.actorName}: персонаж больше не участник активной партии.`);
        const work = record.work;
        const spec = a5eWorkActivitySpec(work.difficulty);
        const check = work.check!;
        const succeeded = check.total >= spec.dc;
        const earningsGp = work.earnings?.gp ?? 0;
        const disadvantageApplied = actor.a5eWorkDisadvantageSkills?.includes(work.skill) === true;
        if (succeeded !== !!work.earnings || work.disadvantageApplied !== disadvantageApplied) throw new Error(`${record.actorName}: результат, помеха или доход Legal Work изменились после проверки.`);
        return [{ record, work, check, earningsGp, disadvantageApplied }];
      });
      const relaxing = preparedDowntime.records.filter(record => record.relaxStrife);
      if (relaxing.length) {
        const placeId = partyPlaceId(before);
        const place = placeId ? before.world.locations[placeId] : undefined;
        if (!before.a5eStrifeEnabled || !place?.haven) throw new Error('«Развеяться» доступно только при включённой теме Strife и в укрытии.');
        for (const record of relaxing) {
          const actor = before.actors[record.actorId];
          if (!actor || actor.removed || !participantIds.includes(record.actorId) || (actor.a5eConditions?.strife ?? 0) < 1) {
            throw new Error(`Нельзя снять Strife у ${record.actorName}: изменилось состояние персонажа.`);
          }
          if ((actor.a5eDowntimeRelaxUntilSec ?? 0) > before.time.sec) throw new Error(`${record.actorName} уже использовал «Развеяться» в текущем промежутке.`);
        }
        for (const record of relaxing) {
          const actor = before.actors[record.actorId]!;
          commands.push({ type: 'A5E_TRACK_SET', payload: {
            actorId: actor.id, track: 'strife', level: (actor.a5eConditions?.strife ?? 0) - 1, downtimeRelaxUntilSec: endSec,
          } });
        }
      }
      for (const payment of downtimePayments) {
        commands.push({ type: 'ITEM_LOST', payload: { stackId: payment.stackId, qty: payment.qty, reason: `A5E SRD Adventuring §8 · expenses, ${payment.costGp} gp` } });
      }
      for (const payment of languageTrainingPayments) {
        commands.push({ type: 'ITEM_LOST', payload: { stackId: payment.stackId, qty: payment.qty, reason: `A5E SRD Adventuring §8 · Train language with tutor · ${payment.costGp} gp` } });
      }
      for (const payment of devotionPayments) {
        commands.push({ type: 'ITEM_LOST', payload: { stackId: payment.stackId, qty: payment.qty, reason: `A5E SRD Adventuring §8 · sacred offering, ${payment.costGp} gp` } });
      }
      for (const project of projectsToSave) {
        commands.push({ type: 'A5E_DOWNTIME_PROJECT_UPDATED', payload: { project } });
      }
      for (const award of keyKnowledgeAwards.values()) {
        if (award.amount !== 1 && award.amount !== 2) throw new Error('A5E Key Knowledge award must be one or two points.');
        commands.push({ type: 'A5E_KEY_KNOWLEDGE_EARNED', payload: {
          ...award, amount: award.amount as 1 | 2, source: 'a5e-srd:adventuring-8',
        } });
      }
      for (const award of devotionAwards) {
        commands.push({ type: 'A5E_FAVOR_EARNED', payload: { ...award, source: 'a5e-srd:adventuring-8' } });
      }
      for (const resolution of workResolutions) {
        const { record, work, check, earningsGp, disadvantageApplied } = resolution;
        commands.push({ type: 'A5E_WORK_RESOLVED', payload: {
          actorId: record.actorId, skill: work.skill, difficulty: work.difficulty, total: check.total,
          disadvantageApplied, ...(work.earnings?.dice ? { earningsDice: work.earnings.dice } : {}), earningsGp,
          source: 'a5e-srd:adventuring-8',
        } });
        if (earningsGp > 0) commands.push({ type: 'ITEM_GAINED', payload: { stack: {
          id: `a5e-work:${record.actorId}:${crypto.randomUUID()}`, itemId: 'coin:gp', qty: earningsGp,
          owner: { kind: 'actor', id: record.actorId }, storage: { kind: 'actor', id: record.actorId },
        } } });
      }
      commands.push({ type: 'NOTE_ADDED', payload: { text, threadIds: [], scale: 'region' } });
      for (const { target, fact, actorId, skill, dc, total } of confirmedFacts) {
        commands.push({ type: 'KNOWLEDGE_REVEALED', payload: {
          ref: target.ref, name: target.name, fact, by: actorId,
          // Hidden rolls stay hidden; the accepted fact itself is intentionally player-visible.
          ...(hiddenRolls ? {} : { check: { skill, dc, total } }),
        } });
      }
    }
    return previewTimeStep(before, requestedTempo, steps, eventId, store.getState().events.length, commands);
    } catch (error) {
      store.getState().releaseReservedEventId(eventId);
      throw error;
    }
  };
  const commitTimeStep = (plan: TimeStepPreview) => {
    const { event, proposals } = commitTimeStepPlan(store.getState(), plan);
    setLastStep({ eventId: event.id, deltaIds: proposals.map(d => d.id) });
    setView('time');
  };
  const requestTimeStep = async (steps: number, requestedTempo: Tempo = tempo, downtime?: { period: A5eDowntimePeriod; records: readonly A5eDowntimeActivityRecord[] }) => {
    if (timeRequestBusy.current || timePreview || !dmView) return;
    timeRequestBusy.current = true;
    setStepPreparing(true);
    try {
      if (!await prepareBeforeTime()) return;
      if (!mounted.current) return;
      const current = store.getState().state;
      if (current.encounter.active && requestedTempo !== 'round') { setNote('Начался бой: выберите шаг времени заново.'); return; }
      const plan = buildTimeStepPlan(current, requestedTempo, steps, downtime);
      if (needsTimePreview(current.time.sec, requestedTempo, steps, current.settingPackageId)) {
        setTimePreview(plan);
        setTimePreviewStale(false);
        setTimePreviewDowntime(downtime ?? null);
      } else commitTimeStep(plan);
    } catch (err) {
      if (mounted.current) setNote(`Шаг не выполнен: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      timeRequestBusy.current = false;
      if (mounted.current) setStepPreparing(false);
    }
  };
  const applyDowntime = (period: A5eDowntimePeriod, records: readonly A5eDowntimeActivityRecord[]) => {
    try {
      const { tempo: periodTempo, steps } = downtimeTimeStep(period);
      const identified = records.map(record => (record.activity === 'gather-information' || record.activity === 'research') && record.information && !record.information.projectId
        ? { ...record, information: { ...record.information, projectId: `d10-${crypto.randomUUID()}` } }
        : record);
      void requestTimeStep(steps, periodTempo, { period, records: identified });
    } catch (error) {
      setNote(`Промежуток не подготовлен: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const rollDowntimeCheck = (actorId: string, skill: SkillId, _shownModifier: number, dc: number, disadvantage = false, forceHidden = false) => {
    const actor = store.getState().state.actors[actorId];
    const modifier = actor ? sheetViewOf(actor)?.skills.find(row => row.id === skill)?.mod : undefined;
    if (!actor || actor.removed || modifier === undefined) throw new Error('У персонажа нет листа для этого броска; введите итог вручную.');
    const formula = `1d20${modifier < 0 ? modifier : `+${modifier}`}`;
    const total = onRoll(formula, `${actor.name} · ${SKILL_LABEL[skill]} · A5E downtime DC ${dc}`, { kind: 'check', ability: SKILLS[skill].ability, skill }, actorId,
      disadvantage ? 'disadvantage' : 'normal', disadvantage ? 'провал A5E Work' : undefined, forceHidden);
    return { die: total - modifier, total };
  };
  const rollDowntimeEarnings = (actorId: string, formula: string, label: string) => {
    const actor = store.getState().state.actors[actorId];
    if (!actor || actor.removed || !store.getState().state.party.includes(actorId)) throw new Error('Персонаж больше не участвует в партии.');
    const result = store.getState().rollDice(formula, { label, hidden: true }).payload;
    return { dice: result.dice, total: result.total };
  };
  const onStep = (steps: number) => requestTimeStep(steps);
  const applyTimePreview = () => {
    if (!timePreview || !dmView) return;
    const current = store.getState().state;
    if (current.encounter.active) { store.getState().releaseReservedEventId(timePreview.eventId); setTimePreview(null); setTimePreviewDowntime(null); setNote('Начался бой: большой шаг отменён.'); return; }
    if (current !== timePreview.state || store.getState().events.length !== timePreview.baseLength) {
      store.getState().releaseReservedEventId(timePreview.eventId);
      try {
        setTimePreview(buildTimeStepPlan(current, timePreview.tempo, timePreview.steps, timePreviewDowntime ?? undefined));
        setTimePreviewStale(true);
      } catch (error) {
        setTimePreview(null);
        setTimePreviewDowntime(null);
        setNote(`Прогноз не пересчитан: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    setTimePreview(null);
    try {
      commitTimeStep(timePreview);
      setTimePreviewDowntime(null);
    } catch (error) {
      setNote(`Промежуток не применён: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  /** «Перейти к этому дню» (Д5): шаг днями до выбранного дня — тот же шаг времени, время суток то же. */
  const goToDay = async (daySec: number) => {
    const current = store.getState().state;
    const n = Math.round((daySec - Math.floor(current.time.sec / SECONDS_PER_DAY) * SECONDS_PER_DAY) / SECONDS_PER_DAY);
    if (n <= 0) return;
    await requestTimeStep(n, 'day');
  };
  const decide = (deltaId: string, verdict: 'accept' | 'reject') => (verdict === 'accept' ? api.accept(deltaId) : api.reject(deltaId));
  /** Бросок для редактора инициативы и новичков: DICE_ROLLED в лог (скрытость — как у прочих бросков мастера), итог — числом. */
  const rollTotal = (formula: string, label: string, actorId?: string, intent?: StrifeRollIntent) => actorId
    ? onRoll(formula, label, intent ?? { kind: 'initiative' }, actorId)
    : api.rollDice(formula, { label, hidden: hiddenRolls }).payload.total;
  const rollKnowledgeWithKeyKnowledge = (actorId: string, subjectRef: EntityRef, subjectName: string, skill: SkillId, dc: number, modifier: number): number | null => {
    const current = store.getState().state;
    const actor = current.actors[actorId];
    if (!actor || actor.kind !== 'pc' || actor.removed || !current.party.includes(actorId)
      || (actor.a5eKeyKnowledge?.[subjectRef] ?? 0) < 1 || !Number.isSafeInteger(dc) || dc < 1) {
      setNote('Key Knowledge по этому субъекту сейчас недоступен.');
      return null;
    }
    const intent: StrifeRollIntent = { kind: 'check', ability: SKILLS[skill].ability, skill };
    const enabled = current.a5eStrifeEnabled === true;
    const strifeMode = strifeRollMode(enabled, actor.a5eConditions?.strife ?? 0, intent);
    const stressEffect = enabled ? activeA5eStressEffect(actor.a5eConditions?.mentalStress, current.time.sec) : undefined;
    const stressMode = mentalStressRollMode(stressEffect, intent);
    const finalMode = resolveRollModes('advantage', strifeMode, stressMode);
    const formula = d20Formula(modifier);
    if (finalMode !== 'advantage') {
      setNote('Помеха отменяет преимущество на этой проверке; Key Knowledge сохранён.');
      return onRoll(formula, `${actor.name}: ${SKILLS[skill].name} · ${subjectName}`, intent, actorId);
    }
    const total = onRoll(formula, `${actor.name}: ${SKILLS[skill].name} · Key Knowledge · ${subjectName}`, intent, actorId, 'advantage', 'Key Knowledge');
    store.getState().dispatch({ type: 'A5E_KEY_KNOWLEDGE_SPENT', payload: {
      actorId, subjectRef, subjectName, skill, dc, total, source: 'a5e-srd:adventuring-8',
    } });
    return total;
  };
  const initiativeRows: InitiativeRow[] = encounterCandidates(state).map(a => ({
    id: a.id, name: a.name, kind: a.kind, mod: initiativeMod(a), initiative: a.initiative,
    ...(a.kind === 'monster' && lairActionsOf(a.monsterId) ? { lairProfile: true } : {}),
  }));
  /** Порядок из редактора: до боя — ENCOUNTER_STARTED с ним, в бою — INITIATIVE_SET (ход остаётся у того, чей был). */
  const applyInitiative = (order: InitiativeEntry[], lairContextConfirmed?: boolean) => {
    if (combat) api.setInitiative(order);
    else {
      const current = store.getState().state;
      const lostFirstRoundActions: string[] = [];
      for (const entry of order) {
        const actor = current.actors[entry.actorId];
        if (!actor || !current.a5eStrifeEnabled || activeA5eStressEffect(actor.a5eConditions?.mentalStress, current.time.sec)?.id !== 'obsessed') continue;
        const monster = actor.monsterId ? MONSTERS[actor.monsterId] : undefined;
        const wisSave = sheetViewOf(actor)?.abilities.find(ability => ability.id === 'wis')?.save
          ?? monster?.savingThrows.wis
          ?? (monster ? Math.floor((monster.abilities.wis - 10) / 2) : undefined);
        if (wisSave === undefined) {
          setNote(`${actor.name}: A5E Obsessed требует спасбросок Мудрости Сл 15 перед боем, но у записи нет подтверждённого модификатора.`);
          continue;
        }
        const total = onRoll(`1d20${wisSave > 0 ? `+${wisSave}` : wisSave < 0 ? wisSave : ''}`, `A5E Obsessed · спасбросок Мудрости Сл 15 · ${actor.name}`, { kind: 'save', ability: 'wis' }, actor.id);
        if (total < 15) lostFirstRoundActions.push(actor.id);
      }
      api.startEncounter(order, undefined, lostFirstRoundActions, lairContextConfirmed ?? false);
      // Первый ход боя — тоже начало хода: легендарному существу возвращается потраченное в прошлом бою (Q13).
      regainLegendary(store.getState());
    }
    setInitiativeOpen(false);
  };
  /** Легендарное действие с полосы (Q13): RESOURCE_SPENT на стоимость варианта; максимум — из абзаца блока. */
  const legendaryMax = (id: string) => {
    const a = store.getState().state.actors[id];
    return a ? legendaryTrackOf(a)?.max : undefined;
  };
  const spendLegendary = (id: string, amount: number) => {
    const max = legendaryMax(id);
    if (max !== undefined) api.spendResource(id, LEGENDARY_RESOURCE, max, amount);
  };
  const restoreLegendary = (id: string, amount: number) => {
    const max = legendaryMax(id);
    if (max !== undefined) api.restoreResource(id, LEGENDARY_RESOURCE, max, amount);
  };
  const useLairAction = (actorId: string, optionId: string) => {
    const actor = store.getState().state.actors[actorId];
    const profile = lairActionsOf(actor?.monsterId);
    const option = profile?.options.find(candidate => candidate.id === optionId);
    const current = store.getState().state.encounter;
    if (!actor || !profile || !option || !current.active || !current.lairActionWindow
      || (current.lairContextVersion === 1 && current.lairContextConfirmed !== true)) return;
    api.dispatch({ type: 'LAIR_ACTION_USED', payload: {
      actorId, optionId, optionName: option.name, source: profile.source, round: current.lairActionWindow.round,
    } });
  };
  const monsterTokenArt = {
    goblin: 'codex-creature-goblin-v1', wolf: 'codex-creature-wolf-v1',
    bugbear: 'codex-creature-bugbear-v1', nothic: 'codex-creature-nothic-v1', skeleton: 'codex-creature-skeleton-v1',
  } as const;
  const spawnOptions: SpawnOption[] = MONSTER_IDS.map(id => {
    const m = MONSTERS[id];
    const baseId = id.replace(/^(?:bf|a5e)-/, '');
    const movement: NonNullable<SpawnOption['movement']>[number][] = [
      ...(m.speed > 0 ? ['walk' as const] : []),
      ...(/\bfly\b/i.test(m.speedText) ? ['fly' as const] : []),
      ...(/\bswim\b/i.test(m.speedText) ? ['swim' as const] : []),
      ...(/\bclimb\b/i.test(m.speedText) ? ['climb' as const] : []),
      ...(/\bburrow\b/i.test(m.speedText) ? ['burrow' as const] : []),
    ];
    return {
      id, name: m.name, cr: m.cr, ac: m.ac.value, hp: m.hp.average,
      size: m.size, creatureType: m.type.split('(')[0].trim(), movement,
      legendary: Boolean(m.legendary?.length),
      ...(baseId === 'goblin' ? { tokenSrc: 'art/local-tokens/goblin-free.webp' } : {}),
      ...(baseId in monsterTokenArt ? { token: monsterTokenArt[baseId as keyof typeof monsterTokenArt] } : {}),
      origin: MONSTER_ORIGIN_LABEL[monsterOrigin(m)], suggested: suggestMonsterName(state, id), humanoid: /humanoid/i.test(m.type),
    };
  });
  const suggestName = (monsterId: string) => isMonsterReference(monsterId)
    ? suggestNpcName(store.getState().state, MONSTERS[monsterId].type)
    : Promise.resolve(null);
  /**
   * Противник появился: ACTOR_SPAWNED на каждого снимком; в бою — бросок инициативы каждому и INITIATIVE_SET
   * с прежними бросками остальных (порядок — снимком целиком, §7). Первый новичок — в слоте карточки.
   */
  const onSpawn = (monsterId: string, name: string, count: number) => {
    if (!isMonsterReference(monsterId)) {
      setNote('Неизвестная запись чудовища; актёр не создан.');
      return;
    }
    const plan = planReferenceActivation(store.getState().state, { kind: 'monster', monsterId, name, count });
    if (plan.kind !== 'actors') return;
    const actors = plan.actors;
    for (const a of actors) api.spawn(a);
    if (combat) {
      const fresh = actors.map(a => ({ actorId: a.id, initiative: rollTotal(initiativeFormula(initiativeMod(a)), `Инициатива · ${a.name}`, a.id) }));
      api.setInitiative(sortInitiative([...currentOrder(store.getState().state), ...fresh]));
    }
    setSpawnOpen(false);
    setSpawnPick(undefined);
    open(actors[0].id);
  };
  const startConcentration = (spell: string, durationSec?: number) => {
    if (!actor) return;
    api.startConcentration(actor.id, spell, durationSec === undefined ? undefined : state.time.sec + durationSec);
    setConcentrationOpen(false);
  };
  const festival = isForgottenRealms ? nextFestival(state.time.sec) : undefined;
  // Святой день меняется раз в сутки: перебор года по дням — только при смене дня.
  const today = Math.floor(state.time.sec / SECONDS_PER_DAY);
  // Сначала святые дни богов партии (E8): ключ — их id, чтобы пересчёт шёл и при смене бога на листе.
  const partyGods = [...partyDeitiesOf(state).keys()].sort().join(',');
  const holy = useMemo(
    () => isForgottenRealms ? nextHolyDayFor(today * SECONDS_PER_DAY, eraOfSetting(calendar.yearAt(today * SECONDS_PER_DAY), settingPackageId), new Set(partyGods ? partyGods.split(',') : [])) : undefined,
    [today, partyGods, isForgottenRealms, calendar, settingPackageId],
  );
  // Погода — проекция календаря (§4): день задаёт её целиком, ни состояния, ни события.
  const weather = weatherOf(state.time.sec);
  // Полосы F9: те же иконки в том же порядке, что секции панелей; счётчик — сколько ждёт решения.
  const toolsRailItems: IconRailItem[] = dmView
    ? [
      { id: 'actions', icon: 'reroll', label: 'Действия' },
      { id: 'inbox', icon: 'inbox', label: 'Входящие', badge: pending.length, color: 'var(--src-sim)' },
      { id: 'journal', icon: 'journal', label: shownView === 'journal' ? 'Нити' : 'Журнал' },
    ]
    : [
      { id: 'chronicle', icon: 'threads', label: 'Хроника похода' },
      { id: 'journal', icon: 'journal', label: 'Журнал' },
    ];
  const lastToolsRailItem = useRef<string | null>(null);
  useEffect(() => {
    if (openRail?.side === 'tools') lastToolsRailItem.current = openRail.item;
  }, [openRail]);
  const pendingToolsFocus = useRef<{ kind: 'rail'; itemId: string } | { kind: 'panel' } | null>(null);
  useEffect(() => {
    const pending = pendingToolsFocus.current;
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      let target: HTMLButtonElement | undefined;
      if (pending.kind === 'rail') {
        const railLabel = dmView ? 'Инструменты' : 'Хроника';
        const nav = [...document.querySelectorAll<HTMLElement>(`nav[aria-label="${railLabel}"]`)]
          .find(el => el.getBoundingClientRect().width > 0);
        const order = dmView ? ['actions', 'inbox', 'journal'] : ['chronicle', 'journal'];
        target = nav?.querySelectorAll<HTMLButtonElement>('button')[order.indexOf(pending.itemId)];
      } else {
        target = [...document.querySelectorAll<HTMLButtonElement>('aside[aria-label="Журнал и отмена"] button[title="Свернуть панель в полосу иконок"], aside[aria-label="Хроника похода"] button[title="Свернуть панель в полосу иконок"]')]
          .find(el => el.getBoundingClientRect().width > 0);
      }
      target?.focus();
      pendingToolsFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [railTools, openRail, dmView]);
  const focusAfterToolsRailChange = (pending: { kind: 'rail'; itemId: string } | { kind: 'panel' }) => { pendingToolsFocus.current = pending; };
  const toolsPin = railTools ? (
    <button type="button" title="Закрепить панель на столе" onClick={() => { setRailTools(false); setOpenRail(null); focusAfterToolsRailChange({ kind: 'panel' }); }} className={`ml-auto ${BTN_HEAD}`}>Закрепить</button>
  ) : (
    <button type="button" title="Свернуть панель в полосу иконок" onClick={() => { setRailTools(true); focusAfterToolsRailChange({ kind: 'rail', itemId: lastToolsRailItem.current ?? (dmView ? 'actions' : 'chronicle') }); }} className={`ml-auto ${BTN_HEAD}`}>Свернуть</button>
  );
  const restRows: RestRow[] = restCandidates(state).map(a => {
    const hd = hitDiceOf(a);
    return {
      id: a.id, name: a.name, kind: a.kind, hp: a.hp, conMod: conModOf(a),
      wisSave: sheetViewOf(a)?.abilities.find(ability => ability.id === 'wis')?.save,
      perception: sheetViewOf(a)?.skills.find(skill => skill.id === 'perception')?.mod,
      hitDice: hd ? { die: hd.die, available: hd.available, total: hd.total, ...(hd.reference ? { reference: hd.reference } : {}) } : undefined,
      exhaustion: a.conditions.exhaustion?.level,
      a5eConditions: a.a5eConditions,
      a5eLastLongRestAt: a.a5eLastLongRestAt,
      shortRestores: restResourcesOf([a], 'short').map(r => poolLabel(resourcePoolsOf(a).find(p => p.id === r.resourceId)!)),
      longRestores: resourcePoolsOf(a).filter(p => p.spent > 0).map(poolLabel),
    };
  });
  /**
   * Отдых — час или восемь часов времени (симуляция предлагает, что случилось в мире) и REST_TAKEN. Есть предложения —
   * главная зона «Время» со сводкой, как после шага; нет — стол остаётся: хиты видны в корешке.
   */
  const onRest = async (kind: RestKind, actorIds: string[], hitDice: RestHitDice[], context: RestContext) => {
    const beforeRest = store.getState().state;
    const a5eAttemptFailed = kind === 'long' && context.layer === 'a5e' && !a5eRestCompletes(context);
    const durationHours = context.a5eDurationHours ?? 8;
    const failedSleepless = new Set(context.a5eSleeplessFailedActorIds ?? []);
    const belowMinimum = !a5eAttemptFailed && kind === 'long' && context.layer === 'a5e'
      ? actorIds.find(id => !failedSleepless.has(id) && (beforeRest.actors[id]?.hp.current ?? 0) < 1)
      : undefined;
    if (belowMinimum) {
      setNote(`${beforeRest.actors[belowMinimum]?.name ?? belowMinimum}: для долгого отдыха A5E нужно хотя бы 1 HP в начале отдыха. Время и состояние не изменены.`);
      return;
    }
    if (!a5eAttemptFailed && kind === 'long' && context.layer === 'a5e' && actorIds.some(id => {
      if (failedSleepless.has(id)) return false;
      const last = beforeRest.actors[id]?.a5eLastLongRestAt;
      return last !== undefined && beforeRest.time.sec + durationHours * 3600 < last + 86_400;
    })) {
      setNote('A5E: долгий отдых не принят — один из персонажей завершил бы его раньше чем через 24 часа после предыдущего. Время и состояние кампании не изменены.');
      return;
    }
    if (!await prepareBeforeTime()) return;
    if (!mounted.current) return;
    const current = store.getState().state;
    // Короткий отдых возвращает ресурсы по правилу SRD (система предлагает — форма показала список); долгий — все сам.
    const resting = actorIds.map(id => current.actors[id]).filter((a): a is Actor => a !== undefined);
    const resources = restResourcesOf(resting, 'short');
    const { time, proposals } = takeRest(store.getState(), kind, actorIds, hitDice, resources, context);
    setRestOpen(false);
    if (proposals.length > 0) {
      setLastStep({ eventId: time.id, deltaIds: proposals.map(d => d.id) });
      setView('time');
    }
  };
  const setLocationHaven = (locationId: string, haven: boolean) => {
    const current = store.getState().state;
    const delta = locationHavenDelta(current, locationId, haven);
    if (!delta) return;
    const currentApi = store.getState();
    currentApi.propose(delta);
    currentApi.accept(delta.id);
  };
  const restingPlaceId = partyPlaceId(state);
  const restingPlace = restingPlaceId ? state.world.locations[restingPlaceId] : undefined;
  /** Поход по карте — дни пути шагом времени (с предложениями мира за эти дни) и PARTY_TRAVELED; сводка — как после отдыха. */
  const { terrain, roads, underdark, gazetteer, schema } = useMapData(map);

  /**
   * Поход по A5E: уровень опасности — ступень партии по старшему уровню; встреча — d100 в лог (DICE_ROLLED) и итог
   * строкой журнала (NOTE_ADDED, масштаб «регион»). Попал в дыру таблицы — так и пишем: бросок повторяют.
   */
  const [journeyReady, setJourneyReady] = useState(journeyLoaded);
  // Правила похода A5E — отдельный кусок (ROADMAP 0.5): грузятся после первой отрисовки, панель регионов — по готовности.
  useEffect(() => {
    if (journeyReady) return;
    let live = true;
    void loadJourney().then(() => { if (live) setJourneyReady(true); });
    return () => { live = false; };
  }, [journeyReady]);
  const journeyTier = tierOfLevel(Math.max(1, ...party.map(a => a.sheet?.level ?? 1)));
  const journey: JourneyProps = {
    tier: journeyTier,
    members: party.length,
    onEncounter: regionId => {
      const region = JOURNEY_REGIONS[regionId];
      const roll = rollTotal('1d100', `Встреча · ${region.name}, уровень ${journeyTier}`);
      const row = encounterAt(regionId, journeyTier, roll);
      const what = row ? `${row.name}${row.giant && roll % 2 === 1 ? ' (giant)' : ''} — ${ENCOUNTER_TYPE_LABEL[row.type]}` : 'дыра таблицы, бросьте ещё раз';
      api.note(`${region.name}, уровень ${journeyTier}: d100 = ${roll} → ${what}`, [], 'region');
      setLastEncounter({ regionId, text: `d100 = ${roll} → ${what}`, ...(row?.type === 'monster' ? { monsterId: encounterMonsterId(row.name) } : {}) });
    },
    ...(lastEncounter ? {
      encounter: {
        regionId: lastEncounter.regionId,
        text: lastEncounter.text,
        ...(lastEncounter.monsterId ? { onAppear: () => { setSpawnPick(lastEncounter.monsterId); setSpawnOpen(true); } } : {}),
      },
    } : {}),
    // «Roll a d20 for weather once for each region. In the winter season, add 5 to the roll, unless … warm» (A5E).
    onWeather: regionId => {
      const region = JOURNEY_REGIONS[regionId];
      const winter = seasonOf(state.time.sec) === 'winter' && !WARM_REGIONS.has(regionId);
      const roll = rollTotal('1d20', weatherRollLabel(region.name));
      api.note(`${region.name}: погода d20 = ${roll}${winter ? ' +5 (зима)' : ''} → ${weatherAt(regionId, roll, winter) ?? '—'}`, [], 'region');
    },
    supply: supplyOf(state),
    activities: (regionId, dc, days) => {
      const region = JOURNEY_REGIONS[regionId];
      const members: ActivityMember[] = party.map(a => ({
        id: a.id, name: a.name,
        skills: Object.fromEntries((sheetViewOf(a)?.skills ?? []).map(sk => [sk.id, sk.mod])),
      }));
      // Преимущество и помеха — два броска d20 в журнале, засчитывается лучший или худший.
      const onRoll = (label: string, mod: number, mode: RollMode) => {
        const formula = `1d20${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`;
        const rolls = (mode === 'normal' ? [1] : [1, 2]).map(i => api.rollDice(formula, { label: mode === 'normal' ? label : `${label} · ${mode === 'advantage' ? 'преимущество' : 'помеха'} ${i}/2`, hidden: hiddenRolls }).payload);
        const pick = rolls.reduce((a, b) => (mode === 'disadvantage' ? (b.dice[0] < a.dice[0] ? b : a) : (b.dice[0] > a.dice[0] ? b : a)));
        return { natural: pick.dice[0], total: pick.total };
      };
      return (
        <JourneyActivities
          regionName={region.name}
          regionNote={region.fields['Journey Activities']}
          dc={dc}
          activities={JOURNEY_ACTIVITIES}
          mods={regionActivityMods(region)}
          members={members}
          onRoll={onRoll}
          onOutcome={(who, a, outcome, line) => {
            api.note(`${region.name} · ${a.name} · ${who}: ${OUTCOME_LABEL[outcome]}${line ? ` — ${line}` : ''}`, [], 'region');
            // «The adventurer gains 1 Supply per day spent doing this journey activity», критический — вдвое (A5E). Ядовитый
            // припас критического провала — не еда: в запас не идёт, усталость ставит мастер.
            if (a.id === 'hunt-and-gather' && (outcome === 'success' || outcome === 'criticalSuccess')) {
              api.changeSupply('foraged', Math.ceil(days) * (outcome === 'criticalSuccess' ? 2 : 1));
            }
          }}
        />
      );
    },
  };
  const onTravel = async (route: TravelRoute) => {
    if (!map) return;
    if (!await prepareBeforeTime()) return;
    if (!mounted.current) return;
    const current = store.getState().state;
    const { time, proposals } = travel(store.getState(), { ...route, map: map.passport.id, fromId: partyPlaceId(current) });
    if (proposals.length > 0) {
      setLastStep({ eventId: time.id, deltaIds: proposals.map(d => d.id) });
      setView('time');
    }
  };
  stepRef.current = onStep;
  moveRef.current = dir => goLadder(moveLevel(state, ladder, dir));

  // Бой начался — лестница на уровень боя (главная зона — сетка); кончился — normalizeLadder вернёт на место,
  // откуда бой начался, а темп часов — на темп того уровня. Эффект, а не вычисление: это ответ на событие.
  const ladderRef = useRef(ladderState);
  ladderRef.current = ladderState;
  useEffect(() => {
    const s = store.getState().state;
    const l = ladderRef.current;
    const next = s.encounter.active ? jumpTo(s, l, 'battle') : normalizeLadder(s, l);
    if (next === l) return;
    setLadderState(next);
  }, [store, combat]);

  // Не Popover.Trigger: он регистрирует себя якорем попапа в своём эффекте, который бежит после эффекта
  // нашего Popover.Anchor, и попап уезжал в (0, 0). Обычная кнопка с data-hp-opener: клик по ней и по ячейке
  // HP не считается «кликом вне» (см. onInteractOutside), поэтому попап не мигает закрытием и открытием.
  const hpTrigger = (
    <button
      type="button"
      data-hp-opener=""
      aria-haspopup="dialog"
      aria-expanded={popoverOpen}
      title="Урон, лечение, временные хиты"
      onClick={openFromCard}
      className={BTN}
    >
      Хиты
    </button>
  );
  // Концентрация — свой попап от кнопки в теле карточки: Trigger здесь обычный, якорь у него один и свой.
  const cardTools = (
    <div className="flex items-center gap-1">
      {hpTrigger}
      <Popover.Root open={concentrationOpen} onOpenChange={setConcentrationOpen}>
        <Popover.Trigger asChild>
          <button type="button" title="Начать концентрацию: заклинание и срок" className={BTN}>Концентрация</button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Концентрация" className="z-20 outline-none">
            {actor ? <ConcentrationForm current={actor.concentration?.spell} options={concentrationSpellsOf(actor)} onStart={startConcentration} /> : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
  /** Клик по открывающим элементам и токенам — не «вне попапа»: иначе pointerdown закрыл бы его, а click открыл заново. */
  const keepOpenOnOpeners = (e: { target: EventTarget | null; preventDefault: () => void }) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('[data-hp-opener], [data-part="stats"] button, [data-actor]')) e.preventDefault();
  };

  const shownActor = actor && !dmView ? withPlayerVisibleInventory(actor, state.inventory ?? {}) : actor;
  const cardView = shownActor ? sheetViewOf(shownActor) : undefined;
  // Шансы блока монстра — по партии на столе (ROADMAP 5.2); только мастеру: MonsterActions у игроков не рисуется.
  const oddsTargets = party.filter(a => !a.removed).map(oddsTargetOf);
  // Шансы листа (5.3) — по блокам противников на столе: одинаковые блоки одной строкой «Bandit ×3».
  const byBlock = new Map<string, Actor[]>();
  for (const a of Object.values(state.actors)) if (a.kind === 'monster' && !a.removed && a.monsterId) byBlock.set(a.monsterId, [...(byBlock.get(a.monsterId) ?? []), a]);
  const enemyTargets = [...byBlock].map(([id, list]) => ({ ...oddsTargetOf(list[0]), id, name: `${MONSTERS[id]?.name ?? list[0].name}${list.length > 1 ? ` ×${list.length}` : ''}` }));
  const whyKey = actor && why?.actorId === actor.id ? why.key : undefined;
  const whyOf = whyKey && actor ? explain(actor, whyKey) : undefined;
  const closeWhy = () => setWhy(null);
  // Персонаж с листом (Д9): карта на столе, полный лист — модальным окном без замены карты.
  const [face, setFace] = useState<CardFace>(cardFace);
  useOverlayBounds(mainRef,overlayHost,partyExpanded,workspace,face);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetTriggerRef = useRef<HTMLElement | null>(null);
  const openSheet = () => {
    sheetTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCardOverlay(false);
    setTab(TAB_OVERVIEW.id);
    setSheetOpen(true);
  };
  const pcCard = shownActor?.sheet && face === 'card' ? characterCardProps(shownActor, pcHeaderData(shownActor.sheet), state.time.sec, dmView) : undefined;
  const subjectEnvelope = actor ? characterSubjectEnvelope(state, actor.id, dmView ? 'dm' : 'players') : null;
  const baseCardProps = shownActor ? actorCardProps(shownActor, {
    onHp: dmView ? openFromCard : undefined, dmFacts: dmView ? dmFactsOf(actor, state.facts).length : 0, initiative: cardView?.initiative, players: !dmView, hitDice: cardView?.hitDice,
    onExplain: key => setWhy(w => (w?.actorId === actor.id && w.key === key ? null : { actorId: actor.id, key })), explaining: whyKey,
  }) : null;
  const cardProps = baseCardProps ? {
    ...baseCardProps,
    tabs: [
      ...(baseCardProps.tabs ?? []),
      ...(shownActor?.sheet && (shownActor.sheet.backgroundId || chronicleOf(shownActor, allEntries).length) ? [TAB_HISTORY] : []),
      ...(subjectEnvelope ? [TAB_SUBJECT] : []),
    ],
  } : null;
  const fullSheetTabs = cardProps?.tabs ? [
    { ...TAB_OVERVIEW, title: 'Паспорт и основные характеристики' },
    { ...TAB_ACTIONS, title: 'Атаки, заклинания и шансы по противникам' },
    ...FULL_SHEET_TABS,
    ...cardProps.tabs.filter(t => t.id !== TAB_OVERVIEW.id && t.id !== TAB_ACTIONS.id),
  ] : undefined;
  /**
   * Тело вкладки актёра: `column` — одиночная карточка целиком; в оверлее 720px обзор делится на две колонки —
   * навыки персонажа и действия монстра уходят вправо (`aside`), остальное — влево (`main`). В оверлее
   * инструментов нет: хиты и концентрация правятся из одиночной карточки, оверлей — для чтения.
   */
  const [levelError, setLevelError] = useState<string | null>(null);
  const renderActorBody = (current: string, column: 'column' | 'main' | 'aside' | 'sheet', subject = actor, withTools = true): ReactNode => {
    const sourceActor = subject;
    if (!sourceActor) return null;
    const actor = dmView ? sourceActor : withPlayerVisibleInventory(sourceActor, state.inventory ?? {});
    const actorStress = state.a5eStrifeEnabled ? activeA5eStressEffect(actor.a5eConditions?.mentalStress, state.time.sec) : undefined;
    const actorStrife = state.a5eStrifeEnabled ? actor.a5eConditions?.strife ?? 0 : 0;
    const nonPcStressGuidance = dmView && actor.kind !== 'pc' && state.a5eStrifeEnabled
      && (actorStress || actorStrife >= 3) ? (
        <details data-part="a5e-stress-guidance" className="mt-2 bg-pn shadow-bevel p-2">
          <summary className="type-body-xs text-gd-hi cursor-pointer">A5E · последствия и ручные триггеры</summary>
          <ul className="mt-1 flex flex-col gap-1 type-body-xs text-t2">
            {actorStrife >= 3 ? <li><strong className="text-tx">Strife 3:</strong> {A5E_STRIFE_LEVEL_REMINDERS[3]}</li> : null}
            {actorStrife >= 6 ? <li><strong className="text-tx">Strife 6:</strong> {A5E_STRIFE_LEVEL_REMINDERS[6]}</li> : null}
            {actorStrife >= 7 ? <li><strong className="text-tx">Strife 7:</strong> {A5E_STRIFE_LEVEL_REMINDERS[7]}</li> : null}
            {actorStress ? <li><strong className="text-tx">{a5eStressEffectName(actorStress.id)}:</strong> {A5E_STRESS_EFFECT_REMINDERS[actorStress.id]}</li> : null}
          </ul>
          <p className="mt-2 type-body-xs text-t3">Ситуационные действия/проверки остаются за мастером; трекер не разыгрывает движение и расход действий.</p>
        </details>
      ) : null;
    const body: BodyProps = {
      actor, settingPackageId: state.settingPackageId, party: party.filter(a => !a.removed).map(member => dmView ? member : withPlayerVisibleInventory(member, state.inventory ?? {})), giftStacks: Object.values(state.inventory ?? {}), worldSec: state.time.sec, a5eStrifeEnabled: state.a5eStrifeEnabled === true, onRoll, onCommand,
      onInfluence: (npc, targetId, skill, request, dc, modifier, attitude, requestKey, aidRequest, socialPurpose) => {
        const current = store.getState().state;
        const failedAt = npc.social?.failedRequests?.[requestKey];
        if (failedAt !== undefined && current.time.sec < failedAt + INFLUENCE_RULE.cooldownSec) {
          setNote('Эту просьбу тем же способом можно повторить через 24 часа.');
          return;
        }
        const attitudeMode = INFLUENCE_RULE.attitude[attitude];
        const interactionId = crypto.randomUUID();
        const stressActor = current.actors[targetId];
        const intent = { kind: 'check' as const, ability: SKILLS[skill].ability, skill,
          ...(aidRequest && !stressActor?.a5eDistraughtAidUsed ? { purpose: 'persuade-aid' as const, targetAttitude: attitude } : {}),
          ...(socialPurpose ? { socialPurpose } : {}) };
        const stressMode = combineRollModes(
          strifeRollMode(current.a5eStrifeEnabled === true, stressActor?.a5eConditions?.strife ?? 0, intent),
          current.a5eStrifeEnabled ? mentalStressRollMode(activeA5eStressEffect(stressActor?.a5eConditions?.mentalStress, current.time.sec), intent) : 'normal',
        );
        const mode = combineRollModes(attitudeMode, stressMode);
        const strifeCancelsAdvantage = stressMode === 'disadvantage' && attitudeMode === 'advantage';
        const hasTwoDice = mode !== 'normal';
        const raw = roll(hasTwoDice ? '2d20' : '1d20', { label: `Influence · ${npc.name}`, hidden: true });
        const die = mode === 'disadvantage' ? Math.min(...raw.dice) : mode === 'advantage' ? Math.max(...raw.dice) : raw.dice[0];
        const total = die + modifier;
        const diceFormula = hasTwoDice ? (mode === 'advantage' ? '2d20kh1' : '2d20kl1') : '1d20';
        const formula = `${diceFormula}${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}`;
        api.dispatchInInteraction(interactionId, { type: 'DICE_ROLLED', payload: { ...raw, formula, dice: hasTwoDice ? raw.dice : [die], mod: modifier, total, label: `Influence · ${npc.name} · ${request.slice(0, 50)}${strifeCancelsAdvantage ? ' (Strife отменяет преимущество)' : hasTwoDice ? ` (${mode === 'advantage' ? 'преимущество' : 'помеха'}: ${raw.dice.join('/')}, взята ${die})` : ''}` } });
        if (aidRequest && current.a5eStrifeEnabled && activeA5eStressEffect(stressActor?.a5eConditions?.mentalStress, current.time.sec)?.id === 'distraught' && !stressActor?.a5eDistraughtAidUsed) {
          api.dispatchInInteraction(interactionId, { type: 'A5E_STRESS_EFFECT_USED', payload: { actorId: targetId, effect: 'distraught-aid' } });
        }
        const stressEffect = current.a5eStrifeEnabled
          ? activeA5eStressEffect(stressActor?.a5eConditions?.mentalStress, current.time.sec)
          : undefined;
        let failed = total < dc;
        let bewilderedRoll: number | undefined;
        if (!failed && stressEffect?.id === 'bewildered') {
          const followup = roll('1d20', { label: `A5E Bewildered · Influence · ${npc.name}`, hidden: true });
          bewilderedRoll = followup.total;
          failed = bewilderedRoll > 15;
          api.dispatchInInteraction(interactionId, { type: 'DICE_ROLLED', payload: {
            ...followup,
            label: `A5E Bewildered · ${stressActor?.name ?? 'персонаж'} · дополнительный d20: ${bewilderedRoll} · ${bewilderedRoll <= 15 ? 'успех сохраняется' : 'успех отменён'}`,
          } });
        }
        const failedRequests = { ...(npc.social?.failedRequests ?? {}) };
        if (failed) failedRequests[requestKey] = current.time.sec;
        else delete failedRequests[requestKey];
        const social = {
          attitude: npc.social?.attitude ?? 'indifferent' as const,
          ...(npc.social?.relationshipScore !== undefined ? { relationshipScore: npc.social.relationshipScore } : {}),
          ...(npc.social?.relationships ? { relationships: npc.social.relationships } : {}),
          ...(Object.keys(failedRequests).length ? { failedRequests } : {}),
          ...(npc.social?.giftAtSec !== undefined ? { giftAtSec: npc.social.giftAtSec } : {}),
        };
        api.dispatchInInteraction(interactionId, { type: 'NPC_SOCIAL_UPDATED', payload: {
          actorId: npc.id, kind: 'influence', targetId, skill, request, requestKey, dc, total,
          ...(failed ? { failedAtSec: current.time.sec } : {}), state: social,
          note: `просьба «${request}» ${failed ? 'не выполнена' : 'выполнена'} · ${total} против Сл ${dc}${hasTwoDice ? ` · ${mode === 'advantage' ? 'преимущество' : 'помеха'} ${raw.dice.join('/')} → ${die}` : ''}${bewilderedRoll !== undefined ? ` · Bewildered d20 ${bewilderedRoll} → ${bewilderedRoll <= 15 ? 'успех' : 'провал'}` : ''}`,
        } });
      },
      onRelationshipGrowth: (npc, targetId, action, description, roleplayModifier) => {
        const current = store.getState().state;
        const targetActor = current.actors[targetId];
        const currentNpc = current.actors[npc.id];
        const relation = currentNpc?.social?.relationships?.[targetId];
        if (!targetActor?.sheet || !relation?.type || !current.party.includes(targetId)
          || (action === 'gift' && relation.type !== 'friendship') || (action === 'insult' && relation.type !== 'competition')
          || !description.trim() || !Number.isInteger(roleplayModifier) || roleplayModifier < -4 || roleplayModifier > 4) return;
        if (relation.growthAtLevel === targetActor.sheet.level) {
          setNote('Подарок или оскорбление для этой связи уже использованы на текущем уровне.');
          return;
        }
        const skill = action === 'gift' ? 'persuasion' as const : 'intimidation' as const;
        const skillMod = sheetViewOf(targetActor)?.skills.find(item => item.id === skill)?.mod ?? 0;
        const modifier = skillMod + roleplayModifier;
        const intent = { kind: 'check' as const, ability: SKILLS[skill].ability, skill };
        const stressMode = combineRollModes(
          strifeRollMode(current.a5eStrifeEnabled === true, targetActor.a5eConditions?.strife ?? 0, intent),
          current.a5eStrifeEnabled ? mentalStressRollMode(activeA5eStressEffect(targetActor.a5eConditions?.mentalStress, current.time.sec), intent) : 'normal',
        );
        const first = api.rollDice('1d20', { label: `PF1 Relationship · ${action === 'gift' ? 'Diplomacy' : 'Intimidate'} · ${npc.name} · 1/2`, hidden: true }).payload.total;
        const second = stressMode === 'normal' ? undefined : api.rollDice('1d20', { label: `PF1 Relationship · ${action === 'gift' ? 'Diplomacy' : 'Intimidate'} · ${npc.name} · 2/2`, hidden: true }).payload.total;
        const die = second === undefined ? first : stressMode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
        const total = die + modifier;
        const dc = relation.score;
        const delta = total < dc ? 0 : total >= dc + 10 ? 2 : 1;
        const relationships = { ...(currentNpc.social?.relationships ?? {}), [targetId]: { ...relation, score: relation.score + delta, growthAtLevel: targetActor.sheet.level } };
        api.dispatch({ type: 'NPC_SOCIAL_UPDATED', payload: {
          actorId: npc.id, kind: 'relationship-growth', targetId, skill, dc, total,
          relationshipGrowth: { action, level: targetActor.sheet.level, die, modifier, delta },
          state: { ...currentNpc.social!, relationships },
          note: `PF1 ${action === 'gift' ? 'подарок' : 'оскорбление'} · ${targetActor.name} → ${npc.name}: «${description.trim().slice(0, 120)}» · ${total} против Сл ${dc} · счёт ${relation.score} → ${relation.score + delta}`,
        } });
      },
      onRelationshipTransition: (npc, targetId, transition, reason, roleplayModifier, applyNearMissReduction) => {
        const current = store.getState().state;
        const targetActor = current.actors[targetId];
        const currentNpc = current.actors[npc.id];
        const relation = currentNpc?.social?.relationships?.[targetId];
        if (!targetActor?.sheet || !relation?.type || !current.party.includes(targetId) || !reason.trim() || reason.length > 160
          || (transition === 'to-competition' && relation.type !== 'friendship') || (transition === 'to-friendship' && relation.type !== 'competition')
          || !Number.isInteger(roleplayModifier) || roleplayModifier < -4 || roleplayModifier > 4) return;
        const relationships = { ...(currentNpc.social?.relationships ?? {}) };
        if (transition === 'to-competition') {
          const nextScore = relation.score / 2;
          relationships[targetId] = { ...relation, type: 'competition', score: nextScore };
          api.dispatch({ type: 'NPC_SOCIAL_UPDATED', payload: {
            actorId: npc.id, kind: 'relationship-transition', targetId,
            relationshipTransition: { transition, reason: reason.trim(), fromScore: relation.score, toScore: nextScore },
            state: { ...currentNpc.social!, relationships },
            note: `PF1 дружба → соперничество · ${targetActor.name} → ${npc.name}: ${reason.trim()} · счёт ${relation.score} → ${nextScore}`,
          } });
          return;
        }
        const skill = 'persuasion' as const;
        const skillMod = sheetViewOf(targetActor)?.skills.find(item => item.id === skill)?.mod ?? 0;
        const modifier = skillMod + roleplayModifier;
        const intent = { kind: 'check' as const, ability: SKILLS[skill].ability, skill };
        const stressMode = combineRollModes(
          strifeRollMode(current.a5eStrifeEnabled === true, targetActor.a5eConditions?.strife ?? 0, intent),
          current.a5eStrifeEnabled ? mentalStressRollMode(activeA5eStressEffect(targetActor.a5eConditions?.mentalStress, current.time.sec), intent) : 'normal',
        );
        const first = api.rollDice('1d20', { label: `PF1 Reconciliation · Diplomacy · ${npc.name} · 1/2`, hidden: true }).payload.total;
        const second = stressMode === 'normal' ? undefined : api.rollDice('1d20', { label: `PF1 Reconciliation · Diplomacy · ${npc.name} · 2/2`, hidden: true }).payload.total;
        const die = second === undefined ? first : stressMode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
        const total = die + modifier;
        const dc = relation.score + 10;
        const success = total >= dc;
        const missBy = dc - total;
        const nearMiss = !success && missBy > 0 && missBy < 10;
        const nextScore = success ? relation.score / 2 : nearMiss && applyNearMissReduction ? relation.score - 1 : relation.score;
        const nextType = success ? 'friendship' as const : 'competition' as const;
        relationships[targetId] = { ...relation, type: nextType, score: nextScore };
        api.dispatch({ type: 'NPC_SOCIAL_UPDATED', payload: {
          actorId: npc.id, kind: 'relationship-transition', targetId, skill, dc, total,
          relationshipTransition: { transition, reason: reason.trim(), fromScore: relation.score, toScore: nextScore, die, modifier, applyNearMissReduction },
          state: { ...currentNpc.social!, relationships },
          note: `PF1 соперничество → ${success ? 'дружба' : 'соперничество'} · ${targetActor.name} → ${npc.name}: подарок «${reason.trim().slice(0, 120)}» · ${total} против Сл ${dc} · счёт ${relation.score} → ${nextScore}`,
        } });
      },
      tools: dmView && column === 'column' && withTools ? cardTools : null, dmView,
    };
    const deceptionVoices = () => {
      if (!dmView || actor.kind === 'pc' || !knowledgeMembers.length) return null;
      const dc = deceptionDcOf(actor);
      if (dc === undefined) return null;
      return <SkillVoices
        skill="insight"
        dc={dc}
        {...passiveVoices(knowledgeMembers, 'insight', dc)}
        successLabel={`Обман заметен без броска, Проницательность против Сл ${dc}`}
        noneLabel="Обман без броска никто не замечает"
      />;
    };
    if (column === 'sheet' && actor.kind === 'pc') {
      const sheetProps = { ...body, passport: passportOf(actor, events), enemies: enemyTargets };
      switch (current) {
        case TAB_OVERVIEW.id:
          return <PcOverview {...sheetProps} variant="summary" />;
        case TAB_ACTIONS.id:
          return <PcOverview {...sheetProps} variant="actions" />;
        case 'sheet-skills':
          return <PcOverview {...sheetProps} variant="skills" />;
        case 'sheet-features':
          return <PcOverview {...sheetProps} variant="features" />;
      }
    }
    if (column === 'aside') {
      if (current !== 'overview') return null;
      if (actor.kind === 'npc') return null;
      if (actor.kind === 'monster') return dmView ? <MonsterActions actor={actor} targets={oddsTargets} /> : null;
      return <PcSkills actor={actor} onRoll={onRoll} columns={1} />;
    }
    switch (current) {
      case 'overview':
        if (actor.kind === 'npc') return dmView ? <NpcSocialPanel {...body} /> : null;
        if (actor.kind === 'monster') return dmView ? <div className="flex flex-col gap-3">{deceptionVoices()}<MonsterOverview {...body} /></div> : <MonsterSeen {...body} />;
        return <div className="flex flex-col gap-3">{deceptionVoices()}<PcOverview {...body} skills={column === 'column'} passport={passportOf(actor, events)} enemies={enemyTargets} /></div>;
      case 'history':
        return actor.sheet ? <PcLore actor={actor} entries={allEntries} calendar={calendar} /> : null;
      case 'actions':
        if (actor.kind === 'npc') return null;
        return dmView ? <MonsterActions actor={actor} targets={oddsTargets} /> : null;
      case 'conditions':
        return (
          <>
            {dmView ? (
              // Срок состояния (§7): выбирается до клика по сетке; чип считает остаток, по истечении система напоминает.
              <ToggleGroup.Root
                type="single"
                value={String(conditionDuration)}
                onValueChange={v => { if (v) setConditionDuration(Number(v)); }}
                aria-label="Срок состояния"
                className="flex items-center gap-px p-px bg-lo"
              >
                {CONDITION_DURATIONS.map(d => (
                  <ToggleGroup.Item key={d.sec} value={String(d.sec)} title={d.sec === 0 ? 'Пока мастер не снимет' : `Следующее состояние — на ${d.label}`} className={`${OPT} flex-1 ${d.sec === conditionDuration ? OPT_ON : OPT_OFF}`}>
                    {d.label}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            ) : null}
            <ConditionGrid
              active={actor.conditions}
              onToggle={(id, on) => onCommand(on && conditionDuration > 0
                ? { type: 'CONDITION_ADDED', payload: { targetId: actor.id, conditionId: id, untilSec: state.time.sec + conditionDuration } }
                : toggleCommand(actor.id, id, on))}
              onExhaustion={level => onCommand(exhaustionCommand(actor.id, level))}
            />
            {nonPcStressGuidance}
          </>
        );
      case 'gear': {
        const gearActor = dmView ? actor : withPlayerVisibleInventory(actor, state.inventory ?? {});
        return <>
          <Paperdoll items={deskDollItems(gearActor.sheet)} {...dollExtrasOf(gearActor.sheet)} />
          {gearActor.sheet ? <PartyInventory actor={gearActor} stacks={Object.values(state.inventory ?? {}).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === actor.id)} dmView={dmView}
            onGain={stack => api.gainItem(stack)} onLose={(stackId, qty) => api.loseItem(stackId, qty)} onAttune={(stackId, actorId) => api.setAttunement(stackId, actorId)}
            onEquip={(stackId, actorId, wornAs) => api.equipItem(stackId, actorId, wornAs)} onUnequip={(stackId, actorId) => api.unequipItem(stackId, actorId)} /> : null}
        </>;
      }
      case 'path': {
        const path = actor.sheet ? pathOf(actor.sheet) : undefined;
        if (!path) return null;
        // Повышение (Q10) — у мастера и только у персонажа партии; повысить нельзя (20-й, класс без SRD) — формы нет.
        let plan: LevelUpPlan | null = null;
        let planUnavailable: string | null = null;
        try { plan = dmView && actor.kind === 'pc' ? levelUpPlan(actor) : null; } catch (err) { planUnavailable = err instanceof Error ? err.message : String(err); }
        return (
          <>
            {plan ? (
              <details key={`level-up-${actor.id}-${path.level}`} data-part="level-up" className="bg-pn shadow-bevel p-2">
                <summary className="type-body-sm text-gd-hi cursor-pointer">Повысить персонажа до {plan.level}-го уровня</summary>
              <LevelUpForm
                key={`${actor.id}-${actor.sheet!.level}`}
                plan={plan}
                planForSubclass={subclassId => levelUpPlan(actor, subclassId)}
                abilities={actor.sheet!.abilities}
                onRoll={rollTotal}
                error={levelError}
                onPreview={choice => previewLevelUp(actor, choice)}
                onLevelUp={choice => {
                  try { api.levelUp(levelUp(actor, choice)); setLevelError(null); } catch (err) { setLevelError(err instanceof Error ? err.message : String(err)); }
                }}
              />
              </details>
            ) : null}
            {planUnavailable ? <p className="type-body-sm text-t2">Повышение недоступно: {planUnavailable}</p> : null}
            <CharacterPathView key={`path-${actor.id}-${path.level}`} path={path} next={nextLevelText(path)} actor={actor} planScope={planScope} />
          </>
        );
      }
      case 'dm':
        return <DmTab subjectId={actor.id} facts={state.facts} />;
      case 'subject': {
        const envelope = characterSubjectEnvelope(state, sourceActor.id, dmView ? 'dm' : 'players');
        return envelope ? <SubjectProfileShell envelope={envelope as AnySubjectEnvelope} /> : null;
      }
      default:
        return null;
    }
  };
  const actorCard = actor && pcCard ? (
    <div key={actor.id} ref={cardRef as React.RefObject<HTMLDivElement>} role="region" aria-label={actor.name} className="flex flex-col flex-none max-h-full">
      {anchor === 'card' ? <Popover.Anchor className="h-0 flex-none" /> : null}
      <PartyMemberCard
        actor={actor}
        inventory={Object.values(state.inventory ?? {}).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === actor.id && (dmView || stack.visibility === 'players'))}
        inventoryContainers={dmView ? Object.values(state.inventoryContainers ?? {}) : []}
        onGainItem={stack => api.gainItem(stack)}
        onExchangeCoins={(stackId, qty, toCoinId, toQty, receiveStackId) => api.exchangeCoins(stackId, qty, toCoinId, toQty, receiveStackId)}
        onMoveItem={(stackId, qty, to, splitStackId) => api.moveItem(stackId, qty, to, splitStackId)}
        onTransferItem={(stackId, qty, owner, to, splitStackId) => api.transferItem(stackId, qty, owner, to, splitStackId)}
        onLoseItem={(stackId, qty) => api.loseItem(stackId, qty)}
        onAttuneItem={(stackId, actorId) => api.setAttunement(stackId, actorId)}
        onEquipItem={(stackId, actorId, wornAs) => api.equipItem(stackId, actorId, wornAs)}
        onUnequipItem={(stackId, actorId) => api.unequipItem(stackId, actorId)}
        worldSec={state.time.sec}
        dmView={dmView}
        stressEnabled={state.a5eStrifeEnabled === true}
        inCombat={combat}
        activeActorId={activeId}
        combatRound={encounter.round}
        onHp={openFromCard}
        conditions={dmView ? renderActorBody('conditions', 'column') : undefined}
        onDamage={damageActor}
        onHeal={(id, n) => api.heal(id, n)}
        onRoll={onRoll}
        onStressOutcome={setNote}
        onSheet={() => openSheet()}
      />
    </div>
  ) : actor && cardProps ? (
    <EntityCard
      {...cardProps}
      // Вкладка «Состояния» — тумблеры мастера; игрокам состояния видны чипами в обзоре.
      tabs={cardProps.tabs?.filter(t => dmView || t.id !== 'conditions')}
      activeTab={tab}
      onTab={setTab}
      dmView={dmView}
      ref={cardRef}
      className="max-h-full flex-none"
      // Якорь попапа хитов — нулевая строка сразу под полосой показателей: попап падает от числа HP.
      // В бою от токена якорь другой (virtualRef ниже), и этот не рисуется: якорь у попапа один.
      beforeTabs={(
        <>
          {anchor === 'card' ? <Popover.Anchor className="h-0 flex-none" /> : null}
          {actor.sheet ? (
            <div className="flex justify-end px-2 pt-1 flex-none">
              <button type="button" title="Карта персонажа 63 × 88: сводка на кромках, лист на лице без прокрутки" onClick={() => setFace('card')} className={BTN}>Карта</button>
            </div>
          ) : null}
          {whyKey && whyOf ? <DerivationPanel title={WHY_TITLE[whyKey]} shown={whyKey === 'initiative' ? signedTotal(whyOf.total) : undefined} explanation={whyOf} onClose={closeWhy} /> : null}
        </>
      )}
    >
      {(current: string) => renderActorBody(current, 'column')}
    </EntityCard>
  ) : null;

  // Карточка места в фокусе: показатели — из места, вкладка DM — при секретах о нём, пульс — цель ждущего предложения.
  const placeSubjectEnvelope = focus ? citySubjectEnvelope(state, focus.id, dmView ? 'dm' : 'players') : null;
  const placeProps = focus ? placeCardProps(focus, { pending: pendingIds.has(focus.id), dmFacts: dmView ? dmFactsAbout(focus.id, state.facts).length : 0 }) : null;
  const placeTabs = placeProps ? [...(placeProps.tabs ?? []), ...(placeSubjectEnvelope ? [TAB_SUBJECT] : [])] : undefined;
  const placeCard = focus && placeProps ? (
    <EntityCard
      key={focus.id}
      {...placeProps}
      tabs={placeTabs}
      activeTab={tab}
      onTab={setTab}
      dmView={dmView}
      className="max-h-full flex-none"
    >
      {(current: string) => current === 'overview' ? (
        <PlaceOverview
          place={focus}
          parent={focusParent}
          onOpenParent={focusParent ? () => goLadder(selectPlace(state, ladder, focusParent.id)) : undefined}
          pending={dmView ? pendingFor(state, focus.id) : []}
          facts={state.facts}
          onReveal={dmView && focus.geo ? () => api.revealPlace(focus.id) : undefined}
          wikiYear={dmView && isForgottenRealms ? campaignYear ?? undefined : undefined}
          settingPackageId={state.settingPackageId}
          onOpenEntity={openEntity}
          dm={dmView}
          onSetHaven={dmView ? haven => setLocationHaven(focus.id, haven) : undefined}
        />
      ) : current === TAB_NOW.id && scene ? <SceneView scene={scene} onOpen={openEntity} loading={sceneLoading} prestige={scenePrestige} />
        : current === TAB_SUBJECT.id && placeSubjectEnvelope ? <SubjectProfileShell envelope={placeSubjectEnvelope as AnySubjectEnvelope} />
        : current === 'dm' ? <DmTab subjectId={focus.id} facts={state.facts} /> : null}
    </EntityCard>
  ) : null;
  const factionCard = faction ? (
    <EntityCard key={faction.id} {...factionCardProps(faction, { pending: pendingIds.has(faction.id) })} activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full flex-none">
      {(current: string) => (current === 'overview' ? <FactionOverview faction={faction} factions={state.world.factions} pending={dmView ? pendingFor(state, faction.id) : []} onOpenEntity={openEntity} onRenown={dmView ? step => api.propose(renownDelta(state, faction.id, step)) : undefined} onStanding={dmView ? step => api.propose(standingDelta(state, faction.id, step)) : undefined} /> : null)}
    </EntityCard>
  ) : null;
  // Организация или держава справочника и кампания (E10, TASKS К): фракция с известностью или кнопка «В кампанию фракцией».
  const orgLine = (view: EntityView, onOpen: (r: EntityRef) => void) => {
    if (view.kind !== 'organization' && view.kind !== 'kingdom') return null;
    const pendingAdd = Object.values(state.deltas).some(d => d.status === 'pending' && d.patch?.kind === 'newFaction' && d.patch.faction.ref === view.ref);
    return (
      <OrgCampaignLine
        faction={factionOf(state, view.ref)}
        dm={dmView}
        pendingAdd={pendingAdd}
        onOpenFaction={id => onOpen(ref('faction', id))}
        onAdd={() => api.propose(referenceFactionDelta(state, view.kind as 'organization' | 'kingdom', { id: parseRef(view.ref)!.id, name: view.name }))}
      />
    );
  };
  // Знание как ресурс (Д6): у мастера строка паспорта сущности мира — «Узнать» (проверка или воля мастера), узнанная —
  // отметкой с датой и кем; у игроков карточка — их тетрадь: только узнанное.
  const factAction = (view: EntityView) => (f: EntityFact) => {
    if (!dmView || !isLore(view)) return null;
    const known = knownFacts(state, view.ref).get(f.label);
    if (known) return <span className="inline-flex align-middle ml-1" data-known={f.label}><Icon name="src-players" size={16} color="var(--src-players)" title={`Известно игрокам: ${knownLine(known, state)}`} /></span>;
    return (
      <KnowledgeCheck
        fact={f}
        members={knowledgeMembers.map(member => ({ ...member, keyKnowledge: state.actors[member.id]?.a5eKeyKnowledge?.[view.ref] ?? 0 }))}
        skills={KNOWLEDGE_SKILLS}
        skill={knowledgeSkillOf(view)}
        dc={KNOWLEDGE_DC}
        rule={KNOWLEDGE_RULE}
        onRoll={rollTotal}
        onRollWithKeyKnowledge={(actorId, skill, dc, modifier) => rollKnowledgeWithKeyKnowledge(actorId, view.ref, view.name, skill, dc, modifier)}
        onReveal={p => api.revealKnowledge({ ref: view.ref, name: view.name, fact: { label: f.label, value: f.value }, ...p })}
      />
    );
  };
  // Голоса навыков (Д13): кто из партии знает о сущности мира без броска — строка только мастеру, пока не всё узнано.
  const voicesLine = (view: EntityView) => {
    if (!dmView || !isLore(view) || !knowledgeMembers.length) return null;
    const known = knownFacts(state, view.ref);
    if (!view.facts.length || view.facts.every(f => known.has(f.label))) return null;
    const skill = knowledgeSkillOf(view);
    return <SkillVoices skill={skill} dc={KNOWLEDGE_DC} {...passiveVoices(knowledgeMembers, skill, KNOWLEDGE_DC)} />;
  };
  const rollPersonRelationshipCheck = (targetId: string, skill: 'persuasion' | 'intimidation', roleplayModifier: number, label: string) => {
    const current = store.getState().state;
    const target = current.actors[targetId];
    if (!target?.sheet || !current.party.includes(targetId) || !Number.isInteger(roleplayModifier) || roleplayModifier < -4 || roleplayModifier > 4) return null;
    const skillMod = sheetViewOf(target)?.skills.find(row => row.id === skill)?.mod ?? 0;
    const modifier = skillMod + roleplayModifier;
    const intent: StrifeRollIntent = { kind: 'check', ability: SKILLS[skill].ability, skill };
    const mode = combineRollModes(
      strifeRollMode(current.a5eStrifeEnabled === true, target.a5eConditions?.strife ?? 0, intent),
      current.a5eStrifeEnabled ? mentalStressRollMode(activeA5eStressEffect(target.a5eConditions?.mentalStress, current.time.sec), intent) : 'normal',
    );
    const first = api.rollDice('1d20', { label: `${label} · ${target.name} · 1/2`, hidden: true }).payload.total;
    const second = mode === 'normal' ? undefined : api.rollDice('1d20', { label: `${label} · ${target.name} · 2/2`, hidden: true }).payload.total;
    const die = second === undefined ? first : mode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
    return { die, modifier, total: die + modifier, skillMod };
  };
  const personRelationshipGrowth = (personId: string, personName: string, targetId: string, action: 'gift' | 'insult', description: string, roleplayModifier: number) => {
    const current = store.getState().state;
    const target = current.actors[targetId];
    const relation = current.personRelationships?.[personId]?.[targetId];
    if (!target?.sheet || !current.party.includes(targetId) || !relation?.type || !description.trim()
      || (action === 'gift' && relation.type !== 'friendship') || (action === 'insult' && relation.type !== 'competition')) return;
    if (relation.growthAtLevel === target.sheet.level) { setNote('Подарок или оскорбление для этой связи уже использованы на текущем уровне.'); return; }
    const skill = action === 'gift' ? 'persuasion' as const : 'intimidation' as const;
    const check = rollPersonRelationshipCheck(targetId, skill, roleplayModifier, `PF1 Relationship · ${action === 'gift' ? 'Diplomacy' : 'Intimidate'} · ${personName}`);
    if (!check) return;
    const dc = relation.score;
    const delta = check.total < dc ? 0 : check.total >= dc + 10 ? 2 : 1;
    api.dispatch({ type: 'PERSON_RELATIONSHIP_UPDATED', payload: {
      personId, personName, targetId, skill, dc, total: check.total,
      relationshipGrowth: { action, level: target.sheet.level, die: check.die, modifier: check.modifier, delta },
      relationship: { ...relation, score: relation.score + delta, growthAtLevel: target.sheet.level },
      note: `PF1 ${action === 'gift' ? 'подарок' : 'оскорбление'} · ${target.name} → ${personName}: «${description.trim().slice(0, 120)}» · ${check.total} против Сл ${dc} · счёт ${relation.score} → ${relation.score + delta}`,
    } });
  };
  const personRelationshipTransition = (personId: string, personName: string, targetId: string, transition: 'to-competition' | 'to-friendship', reason: string, roleplayModifier: number, applyNearMissReduction: boolean) => {
    const current = store.getState().state;
    const target = current.actors[targetId];
    const relation = current.personRelationships?.[personId]?.[targetId];
    if (!target?.sheet || !current.party.includes(targetId) || !relation?.type || !reason.trim() || reason.length > 160
      || (transition === 'to-competition' && relation.type !== 'friendship') || (transition === 'to-friendship' && relation.type !== 'competition')) return;
    if (transition === 'to-competition') {
      const nextScore = relation.score / 2;
      api.dispatch({ type: 'PERSON_RELATIONSHIP_UPDATED', payload: {
        personId, personName, targetId,
        relationshipTransition: { transition, reason: reason.trim(), fromScore: relation.score, toScore: nextScore },
        relationship: { ...relation, type: 'competition', score: nextScore },
        note: `PF1 дружба → соперничество · ${target.name} → ${personName}: ${reason.trim()} · счёт ${relation.score} → ${nextScore}`,
      } });
      return;
    }
    const check = rollPersonRelationshipCheck(targetId, 'persuasion', roleplayModifier, `PF1 Reconciliation · Diplomacy · ${personName}`);
    if (!check) return;
    const dc = relation.score + 10;
    const success = check.total >= dc;
    const missBy = dc - check.total;
    const nearMiss = !success && missBy > 0 && missBy < 10;
    const nextScore = success ? relation.score / 2 : nearMiss && applyNearMissReduction ? relation.score - 1 : relation.score;
    const nextType = success ? 'friendship' as const : 'competition' as const;
    api.dispatch({ type: 'PERSON_RELATIONSHIP_UPDATED', payload: {
      personId, personName, targetId, skill: 'persuasion', dc, total: check.total,
      relationshipTransition: { transition, reason: reason.trim(), fromScore: relation.score, toScore: nextScore, die: check.die, modifier: check.modifier, applyNearMissReduction },
      relationship: { ...relation, type: nextType, score: nextScore },
      note: `PF1 соперничество → ${success ? 'дружба' : 'соперничество'} · ${target.name} → ${personName}: подарок «${reason.trim().slice(0, 120)}» · ${check.total} против Сл ${dc} · счёт ${relation.score} → ${nextScore}`,
    } });
  };
  const personRelationshipPanel = (view: EntityView) => {
    if (!dmView || view.kind !== 'person') return null;
    const personId = parseRef(view.ref)?.id;
    if (!personId) return null;
    return <PersonRelationshipPanel
      personId={personId}
      personName={view.name}
      party={party}
      relationships={state.personRelationships?.[personId]}
      giftState={state.personGifts?.[personId]}
      giftStacks={Object.values(state.inventory ?? {})}
      worldSec={state.time.sec}
      onGift={(targetId, stackId, qty, note) => {
        const stack = state.inventory?.[stackId];
        if (!stack) return;
        const splitStackId = qty < stack.qty
          ? `item:${encodeURIComponent(targetId)}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
          : undefined;
        api.dispatch({ type: 'PERSON_ITEM_GIFTED', payload: {
          stackId, qty, giverId: targetId, personId, personName: view.name,
          ...(splitStackId ? { splitStackId } : {}), ...(note ? { note } : {}),
        } });
      }}
      onGrowth={(targetId, action, description, roleplayModifier) => personRelationshipGrowth(personId, view.name, targetId, action, description, roleplayModifier)}
      onTransition={(targetId, transition, reason, roleplayModifier, applyNearMissReduction) => personRelationshipTransition(personId, view.name, targetId, transition, reason, roleplayModifier, applyNearMissReduction)}
      onChange={(targetId, relationship) => api.dispatch({
        type: 'PERSON_RELATIONSHIP_UPDATED',
        payload: {
          personId,
          personName: view.name,
          targetId,
          ...(relationship ? { relationship } : {}),
          note: relationship ? `PF1 Relationship: ${view.name}` : `Удалена PF1-связь: ${view.name}`,
        },
      })}
    />;
  };
  const shownEntity = entityView && entityView !== 'loading' && !dmView ? playersEntityView(entityView, state) : entityView;
  const entityTabs = entityPlace || entitySubjectEnvelope
    ? [...(entityPlace ? PLACE_TABS : []), ...(entitySubjectEnvelope ? [TAB_SUBJECT] : [])]
    : undefined;
  const entityCard = cardOf.kind === 'entity' && entityView ? (
    <EntityCard
      key={cardOf.ref}
      type={entityView === 'loading' ? 'rule' : cardTypeOf(entityView.kind)}
      name={entityView === 'loading' ? 'Загрузка…' : entityView.name}
      badges={entityView === 'loading' ? [] : [KIND_LABEL[entityView.kind], ...(entityView.nameRu ? [entityView.nameRu] : [])]}
      origin={entityView !== 'loading' && entityView.source.kind === 'campaign' ? 'dm' : 'canon'}
      tabs={entityTabs}
      activeTab={tab}
      onTab={setTab}
      dmView={dmView}
      className="max-h-full flex-none"
    >
      {(current: string) => (entityView === 'loading' ? <p className="type-body-sm text-t2">Справочник загружается…</p>
        : current === TAB_SUBJECT.id && entitySubjectEnvelope ? <SubjectProfileShell envelope={entitySubjectEnvelope} />
          : entityPlace && current === TAB_NOW.id && scene ? <SceneView scene={scene} onOpen={openEntity} loading={sceneLoading} prestige={scenePrestige} />
          : <>{orgLine(entityView, openEntity)}{voicesLine(entityView)}<EntityViewBody view={shownEntity as EntityView} onOpen={openEntity} factAction={factAction(entityView)} />{personRelationshipPanel(entityView)}</>)}
    </EntityCard>
  ) : null;
  const focusedCard = cardOf.kind === 'actor' ? actorCard : cardOf.kind === 'place' ? placeCard : cardOf.kind === 'entity' ? entityCard : factionCard;
  const partyActorInMap = face === 'card' && cardOf.kind === 'actor' && party.some(member => member.id === actor?.id);
  const card = partyActorInMap ? null : focusedCard;
  // Оверлей 720px — та же сущность в две колонки с бронзовой рамкой (F3). Живёт в главной зоне (портал в неё):
  // партию и полосу часов не накрывает (CLAUDE.md), Esc и клик по затемнению закрывают. У места и державы —
  // тот же обзор в одну колонку. В оверлее вкладка та же, что в одиночной карточке.
  const overlayName = cardOf.kind === 'actor' ? actor?.name : cardOf.kind === 'place' ? focus?.name
    : cardOf.kind === 'entity' ? (entityView && entityView !== 'loading' ? entityView.name : undefined) : faction?.name;
  const overlayCard = cardOf.kind === 'actor' && actor && cardProps ? (
    <EntityCard
      {...cardProps}
      tabs={cardProps.tabs?.filter(t => dmView || t.id !== 'conditions')}
      overlay
      activeTab={tab}
      onTab={setTab}
      dmView={dmView}
      className="max-h-full"
      aside={(current: string) => renderActorBody(current, 'aside')}
    >
      {(current: string) => renderActorBody(current, 'main')}
    </EntityCard>
  ) : cardOf.kind === 'place' && focus && placeProps ? (
    <EntityCard {...placeProps} tabs={placeTabs} overlay activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full">
      {(current: string) => current === 'overview' ? (
        <PlaceOverview place={focus} parent={focusParent} onOpenParent={focusParent ? () => { setCardOverlay(false); goLadder(selectPlace(state, ladder, focusParent.id)); } : undefined} pending={dmView ? pendingFor(state, focus.id) : []} facts={state.facts} wikiYear={dmView && isForgottenRealms ? campaignYear ?? undefined : undefined} settingPackageId={state.settingPackageId} onOpenEntity={r => { setCardOverlay(false); openEntity(r); }} dm={dmView} onSetHaven={dmView ? haven => setLocationHaven(focus.id, haven) : undefined} />
      ) : current === TAB_NOW.id && scene ? <SceneView scene={scene} onOpen={r => { setCardOverlay(false); openEntity(r); }} loading={sceneLoading} prestige={scenePrestige} />
        : current === TAB_SUBJECT.id && placeSubjectEnvelope ? <SubjectProfileShell envelope={placeSubjectEnvelope as AnySubjectEnvelope} />
        : current === 'dm' ? <DmTab subjectId={focus.id} facts={state.facts} /> : null}
    </EntityCard>
  ) : cardOf.kind === 'entity' && entityView && entityView !== 'loading' ? (
    <EntityCard
      type={cardTypeOf(entityView.kind)}
      name={entityView.name}
      badges={[KIND_LABEL[entityView.kind], ...(entityView.nameRu ? [entityView.nameRu] : [])]}
      origin={entityView.source.kind === 'campaign' ? 'dm' : 'canon'}
      tabs={entityTabs}
      activeTab={tab}
      onTab={setTab}
      overlay
      dmView={dmView}
      className="max-h-full"
    >
      {(current: string) => (current === TAB_SUBJECT.id && entitySubjectEnvelope
        ? <SubjectProfileShell envelope={entitySubjectEnvelope} />
        : entityPlace && current === TAB_NOW.id && scene
          ? <SceneView scene={scene} onOpen={r => { setCardOverlay(false); openEntity(r); }} loading={sceneLoading} prestige={scenePrestige} />
        : <>{orgLine(entityView, r => { setCardOverlay(false); openEntity(r); })}<EntityViewBody view={shownEntity as EntityView} onOpen={r => { setCardOverlay(false); openEntity(r); }} factAction={factAction(entityView)} />{personRelationshipPanel(entityView)}</>)}
    </EntityCard>
  ) : faction ? (
    <EntityCard {...factionCardProps(faction, { pending: pendingIds.has(faction.id) })} overlay activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full">
      {(current: string) => (current === 'overview' ? <FactionOverview faction={faction} factions={state.world.factions} pending={dmView ? pendingFor(state, faction.id) : []} onOpenEntity={r => { setCardOverlay(false); openEntity(r); }} onRenown={dmView ? step => api.propose(renownDelta(state, faction.id, step)) : undefined} onStanding={dmView ? step => api.propose(standingDelta(state, faction.id, step)) : undefined} /> : null)}
    </EntityCard>
  ) : null;
  // Отметки — только живых членов партии: ушедший из партии актёр из выборки выпадает сам.
  const checkedParty: ReadonlySet<string> = new Set(party.filter(a => checked.has(a.id)).map(a => a.id));
  const compareColumns: CompareColumn[] = party.filter(a => checkedParty.has(a.id) && a.sheet).map(a => {
    const v = sheetViewOf(a)!;
    const cls = classById(a.sheet!.classId);
    return {
      id: a.id,
      name: a.name,
      subtitle: `${cls?.nameRu ?? a.sheet!.classId} · ${a.sheet!.level} ур.`,
      hp: a.hp,
      ac: a.ac,
      pp: a.passivePerception,
      initiative: v.initiative,
      ...(a.sheet!.speed !== undefined ? { speed: a.sheet!.speed } : {}),
      ...(v.hitDice ? { hitDice: v.hitDice } : {}),
      abilities: v.abilities,
      skills: v.skills,
      resources: resourcePoolsOf(a).map(p => ({ id: p.id, label: poolLabel(p), available: p.available, max: p.max })),
      passport: passportOf(a, events),
    };
  });
  const compareDialog = compareOpen && dmView && compareColumns.length >= 2 ? (
    <Dialog.Root open modal={false} onOpenChange={o => { if (!o) setCompareOpen(false); }}>
      <Dialog.Portal container={(face === 'sheet' ? viewRef.current : overlayHost ?? mainRef.current) ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        <Dialog.Content aria-describedby={undefined} className="absolute top-4 bottom-4 right-0 left-[8%] z-30 flex outline-none">
          <Dialog.Title className="sr-only">Сравнение персонажей</Dialog.Title>
          <CompareSheet
            columns={compareColumns}
            dmView={dmView}
            onClose={() => setCompareOpen(false)}
            onRoll={(_, mod, label) => onRoll(d20Formula(mod), label)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null;
  const cardOverlayDialog = cardOverlay && overlayCard && overlayName ? (
    <Dialog.Root open modal={false} onOpenChange={o => { if (!o) setCardOverlay(false); }}>
      <Dialog.Portal container={(face === 'sheet' ? viewRef.current : overlayHost ?? mainRef.current) ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        {/* Имя диалога — из Title (Radix ставит aria-labelledby сам): «Bo Tambernack: карточка». */}
        <Dialog.Content
          aria-describedby={undefined}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-30 max-h-[calc(100%-48px)] flex outline-none"
          onCloseAutoFocus={event => {
            event.preventDefault();
            const trigger = cardOverlayTriggerRef.current;
            cardOverlayTriggerRef.current = null;
            if (trigger?.isConnected && !trigger.closest('[hidden], [inert]')) trigger.focus();
          }}
        >
          <Dialog.Title className="sr-only">{`${overlayName}: карточка`}</Dialog.Title>
          {overlayCard}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null;
  const sheetDialog = sheetOpen && actor?.sheet && cardProps ? (
    <Dialog.Root open modal={false} onOpenChange={open => { if (!open) setSheetOpen(false); }}>
      <Dialog.Portal container={(face === 'sheet' ? viewRef.current : overlayHost ?? mainRef.current) ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        <Dialog.Content
          aria-describedby={undefined}
          className="desk-sheet-modal absolute inset-3 z-30 flex flex-col min-w-0 min-h-0 bg-pn shadow-frame outline-none"
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (sheetTriggerRef.current?.isConnected) sheetTriggerRef.current.focus();
          }}
        >
          <header className="relative isolate flex flex-none items-center justify-between gap-2 px-3 py-2 bg-pl">
            <MaterialArtwork asset="kimi-material-trim-bronze-strip-v1" width={512} className="sheet-header__bronze-strip" style={{ position: 'absolute', insetInline: 0, insetBlockEnd: 0, zIndex: -1, width: '100%', maxWidth: 'none', height: 8, objectFit: 'cover', mixBlendMode: 'screen', pointerEvents: 'none' }} />
            <Dialog.Title className="type-h-20 text-tx">Полный лист · {actor.name}</Dialog.Title>
            <Dialog.Close className={BTN}>Закрыть</Dialog.Close>
          </header>
          <EntityCard
            {...cardProps}
            overlay
            tabs={fullSheetTabs?.filter(t => dmView || t.id !== 'conditions')}
            activeTab={tab}
            onTab={setTab}
            dmView={dmView}
            className="max-h-full"
            beforeTabs={whyKey && whyOf ? <DerivationPanel title={WHY_TITLE[whyKey]} shown={whyKey === 'initiative' ? signedTotal(whyOf.total) : undefined} explanation={whyOf} onClose={closeWhy} /> : null}
          >
            {(current: string) => renderActorBody(current, 'sheet')}
          </EntityCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null;
  const timePreviewDialog = dmView && timePreview ? (
    <Dialog.Root open onOpenChange={open => { if (!open && timePreview) { store.getState().releaseReservedEventId(timePreview.eventId); setTimePreview(null); setTimePreviewDowntime(null); } }}>
      <Dialog.Portal container={(face === 'sheet' ? viewRef.current : overlayHost ?? mainRef.current) ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        <Dialog.Content aria-describedby={undefined} className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-card-overlay max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-auto bg-pn shadow-frame p-4 outline-none">
          <Dialog.Title className="type-h-28 text-tx mb-3">Предпросмотр шага времени</Dialog.Title>
          <TimeStepReview preview={timePreview} stale={timePreviewStale} contextText={timePreviewDowntime ? a5eDowntimeJournalText(timePreviewDowntime.period, timePreview.state.party.filter(id => !timePreview.state.actors[id]?.removed), prepareA5eDowntimePeriod(timePreviewDowntime.period, timePreviewDowntime.records, Object.values(timePreview.state.a5eDowntimeProjects ?? {}), timePreview.state.time.sec).records) : null} onApply={applyTimePreview} onCancel={() => { store.getState().releaseReservedEventId(timePreview.eventId); setTimePreview(null); setTimePreviewDowntime(null); }} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null;

  /** Новый персонаж из редактора: полным снимком в партию, карточка — на него. */
  const onCreatePc = (spec: PcSpec) => {
    api.spawn(pcActor(spec), true);
    setEditorOpen(false);
    open(spec.id);
  };
  const editorDialog = editorOpen && dmView ? (
    <Dialog.Root open modal={false} onOpenChange={o => { if (!o) setEditorOpen(false); }}>
      <Dialog.Portal container={(face === 'sheet' ? viewRef.current : overlayHost ?? mainRef.current) ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            const trigger = editorReturnFocus.current;
            editorReturnFocus.current = null;
            if (trigger?.isConnected && !trigger.closest('[hidden], [inert]')) {
              event.preventDefault();
              requestAnimationFrame(() => trigger.focus());
            }
          }}
          className="absolute inset-4 z-30 flex justify-center outline-none focus-visible:shadow-none"
        >
          <Dialog.Title className="sr-only">Новый персонаж</Dialog.Title>
          <CharacterEditor takenIds={new Set(Object.keys(state.actors))} onCreate={onCreatePc} onClose={() => setEditorOpen(false)} era={activeEra} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null;

  const hpPopover = actor && dmView ? (
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        aria-label={`Хиты: ${actor.name}`}
        onInteractOutside={keepOpenOnOpeners}
        // Попап открыт не Popover.Trigger, поэтому фокус после Esc возвращаем сами — в ячейку HP или токен,
        // от которого он упал; иначе Radix уронит его на body.
        onCloseAutoFocus={e => {
          e.preventDefault();
          (anchor === 'token' ? tokenAnchor.current : cardRef.current?.querySelector<HTMLElement>('[data-part="stats"] button'))?.focus();
        }}
        className="z-20 outline-none"
      >
        <HpControl
          actor={actor}
          surface="float"
          flash={flashes[actor.id] ?? null}
          lastDamage={lastDamageOf(events, actor.id)}
          // Шанс удержать концентрацию (ROADMAP 5.5): спасбросок CON листа или блока; попап хитов — только у мастера.
          conSave={oddsTargetOf(actor).saves?.con}
          onDamage={n => damageActor(actor.id, n)}
          onHeal={n => api.heal(actor.id, n)}
          onTempHp={n => api.tempHp(actor.id, n)}
          onConcentrationCheck={() => {
            const modifier = oddsTargetOf(actor).saves?.con;
            return modifier === undefined ? undefined : onRoll(d20Formula(modifier), `Концентрация · ${actor.name}`, { kind: 'concentration' }, actor.id);
          }}
          // Провал спасброска — событие: концентрация снимается и отменяется Ctrl+Z, как всё остальное.
          onConcentrationLost={() => onCommand({ type: 'CONCENTRATION_ENDED', payload: { actorId: actor.id, reason: 'save' } })}
          onConcentrationDropped={() => onCommand({ type: 'CONCENTRATION_ENDED', payload: { actorId: actor.id, reason: 'unconscious' } })}
        />
        {combat && !actor.removed ? (
          // Убрать из боя — ACTOR_REMOVED: из порядка инициативы и с поля, актёр остаётся в состоянии. Причина —
          // «убит» при 0 хитов, иначе решение мастера (сбежал, ушёл — мастер скажет в журнале сам). Подвал попапа — плита.
          <div className="flex justify-end bg-pl px-3 py-2 shadow-plate">
            <button
              type="button"
              title="Выбыл из боя: уходит из порядка инициативы и с сетки, остаётся в журнале"
              onClick={() => { api.remove(actor.id, actor.hp.current === 0 ? 'dead' : 'dm'); setPopoverOpen(false); }}
              className={BTN}
            >
              Убрать из боя
            </button>
          </div>
        ) : null}
      </Popover.Content>
    </Popover.Portal>
  ) : null;

  // Корешки главной зоны: «Здесь», державы континента, противники — слева над картой или над пустым столом.
  const levelStacks = here.length > 0 || (ladder.level === 'continent' && factions.length > 0) || foes.length > 0 ? (
    <div className="w-72 flex-none flex flex-col gap-4">
      {here.length > 0 ? (
        <CardStack
          title="Здесь"
          icon="ent-location"
          items={hereItems(here, ladder, counts, pendingIds)}
          onOpen={it => goLadder(selectPlace(state, ladder, it.id))}
        />
      ) : null}
      {ladder.level === 'continent' && factions.length > 0 ? (
        <CardStack
          title="Державы"
          icon="ent-faction"
          items={factionItems(factions, pendingIds)}
          onOpen={it => showCard({ kind: 'faction', id: it.id })}
        />
      ) : null}
      {foes.length > 0 ? (
        <CardStack
          title="Противники"
          icon="ent-monster"
          items={foes.map(a => stackItemOf(a, { players: !dmView }))}
          onOpen={it => open(it.id)}
        />
      ) : null}
    </div>
  ) : null;

  return (
    <OpenEntityContext.Provider value={openEntity}>
    <PlayerFrame on={playersView}>
    <main aria-label={playersView ? 'Стол игроков' : 'Стол'} data-view={playersView ? 'players' : 'dm'} className="flex-1 min-h-0 flex flex-col">
      {past ? (
        <div role="status" data-part="past-view" className="flex-none flex items-center gap-3 px-4 py-1.5 bg-cd shadow-[inset_0_-2px_0_var(--src-sim)] type-body-sm text-tx">
          <span>Стол на {past.label} — реплей журнала до конца дня; что сделано здесь, в сессию не попадает</span>
          <button type="button" onClick={past.onExit} className="ml-auto type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)]">Вернуться к сегодня</button>
        </div>
      ) : null}
      {recoveryCopy !== null && !past && !playersView ? (
        <div role="alert" data-part="recovery-copy" className="flex-none flex items-center gap-3 px-4 py-1.5 bg-cd shadow-[inset_0_-2px_0_var(--st-conflict)] type-body-sm text-tx">
          <span>{recoveryReason ? `Сохранённая сессия не открылась: ${recoveryReason}. Исходный текст оставлен для восстановления или разбора.` : 'Сохранённый исходный текст журнала доступен для восстановления или разбора.'}</span>
          <button type="button" onClick={onExportRecovery} className="ml-auto type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)]">Скачать исходную запись</button>
        </div>
      ) : null}
      {recoveryReason && recoveryCopy === null && !past && !playersView ? (
        <div role="alert" data-part="recovery-preserved-in-place" className="flex-none px-4 py-1.5 bg-cd shadow-[inset_0_-2px_0_var(--st-conflict)] type-body-sm text-tx">
          Сохранённая сессия не открылась: {recoveryReason}. Исходная запись оставлена без изменений, её копия недоступна для скачивания.
        </div>
      ) : null}
      {saveFailed && !past && !playersView ? (
        // Квота браузера кончилась (И2, 30.10.2026): сессия живёт только в памяти — перезагрузка её потеряет.
        <div role="alert" data-part="save-failed" className="flex-none flex items-center gap-3 px-4 py-1.5 bg-cd shadow-[inset_0_-2px_0_var(--st-conflict)] type-body-sm text-tx">
          <span>Журнал больше не сохраняется в браузере: место кончилось или запись запрещена. Перезагрузка вкладки потеряет сессию — сохраните её файлом.</span>
          <button type="button" onClick={onExport} className="ml-auto type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)]">Сохранить файлом</button>
        </div>
      ) : null}
      <ClockBar
        clockDock={partyExpanded && !workspace && face === 'card' ? partyClockDock ?? clockDock : clockDock}
        revision={events.length}
        events={events}
        railParty={railParty}
        state={state}
        encounter={encounter}
        phase={phase}
        narrow={narrow}
        weather={weather}
        combat={combat}
        views={views}
        shownView={shownView}
        setView={setView}
        dmView={dmView}
        initiativeOpen={initiativeOpen}
        setInitiativeOpen={setInitiativeOpen}
        initiativeRows={initiativeRows}
        rollTotal={rollTotal}
        applyInitiative={applyInitiative}
        restOpen={restOpen}
        setRestOpen={setRestOpen}
        restRows={restRows}
        supplyAvailable={supplyOf(state)}
        restLayer={state.restLayer ?? 'srd'}
        stressEnabled={state.a5eStrifeEnabled === true}
        onRestLayerChange={layer => api.dispatch({ type: 'CAMPAIGN_REST_LAYER_SET', payload: { layer } })}
        restPlace={restingPlace ? { id: restingPlace.id, name: restingPlace.name, haven: restingPlace.haven } : undefined}
        nowSec={state.time.sec}
        onA5eTrackSet={(actorId, track, level) => {
          const current = store.getState().state;
          const actor = current.actors[actorId];
          const before = actor?.a5eConditions?.[track] ?? 0;
          let stressEffect: import('../rules/a5e/strife').A5eStressEffect | undefined;
          if (actor && track === 'strife' && level > before && current.a5eStrifeEnabled) {
            if (level >= 7 && before < 7) {
              const roll = api.rollDice('1d10', { label: `A5E · долгий эффект ментального стресса · ${actor.name}`, hidden: hiddenRolls }).payload.total;
              stressEffect = { kind: 'long', id: A5E_LONG_STRESS_EFFECTS[roll - 1] };
            } else if (level >= 5 && before < 5 && activeA5eStressEffect(actor.a5eConditions?.mentalStress, current.time.sec)?.kind !== 'long') {
              const effectRoll = api.rollDice('1d10', { label: `A5E · краткий эффект ментального стресса · ${actor.name}`, hidden: hiddenRolls }).payload.total;
              const days = api.rollDice('1d6', { label: `A5E · длительность краткого эффекта, дни · ${actor.name}`, hidden: hiddenRolls }).payload.total;
              stressEffect = { kind: 'short', id: A5E_SHORT_STRESS_EFFECTS[effectRoll - 1], untilSec: current.time.sec + days * SECONDS_PER_DAY };
            }
          }
          api.dispatch({ type: 'A5E_TRACK_SET', payload: { actorId, track, level, ...(stressEffect ? { stressEffect } : {}) } });
        }}
        onRest={onRest}
        tempo={tempo}
        campaignYear={campaignYear}
        ringYear={lensYear ?? campaignYear}
        onRingYearChange={year => setLens(year === campaignYear ? null : year)}
        recommendedTempo={LEVEL_TEMPO[ladder.level]}
        stepPreparing={stepPreparing}
        setTempoChoice={setTempoChoice}
        onStep={onStep}
        onStepAtTempo={(stepTempo, steps) => { void requestTimeStep(steps, stepTempo); }}
        setPlayersView={setPlayersView}
      />

      {dmView && !past && !workspace && quickInboxDelta && (shownView === 'desk' || shownView === 'pulse') ? (
        <section aria-label="Входящие предложения" aria-live="polite" aria-atomic="true" data-part="inbox-strip" className="flex-none flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-cd shadow-[inset_0_-2px_0_var(--src-sim)]">
          <span className="type-num-12 uppercase text-gd-hi whitespace-nowrap">Входящие · {pending.length}</span>
          <span className="min-w-0 flex-1 type-body-sm text-tx truncate" title={`${quickInboxDelta.subject}: ${quickInboxDelta.was} → ${quickInboxDelta.now} · ${quickInboxDelta.cause} · источник ${quickInboxDelta.causeId}`}>
            <strong>{quickInboxDelta.subject}</strong> · {quickInboxDelta.was} → <span className="text-gd-hi">{quickInboxDelta.now}</span> · {quickInboxDelta.cause}
            <span className="ml-2 type-body-xs text-t3">Источник: {quickInboxDelta.causeId}</span>
          </span>
          <div className="flex flex-none items-center gap-1">
            <button type="button" title={`Принять предложение: ${quickInboxDelta.subject}`} onClick={() => api.accept(quickInboxDelta.id)} className={BTN}>Принять</button>
            <button type="button" title={`Отклонить предложение: ${quickInboxDelta.subject}`} onClick={() => api.reject(quickInboxDelta.id)} className={BTN}>Отклонить</button>
            <button type="button" aria-label="Открыть все входящие предложения" title="Открыть все входящие предложения" onClick={() => setOpenRail({ side: 'tools', item: 'inbox' })} className={BTN_HEAD}>Все</button>
          </div>
        </section>
      ) : null}

      <div data-tools-open={railTools && openRail?.side === 'tools' || undefined} className="desk-workspace relative flex-1 min-h-0 min-w-0 flex">
        {face === 'sheet' || partyManagementOpen ? <PartyPanel
          state={state}
          dmView={dmView}
          party={party}
          selectedId={selectedId}
          open={open}
          flashes={flashes}
          checkedParty={checkedParty}
          setChecked={setChecked}
          setCompareOpen={setCompareOpen}
          setEditorOpen={setEditorOpen}
          compactManager={face === 'card'}
          mobile={mobilePartyView}
          onCloseManager={() => {
            setPartyManagementOpen(false);
            window.requestAnimationFrame(() => partyManagementTriggerRef.current?.focus());
          }}
          railParty={face === 'card' ? false : railParty}
          setRailParty={on => { if (face === 'card') setPartyManagementOpen(false); else setRailParty(on); }}
          openRail={openRail}
          setOpenRail={setOpenRail}
          onSupply={(reason, amount) => { api.changeSupply(reason, amount); }}
          onGroupCheck={(skill, dc, members) => {
            const rolls = members.map(member => {
              const die = roll('d20', { label: member.name, hidden: hiddenRolls }).dice[0];
              const total = die + member.modifier;
              return { ...member, die, total, success: total >= dc };
            });
            const successes = rolls.filter(result => result.success).length;
            const passed = successes >= Math.ceil(rolls.length / 2);
            api.dispatch({
              type: 'DICE_ROLLED',
              payload: {
                formula: 'group-check', dice: rolls.map(result => result.die), mod: 0, total: successes,
                hidden: hiddenRolls, label: SKILL_LABEL[skill] + ' группой',
                group: { skill, dc, rolls, successes, passed },
              },
            });
          }}
        /> : null}

        {/* Popover.Root — вокруг всей главной зоны: якорь один, но живёт то в карточке, то на токене. */}
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
          {anchor === 'token' ? <Popover.Anchor virtualRef={tokenAnchor} /> : null}
          <section ref={mainRef} data-workspace={workspace ?? undefined} aria-label="Главная зона" className={`relative flex-1 min-w-0 min-h-0 flex flex-col${face === 'card' ? ' desk-party-main' : ''}`}>
            {face === 'card' ? <div className="desk-party-header isolate">
              <MaterialArtwork asset="kimi-material-material-dark-wood-v1" width={512} className="desk-party-header__wood" style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', maxWidth: 'none', height: '100%', objectFit: 'cover', mixBlendMode: 'soft-light', pointerEvents: 'none' }} />
              <PartySpread
                items={party.filter(member => !member.removed).map(member => ({
                  id: member.id,
                  name: member.name,
                  spine: member.sheet ? <CharacterCardSpine card={characterCardProps(member, pcHeaderData(member.sheet), state.time.sec, dmView)!} compact /> : <span data-part="party-spine-fallback" className="type-h-17 text-gd"><Icon name="ent-pc" size={32} className="party-spine-fallback-icon" title={`Портрет: ${member.name}`} /><span data-part="party-spine-fallback-name">{member.name}</span></span>,
                  card: member.sheet ? <PartyMemberCard compact
                    onHp={() => {
                      const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                      open(member.id); tokenAnchor.current = trigger; setPopoverAnchor('token'); setPopoverOpen(true);
                    }}
                    actor={member} worldSec={state.time.sec} dmView={dmView} stressEnabled={state.a5eStrifeEnabled === true} inCombat={combat} activeActorId={activeId} combatRound={encounter.round}
                    inventory={Object.values(state.inventory ?? {}).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === member.id && (dmView || stack.visibility === 'players'))}
                    inventoryContainers={dmView ? Object.values(state.inventoryContainers ?? {}) : []}
                    onGainItem={stack => api.gainItem(stack)} onExchangeCoins={(stackId, qty, toCoinId, toQty, receiveStackId) => api.exchangeCoins(stackId, qty, toCoinId, toQty, receiveStackId)} onMoveItem={(stackId, qty, to, splitStackId) => api.moveItem(stackId, qty, to, splitStackId)} onTransferItem={(stackId, qty, owner, to, splitStackId) => api.transferItem(stackId, qty, owner, to, splitStackId)} onLoseItem={(stackId, qty) => api.loseItem(stackId, qty)}
                    onAttuneItem={(stackId, actorId) => api.setAttunement(stackId, actorId)}
                    onEquipItem={(stackId, actorId, wornAs) => api.equipItem(stackId, actorId, wornAs)}
                    onUnequipItem={(stackId, actorId) => api.unequipItem(stackId, actorId)}
                    conditions={dmView ? renderActorBody('conditions', 'column', member, false) : undefined}
                    onDamage={damageActor} onHeal={(id, n) => api.heal(id, n)} onRoll={onRoll} onStressOutcome={setNote}
                    keyKnowledgeSubjects={dmView ? Object.entries(member.a5eKeyKnowledge ?? {}).flatMap(([subjectRef, amount]) => {
                      const parsed = parseRef(subjectRef);
                      if (!parsed || !isStateKind(parsed.kind) || !Number.isSafeInteger(amount) || (amount ?? 0) < 1) return [];
                      const subject = stateView(state, parsed.kind, parsed.id);
                      return subject ? [{ ref: subject.ref, name: subject.name, amount: amount ?? 0 }] : [];
                    }) : []}
                    onSpendKeyKnowledge={spend => {
                      const currentActor = store.getState().state.actors[spend.actorId];
                      if ((currentActor?.a5eKeyKnowledge?.[spend.subjectRef] ?? 0) < 1) {
                        setNote(`Key Knowledge по «${spend.subjectName}» уже недоступен; очко не списано.`);
                        return;
                      }
                      store.getState().dispatch({ type: 'A5E_KEY_KNOWLEDGE_SPENT', payload: {
                        actorId: spend.actorId, subjectRef: spend.subjectRef, subjectName: spend.subjectName,
                        action: { kind: spend.kind, label: spend.label, ...(spend.skill ? { skill: spend.skill } : {}), ...(spend.ability ? { ability: spend.ability } : {}) },
                        ...(spend.skill ? { skill: spend.skill } : {}), total: spend.total, source: 'a5e-srd:adventuring-8',
                      } });
                    }}
                    onSheet={id => { setDeskView('desk'); open(id); openSheet(); }}
                  /> : <EntityCard {...actorCardProps(member)} dmView={dmView}>{renderActorBody('overview', 'column', member, false)}</EntityCard>,
                }))}
                selectedId={selectedId}
                selectedIds={checkedParty}
                onToggleSelection={partyManagementOpen ? id => setChecked(current => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; }) : undefined}
                expanded={partyExpanded && !workspace}
                mobile={mobilePartyView}
                clockSlot={<div className="desk-world-clock-dock"><div ref={setPartyClockDock} /></div>}
                onSelect={id => { open(id); setPartyExpanded(true); setPartyManagementOpen(false); if(workspace) location.hash='#/session/desk'; }}
                onExpandedChange={expanded => { setPartyExpanded(expanded); if (expanded) setPartyManagementOpen(false); if(workspace) location.hash='#/session/desk'; }}
                context={<PartyContextPanel showTitle={false} snapshot={partyContextOf(state, events, !dmView)} dmView={dmView} profile={<SubjectProfileShell envelope={partySubjectEnvelope(state, dmView ? 'dm' : 'players') as AnySubjectEnvelope} />}
                  containers={dmView ? Object.values(state.inventoryContainers ?? {}) : []} inventory={dmView ? Object.values(state.inventory ?? {}) : []}
                  transports={dmView ? Object.values(state.transports ?? {}) : []}
                  locations={dmView ? Object.values(state.world.locations).map(place=>({id:place.id,name:place.name})).sort((a,b)=>a.name.localeCompare(b.name)) : []}
                  actors={state.party.flatMap(id => { const member=state.actors[id]; return member&&!member.removed ? [{id:member.id,name:member.name}] : []; })}
                  tradeActors={dmView ? Object.values(state.actors).filter(actor=>!actor.removed).map(actor=>({id:actor.id,name:actor.name,kind:actor.kind,inParty:state.party.includes(actor.id)})) : []}
                  tradeOffers={dmView ? Object.values(state.tradeOffers ?? {}) : []}
                  onCreateContainer={container => api.createInventoryContainer(container)}
                  onRemoveContainer={containerId => api.removeInventoryContainer(containerId)}
                  onCreateTransport={transport => api.createTransport(transport)}
                  onRemoveTransport={transportId => api.removeTransport(transportId)}
                  onMoveItem={(stackId,qty,to,splitStackId) => api.moveItem(stackId,qty,to,splitStackId)}
                  onTransferItem={(stackId,qty,actorId,splitStackId) => api.transferItem(stackId,qty,{kind:'actor',id:actorId},{kind:'actor',id:actorId},splitStackId)}
                  onCreateTradeOffer={(offerId, trade) => api.dispatch({ type: 'TRADE_OFFER_CREATED', payload: { offerId, trade } })}
                  onWithdrawTradeOffer={offerId => api.dispatch({ type: 'TRADE_OFFER_WITHDRAWN', payload: { offerId } })}
                  onCompleteTrade={(trade, interactionId) => api.dispatchInInteraction(interactionId, { type: 'TRADE_COMPLETED', payload: trade })}
                  onLocation={id => { setPartyExpanded(false); setView('desk'); goLadder(selectPlace(state, ladder, id)); }} />}
              />
              <div className="desk-party-actions">
                {partyExpanded && !workspace ? <button type="button" className={BTN} onClick={() => setPartyExpanded(false)}>Карта мира</button> : null}
                <button ref={partyManagementTriggerRef} type="button" className={BTN} aria-label="Управление партией" title="Управление партией" aria-expanded={partyManagementOpen} onClick={() => { setPartyManagementOpen(on => !on); setPartyExpanded(false); }}><span className="desk-party-manage-full">Управление партией</span><span className="desk-party-manage-short" aria-hidden="true">Партия</span></button>
              </div>
            </div> : null}
            {dmView && workspaceVisited && productRoute ? <div hidden={!workspace} className="desk-workspace-slot"><WorkspaceHub route={productRoute} state={state} onCharacter={() => setEditorOpen(true)} onImport={importContent} onNewCampaign={onNewCampaign} onExport={onExport} onStrifeThemeChange={enabled => api.dispatch({ type: 'CAMPAIGN_STRESS_THEME_SET', payload: { enabled } })}/></div> : null}
            <div className={`desk-view-surface flex-1 min-w-0 min-h-0 flex flex-col${face === 'card' && partyExpanded ? ' invisible' : ''}`} inert={face === 'card' && partyExpanded} aria-hidden={face === 'card' && partyExpanded || undefined}>
          {shownView === 'time' ? (
            <TimeView
              sec={state.time.sec}
              calendar={calendar}
              isForgottenRealms={isForgottenRealms}
              partyDeities={new Set(partyGods ? partyGods.split(',') : [])}
              mainRef={viewRef}
              dmView={dmView}
              tempo={tempo}
              lastStep={lastStep}
              stepDeltas={stepDeltas}
              scaleLabel={scaleLabel}
              decide={decide}
              api={api}
              {...(dmView ? { onGoTo: goToDay, onDowntime: applyDowntime, onRollDowntime: rollDowntimeCheck, onRollDowntimeEarnings: rollDowntimeEarnings,
                onSpendFavor: (payload: { actorId: string; deityRef: EntityRef; deityName: string; amount: 1 | 2; boon: string }) => api.dispatch({ type: 'A5E_FAVOR_SPENT', payload: { ...payload, source: 'a5e-srd:adventuring-8' } }) } : {})}
            />
          ) : shownView === 'pulse' ? (
            <PulseView
              state={state} mainRef={viewRef} onOpenEntity={openEntity} tensions={tensions} onThread={t => api.propose(tensionThreadDelta(state, t))}
              onPrepareCaravans={prepareCaravans} onSendCaravan={sendCaravan} onEndTradeLine={endTradeLine}
              onPrepareRumors={prepareRumors} onSendRumor={sendRumor}
              onPrepareWar={prepareWar} onProposeWar={proposeWar} onProposeWarBlockade={proposeWarBlockade} onProposeWarSiege={proposeWarSiege} onProposeWarSettlement={proposeWarSettlement} onProposeWarTerritoryControl={proposeWarTerritoryControl}
              onPrepareUrban={prepareUrban} onProposeFamine={proposeFamine} onProposeEpidemic={proposeEpidemic} onProposeCityFaction={proposeCityFaction} onProposeBlockade={proposeUrbanBlockade} onEndBlockade={endBlockade} onProposeFactionRelation={proposeFactionRelation}
              onPrepareCosmic={prepareCosmic} onProposeCosmic={proposeCosmic}
              {...(dmView ? { onProcessClockVisibility: proposeProcessClockVisibility } : {})}
              branches={<BranchPanel main={state} branches={branchApi.branches} onOpen={branchApi.open} onKeep={branchApi.keep} onDrop={branchApi.drop} fresh={branchApi.fresh} />}
            />
          ) : shownView === 'chrono' ? (
            isPlanetos ? <PlanetosChronologyView mainRef={viewRef} onOpenEntity={openEntity} /> : (
              <ChronologyView
                mainRef={viewRef}
                campaignYear={campaignYear}
                year={lens ?? campaignYear}
                onYear={y => setLens(y === campaignYear ? null : y)}
                onOpenEntity={openEntity}
                onShowMap={() => { pendingMapFocus.current = true; setView('desk'); }}
                allEntries={allEntries}
                dmView={dmView}
                calendar={calendar}
              />
            )
          ) : shownView === 'notebook' ? (
            <NotebookView mainRef={viewRef} state={state} onOpen={openEntity} />
          ) : shownView === 'journal' ? (
            <JournalView
              mainRef={viewRef}
              state={state}
              dmView={dmView}
              allEntries={allEntries}
              filtered={filtered}
              threads={threads}
              filterThreads={filterThreads}
              setFilterThreads={setFilterThreads}
              filterScales={filterScales}
              setFilterScales={setFilterScales}
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              noteForPlayers={noteForPlayers}
              setNoteForPlayers={setNoteForPlayers}
              addNote={addNote}
              reminders={reminders}
              setLaterFacts={setLaterFacts}
              entryProps={entryProps}
              api={api}
              {...(onViewPast && dmView ? { onViewPast } : {})}
            />
          ) : (
            // Главная зона (§4): лестница масштабов и под ней уровень — сетка на ступени боя, карточки на остальных
            // (MVP: карт нет). В бою карточка рядом с сеткой — по кнопке «Карточка»: главная зона отдана полю боя.
            <section aria-label={ladder.level === 'battle' && combat ? 'Поле боя' : 'Мир'} ref={viewRef} tabIndex={-1} className="relative flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="desk-world-layout relative flex flex-1 min-w-0 min-h-0">
                <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className={`${HEAD} desk-level-heading`}>
                {ladder.level === 'battle' && combat ? (
                  <>
                    <Icon name="scale-battle" size={16} color="var(--t2)" title="Масштаб: бой" />
                    <span>Поле боя</span>
                    <span className="type-key text-t2 normal-case" title="Клетка — 5 футов">{field.cols} × {field.rows} клеток по 5 футов</span>
                    {maptool && dmView && <MapToolChip link={maptool} />}
                  </>
                ) : (
                  <>
                    <Icon name={`scale-${ladder.level}`} size={16} color="var(--t2)" title={`Масштаб: ${SCALE_LABELS[ladder.level].toLowerCase()}`} />
                    <span data-part="level">{SCALE_LABELS[ladder.level]}{focus ? ` · ${ladder.level === 'cosmology' && isForgottenRealms ? cosmologyView === 'tree' ? 'Великое Древо' : cosmologyView === 'axis' ? 'FR 4e post-Spellplague' : focus.name : focus.name}` : ''}</span>
                    {dmView ? <span className="type-key text-t2 normal-case" data-part="level-tempo" title="Рекомендованный темп масштаба; текущий шаг выбран в часах">рекомендация: {SCALE_TEMPO_LABELS[ladder.level]}</span> : null}
                    {chosenPlace ? <span className="type-key text-t2 normal-case" data-part="chosen" title="Место пути ниже: туда спустится ]">выбрано: {chosenPlace.name}</span> : null}
                  </>
                )}
                {dmView || combat || card ? (
                  <div className="ml-auto flex items-center gap-1">
                    {card ? (
                      // Подсказка клавиши — только мастеру: на столе игроков подсказок нет (F8).
                      <button ref={cardOverlayTriggerRef} type="button" title={`Развернуть карточку: ${overlayName ?? ''} в две колонки поверх стола${dmView ? ' · Esc закрывает' : ''}`} onClick={openCardOverlay} className={BTN}>Развернуть</button>
                    ) : null}
                    {dmView ? (
                      <Popover.Root open={spawnOpen} onOpenChange={o => { setSpawnOpen(o); if (!o) setSpawnPick(undefined); }}>
                        <Popover.Trigger asChild>
                          <button type="button" title="Добавить противника из блока SRD; в бою — сразу в порядок инициативы" className={BTN}>Добавить</button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Добавить противника" className="spawn-popover z-20 outline-none">
                            <SpawnForm key={spawnPick ?? 'any'} options={spawnOptions} onSpawn={onSpawn} suggestName={suggestName} {...(spawnPick ? { initial: spawnPick } : {})} />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    ) : null}
                    {combat ? (
                      <button
                        type="button"
                        aria-pressed={cardInCombat}
                        title={actor ? `Карточка рядом с сеткой: ${actor.name}` : 'Карточка рядом с сеткой'}
                        onClick={() => setCardInCombat(v => !v)}
                        className={BTN}
                      >
                        Карточка
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {ladder.level === 'battle' && combat ? (
                <div className="desk-map-layout flex-1 min-h-0 min-w-0 flex">
                  {cardInCombat ? <aside className="desk-inspector" aria-label="Участник боя">{focusedCard}</aside> : null}
                  <div className="flex-1 min-w-0 min-h-0 overflow-auto p-4" aria-label="Область боевой карты">
                  <BattleGrid
                    cols={field.cols}
                    rows={field.rows}
                    cell={BATTLE_CELL}
                    fitToWidth
                    tokens={tokens}
                    walls={field.walls}
                    cone={field.cone}
                    affected={field.affected}
                    activeId={activeId}
                    selectedId={selectedId}
                    onSelect={openFromToken(mainRef)}
                    className="flex-none"
                  />
                  </div>
                </div>
              ) : (
                <LevelZone
                  state={state}
                  events={events}
                  ladder={ladder}
                  focus={focus}
                  here={here}
                  dmView={dmView}
                  combat={combat}
                  cardInCombat={cardInCombat}
                  counts={counts}
                  pendingIds={pendingIds}
                  map={map}
                  savedMapView={mapViewKey ? mapViews.current[mapViewKey] : undefined}
                  onMapViewChange={next => {
                    if (!mapViewKey) return;
                    if (next) mapViews.current[mapViewKey] = next;
                    else delete mapViews.current[mapViewKey];
                  }}
                  terrain={terrain}
                  roads={roads}
                  schema={schema}
                  underdark={underdark}
                  gazetteer={gazetteer}
                  lens={lensYear !== null ? { year: lensYear, marks: eventMarks, onClear: () => setLens(null) } : undefined}
                  onScene={id => { showCard({ kind: 'entity', ref: ref('place', id) }); setTab(TAB_NOW.id); }}
                  planetView={planetView}
                  onPlanetView={setPlanetView}
                  onCityView={setCityView}
                  cosmologyView={cosmologyView}
                  onCosmologyView={setCosmologyView}
                  journey={journeyReady && isForgottenRealms ? journey : undefined}
                  onTravel={onTravel}
                  goLadder={goLadder}
                  onPin={id => goLadder(selectPlace(state, ladder, id))}
                  onNewPlace={(d, parent) => map && api.propose(newPlaceDelta(state, { ...d, map: map.passport.id }, parent))}
                  onGeoreference={(id, point, passport) => api.propose(locationGeoDelta(state, id, passport, point))}
                  onSettlementPlan={(draft,location,mapId)=>api.propose(settlementPlanDelta(state,location,mapId,draft))}
                  tensions={tensions}
                  influence={tensionData?.influence}
                  stacks={levelStacks}
                  card={card}
                  showInspector={!partyActorInMap}
                />
              )}
                </div>
                <div className="desk-scale-column">
                  <ArmillaryScale steps={steps} current={ladder.level} onSelect={lvl => goLadder(jumpTo(state, ladder, lvl))} />
                  <ScaleLadder steps={steps} current={ladder.level} onSelect={lvl => goLadder(jumpTo(state, ladder, lvl))} orientation="vertical" compact className="desk-scale-steps" />
                </div>
              </div>
            </section>
          )}
            </div>
            {sheetDialog}
            {cardOverlayDialog}
            {compareDialog}
            {editorDialog}
            <div ref={setOverlayHost} className="desk-overlay-host" />
          </section>
          {hpPopover}
        </Popover.Root>

        {timePreviewDialog}

        <ToolsPanel
          state={state}
          events={events}
          api={api}
          dmView={dmView}
          combat={combat}
          shownView={shownView}
          canUndo={canUndo}
          canRedo={canRedo}
          resetArmed={resetArmed}
          setResetArmed={setResetArmed}
          onReset={onReset}
          onNewCampaign={onNewCampaign}
          onExport={onExport}
          onImport={onImport}
          onImportContent={importContent}
          note={note}
          setNote={setNote}
          toast={toast}
          shownRoll={shownRoll}
          setClosedRollId={setClosedRollId}
          hiddenRolls={hiddenRolls}
          canRecordPhysicalRoll={dmView && !past}
          setHiddenRolls={setHiddenRolls}
          openThreads={openThreads}
          threads={threads}
          filterThreads={filterThreads}
          setFilterThreads={setFilterThreads}
          concentrationReminders={concentrationReminders}
          conditionReminders={conditionReminders}
          setLaterConcentration={setLaterConcentration}
          onCommand={onCommand}
          pending={pending}
          festival={festival}
          holy={holy}
          journal={journal}
          allEntries={allEntries}
          entryProps={entryProps}
          railTools={railTools}
          characterOverlayContainer={overlayHost}
          characterEra={activeEra}
          onSettingPackageChanged={() => {
            setCardOverlay(false);
            setCardOf({ kind: 'actor' });
            setLadderState(initialLadder(store.getState().state));
          }}
          onOpenEntity={entityRef => {
            setOpenRail(null);
            openEntity(entityRef);
          }}
          toolsPin={toolsPin}
          toolsRailItems={toolsRailItems}
          openRail={openRail}
          setOpenRail={setOpenRail}
        />
      </div>

      {combat ? (
        <div ref={barRef} className="flex-none">
          <InitiativeBar
            round={encounter.round}
            entries={initiative}
            activeId={activeId}
            selectedId={selectedId}
            onOpen={openFromToken(barRef)}
            onNextTurn={dmView ? () => { api.nextTurn(); if (!store.getState().state.encounter.lairActionWindow) regainLegendary(store.getState()); } : undefined}
            onEnd={dmView ? () => api.endEncounter() : undefined}
            onLegendarySpend={dmView ? spendLegendary : undefined}
            onLegendaryRestore={dmView ? restoreLegendary : undefined}
            onLairAction={dmView ? useLairAction : undefined}
            lairActionWindowOpen={Boolean(encounter.lairActionWindow)}
          />
        </div>
      ) : null}
      {dmView ? <TimelineRibbon dmView={dmView} state={state} entries={allEntries} calendar={calendar} lensYear={lensYear}
        onYear={setLens} onOpenEntity={openEntity} onInbox={() => setOpenRail({ side: 'tools', item: 'inbox' })}
        onCreatePlan={(plan: TimelinePlanDraft) => api.dispatch({ type: 'TIMELINE_PLAN_CREATED', payload: { plan } })}
        onCancelPlan={(planId: string) => api.dispatch({ type: 'TIMELINE_PLAN_CANCELLED', payload: { planId } })}
        clockSlot={<div className="desk-world-clock-dock"><div ref={setClockDock} /></div>}
        clockHidden={face === 'card' && partyExpanded && !workspace} /> : null}
      {!dmView ? <div className="desk-world-clock-dock" role="group" aria-label="Мировые часы" hidden={face === 'card' && partyExpanded && !workspace}>
        <div ref={setClockDock} />
      </div> : null}
    </main>
    </PlayerFrame>
    </OpenEntityContext.Provider>
  );
}

export default DeskPage;
