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
import './DeskPage.css';
import { Dialog, Popover, ToggleGroup } from 'radix-ui';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  conModOf, cosmologyOf, formatHarptos, pathOf, nextLevelText, levelUp, levelUpPlan, type LevelUpPlan, KNOWLEDGE_DC, KNOWLEDGE_RULE, KNOWLEDGE_SKILLS, isLore, knowledgeSkillOf, knownFacts, knownLine, passiveVoices, playersEntityView, currentOrder, eraOf, harptos, dayPhase, encounterCandidates, hitDiceOf, initiativeMod, moonState, nextFestival, nextHolyDayFor, partyDeitiesOf, placeChain, pcActor, placedActors,
  poolLabel, resourcePoolsOf, restCandidates, restResourcesOf, seedBattlefield, seedEngine, seedState, sortInitiative, spawnMonsters, stepTime,
  suggestMonsterName, encounterMonsterId, LEGENDARY_RESOURCE, legendaryTrackOf, regainLegendary, takeRest, travel, supplyOf, tensionThreadDelta, sameDayIn, weatherOf, seasonOf, sheetViewOf, passportOf, newPlaceDelta, renownDelta, referenceFactionDelta, factionOf, oddsTargetOf, explain, signedTotal, concentrationSpellsOf, type PcSpec,
} from '../campaign';
import {
  BattleGrid, CardStack, ConditionGrid, DerivationPanel, EntityCard, EntityViewBody, OpenEntityContext, cardTypeOf, HpControl, InitiativeBar, JourneyActivities, Paperdoll, PlayerFrame, ScaleLadder, type ActivityMember, type RollMode, OUTCOME_LABEL,
  SCALE_LABELS, SCALE_TEMPO_LABELS, TAB_NOW, TAB_OVERVIEW, SceneView, actorCardProps, battleTokenOf, exhaustionCommand, factionCardProps, initiativeFormula,
  initiativeTokenOf, lastDamageOf, lastRollOf, placeCardProps, stackItemOf, toggleCommand, type CompareColumn, SheetEquipment,
  dollExtrasOf, KnowledgeCheck, SkillVoices, CharacterPathView, type KnowledgeMember, type IconRailItem, type InitiativeBarEntry, type InitiativeRow, type RestRow, type SpawnOption,
} from '../components';
import {
  EventLog, LEVEL_TEMPO, SCALE_LEVELS, SECONDS_PER_DAY, childrenOf, createEngineStore, filterJournal, focusOf, initialLadder, journalEntries, jumpTo, ladderLevels,
  localStorageStore, memoryStore, parseLog, serializeLog, type EventStore, moveLevel, normalizeLadder, partyPlaceId, pendingFor, pendingTargets,
  placeCounts, plural, selectPlace, threadSummaries, type Actor, type Command, type EngineStoreApi, type InitiativeEntry,
  type JournalEntry as JournalRecord, type Ladder, type RestHitDice, type RestKind, type ScaleLevel, type Tempo,
} from '../engine';
import { useEngine, useHpFlashes, useUndoKeys } from '../engine/useEngine';
import { KIND_LABEL, isEntityRef, parseRef, ref, type EntityFact, type EntityRef, type EntityView } from '../entities';
import { useEntity } from '../entities/useEntity';
import { Icon } from '../icons/Icon';
import { classById } from '../rules/compendium';
// Экран создания — ленивым куском (ROADMAP 0.5): догружается после первой отрисовки, до открытия редактора.
import { BranchPanel, CharacterCard, CharacterEditor, ChronologyView, CompareSheet, ConcentrationForm, JournalView, LevelUpForm, PulseView, SpawnForm, TimeView } from '../lazyParts';
import { levelMap } from '../map/levelMap';
import type { JourneyProps, TravelRoute } from '../map/WorldMap';
import {
  ENCOUNTER_TYPE_LABEL, JOURNEY_ACTIVITIES, JOURNEY_REGIONS, WARM_REGIONS, encounterAt, journeyLoaded, loadJourney, regionActivityMods, tierOfLevel, weatherAt, weatherRollLabel,
} from '../rules/a5e/journey';
import { LevelZone } from './desk/LevelZone';
import { useMapData } from './desk/useMapData';
import { useMapToolBridge } from './desk/useMapToolBridge';
import { MapToolChip } from './desk/MapToolChip';
import { useScene } from './desk/useScene';
import { suggestNpcName } from './desk/npcName';
import {
  MONSTER_IDS, MONSTER_ORIGIN_LABEL, MONSTERS, loadMonsterLibraries, monsterLibrariesLoaded, monsterOrigin, needsMonsterLibraries, type MonsterId,
} from '../rules/srd';
import { type BodyProps, DmTab, FactionOverview, MonsterActions, MonsterOverview, MonsterSeen, OrgCampaignLine, PcLore, PcOverview, PcSkills, PcSpells, PlaceOverview, chronicleOf, classFeatureItems, pcHeaderData, raceTraitItems } from './desk/bodies';
import { characterCardProps } from '../campaign/characterCard';
import { SKILL_LABEL } from '../components/labels';
import { ABILITIES } from '../rules/srd/abilities';
import {
  type OpenRail, BATTLE_CELL, DESK_HASH, DESK_LOG_KEY, JOURNAL_TAIL, NARROW_QUERY, NEW_PC_HASH, concentrationRemindersOf, conditionRemindersOf,
  d20Formula, deskDollItems, dmFactsAbout, dmFactsOf, factionItems, hereItems, isDeskHotkey, isNarrow, journalEntryProps, ladderSteps,
} from './desk/helpers';
import { downloadText, readText, sessionFileName } from './desk/session';
import { BTN, BTN_HEAD, CONDITION_DURATIONS, HEAD, OPT, OPT_OFF, OPT_ON, type DeskView } from './desk/styles';
import { ClockBar } from './desk/ClockBar';
import { PartyPanel } from './desk/PartyPanel';
import { useTensions } from './desk/useTensions';
import { useBranches } from './desk/useBranches';
import type { ChronoEvent } from '../world/chronology';
import { NotebookView } from './desk/NotebookView';
import { ToolsPanel } from './desk/ToolsPanel';
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
}

type CardFace = 'card' | 'sheet';

interface DeskProps {
  store: EngineStoreApi;
  dmView: boolean;
  cardFace: CardFace;
  /** Сохранённый лог не поднялся или файл не открылся — первая заметка мастеру. */
  recoverNote: string | null;
  /** «Новая сессия»: стереть журнал и собрать стол из сида заново. */
  onReset: () => void;
  /** «Сохранить» — журнал сессии файлом; «Открыть…» — стол из файла (проверяется реплеем до подмены). */
  onExport: () => void;
  onImport: (file: File) => void;
  /** «Стол на этот день» из хроники журнала (Д5): реплей лога до конца дня — отдельным стором в памяти. */
  onViewPast?: (endSec: number) => void;
  /** Стол прошлого дня: плашка сверху и «Вернуться»; что сделано здесь, в сессию не попадает. */
  past?: { label: string; onExit: () => void };
}

/**
 * Страница: один стор на сессию. Сохранённый лог мог перестать реплеиться (сид изменился) — seedEngine чистит
 * хранилище и собирает стол из сида, а причина становится первой заметкой мастеру: потеря сессии не проходит
 * молча. «Новая сессия» — не событие (нечего отменять: журнала больше нет): хранилище чистится, стор поднимается
 * из сида, стол перемонтируется целиком — выбор, лестница и фильтры начинаются заново.
 */
export function DeskPage({ store: given, persist: givenPersist, dmView = true, cardFace = 'card' }: DeskPageProps) {
  const persist = useRef<EventStore>(givenPersist ?? localStorageStore(DESK_LOG_KEY));
  const recovered = useRef<string | null>(null);
  const make = () => seedEngine({ persist: persist.current, onRecover: r => { recovered.current = r; } });
  const [session, setSession] = useState(() => ({ n: 0, store: given ?? make(), note: null as string | null }));
  const reset = () => {
    persist.current.clear();
    recovered.current = null;
    setSession(s => ({ n: s.n + 1, store: make(), note: null }));
  };
  const exportLog = () => downloadText(sessionFileName(), serializeLog(session.store.getState().events));
  // Стол на прошлый день (Д5): начало лога до конца дня — реплеем на сиде в памяти, только просмотр.
  const [past, setPast] = useState<{ sec: number; store: EngineStoreApi } | null>(null);
  const viewPast = (endSec: number) => {
    const mem = memoryStore();
    mem.save(EventLog.prefixUntil(seedState(), session.store.getState().events, endSec));
    setPast({ sec: endSec, store: createEngineStore(seedState(), { persist: mem }) });
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
      createEngineStore(seedState(), { persist: trial });
      const opened = `Открыт файл ${file.name}: ${events.length} ${plural(events.length, ['событие', 'события', 'событий'])}.`;
      recovered.current = null;
      // Браузер не принял лог (квота): стол из файла живёт в памяти — иначе make() поднял бы старую сессию из хранилища.
      if (persist.current.save(events) === false) {
        const fromFile: EventStore = { load: () => trial.load(), save: e => persist.current.save(e), clear: () => persist.current.clear() };
        setSession(s => ({ n: s.n + 1, store: createEngineStore(seedState(), { persist: fromFile }), note: `${opened} В браузер он не сохранился — место кончилось; сохраняйте сессию файлом.` }));
        return;
      }
      setSession(s => ({ n: s.n + 1, store: make(), note: opened }));
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
        recoverNote={null}
        onReset={() => setPast(null)}
        onExport={() => downloadText(sessionFileName(), serializeLog(past.store.getState().events))}
        onImport={() => {}}
        past={{ label: formatHarptos(past.sec).replace(/,.*$/, ''), onExit: () => setPast(null) }}
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
      recoverNote={session.note ?? (recovered.current ? 'Сохранённая сессия не открылась — стол собран заново из сида.' : null)}
      onReset={reset}
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
const WHY_TITLE: Readonly<Record<WhyKey, string>> = { ac: 'AC', initiative: 'Инициатива', pp: 'Пассивная Внимательность', hp: 'Максимум хитов' };

/** Что показывает слот карточки: выбранного актёра, место в фокусе лестницы или державу по id. */
/** Слот карточки: актёр, место в фокусе, фракция — свои карточки; любая другая сущность по ссылке — общая (ROADMAP 0.3). */
type CardSlot = { kind: 'actor' } | { kind: 'place' } | { kind: 'faction'; id: string } | { kind: 'entity'; ref: EntityRef };

function Desk({ store, dmView: dmViewProp, cardFace, recoverNote, onReset, onExport, onImport, onViewPast, past }: DeskProps) {
  // Режим «глазами игроков» — состояние вида, не событие: P переключает, рамка обозначает, модель фильтрует.
  // Всё, чего игрокам видеть нельзя, в DOM не попадает (CLAUDE.md «Правила экрана»), а не приглушается.
  const [playersView, setPlayersView] = useState(!dmViewProp);
  const dmView = !playersView;
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
  const [selectedId, setSelectedId] = useState(() => state.party[0] ?? '');
  const [tab, setTab] = useState(TAB_OVERVIEW.id);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<PopoverAnchor>('card');
  const [note, setNote] = useState<string | null>(recoverNote);
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
  // Отметки строк партии и лист сравнения — состояние вида (CLAUDE.md: выбор и оверлеи событиями не являются).
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  /** Редактор персонажа (шаг B) — оверлей в главной зоне; черновик — его собственное состояние, в лог идёт только ACTOR_SPAWNED. */
  // #/desk/new — вход в создание персонажа извне стола (кнопка на экране компендиума): открыть редактор, хэш вернуть к столу.
  // Открывается после монтирования: диалог порталится в главную зону, а её узел появляется только с первым рендером.
  const [editorOpen, setEditorOpenRaw] = useState(false);
  const setEditorOpen = (open: boolean) => {
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
  const campaignYear = harptos(state.time.sec).year;
  const [lens, setLens] = useState<number | null>(null);
  const lensYear = dmView && lens !== null && lens !== campaignYear ? lens : null;
  const entityView = useEntity(cardOf.kind === 'entity' ? cardOf.ref : null, state, lensYear !== null ? eraOf(lensYear) : undefined, lensYear ?? undefined);
  const [lensEvents, setLensEvents] = useState<readonly ChronoEvent[]>([]);
  useEffect(() => {
    if (lensYear === null) { setLensEvents([]); return; }
    let live = true;
    // Хронология — своим куском: основной не больше 500 КБ.
    void import('../world/chronology').then(m => m.loadEvents(lensYear, lensYear)).then(e => { if (live) setLensEvents(e); });
    return () => { live = false; };
  }, [lensYear]);
  /** События года линзы у мест справочника карты: место → строки. */
  const eventMarks = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const e of lensEvents) {
      for (const l of e.links ?? []) if (l.ref?.startsWith('place:')) out.set(l.ref.slice(6), [...(out.get(l.ref.slice(6)) ?? []), e.text]);
    }
    return out;
  }, [lensEvents]);
  /** Уровень планеты: глобус или плоская карта — состояние экрана, не событие. */
  const [planetView, setPlanetView] = useState<'globe' | 'map'>('globe');
  /** Поселение с планом (M10): по умолчанию план; карта мира — для похода и окрестностей. */
  const [cityView, setCityView] = useState<'plan' | 'map'>('plan');
  // Модель космологии на уровне «космология» — линза, не событие: Великое колесо (действует в 1492 DR) или Великое древо (1372 DR).
  // Линза космологии по умолчанию — от года кампании (ROADMAP 0.6): 1372 DR — Древо, 1492 DR — Колесо.
  const [cosmologyView, setCosmologyView] = useState<'wheel' | 'tree'>(() => cosmologyOf(harptos(state.time.sec).year));
  // Журнал сессии (F7) — вид главной зоны, не событие: фильтр по нитям и уровням, черновик заметки,
  // отложенные напоминания о секретах («Позже») — всё живёт здесь и не переживает перезагрузку.
  const [view, setView] = useState<DeskView>('desk');
  // Темп — переключатель, не событие (HANDOFF §7): начальный — из состояния, в бою всегда раунды.
  const [tempoChoice, setTempoChoice] = useState<Tempo>(() => state.time.tempo);
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
  const cardRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Якорь попапа от токена — сам элемент токена: Radix меряет его через virtualRef, DOM-обёртка не нужна.
  const tokenAnchor = useRef<HTMLElement | null>(null);
  // Поле боя — данные сида (расстановка F2): стены, шаблон, стартовые клетки; дальше клетку несёт актёр (TOKEN_MOVED).
  const [field] = useState(seedBattlefield);

  const actor: Actor | undefined = state.actors[selectedId];
  const party = state.party.map(id => state.actors[id]).filter((a): a is Actor => a !== undefined);
  // Противники — монстры, что не выбыли; в бою их место — на сетке и в полосе инициативы.
  const foes = Object.values(state.actors).filter(a => a.kind === 'monster' && !a.removed);
  // На столе игроков секретов нет вовсе — ни в записях, ни в счётчиках, ни в сводке нитей.
  const allEntries = filterJournal(journalEntries(events, state), { dmView });
  const journal = allEntries.slice(-JOURNAL_TAIL);
  const filtered = filterJournal(allEntries, { threads: filterThreads, scales: filterScales });
  const threads = threadSummaries(allEntries, state, state.time.sec).map(t => (dmView ? t : { ...t, secrets: [] }));
  const pending = Object.values(state.deltas).filter(d => d.status === 'pending');
  const reminders = dmView ? Object.values(state.facts).filter(f => f.visibility === 'dm' && !laterFacts.includes(f.id)) : [];
  // Что система предлагает, но не делает сама (HANDOFF §7): концентрация на нуле хитов и по вышедшему сроку.
  const concentrationReminders = dmView ? concentrationRemindersOf(state).filter(r => !laterConcentration.includes(r.key)) : [];
  const conditionReminders = dmView ? conditionRemindersOf(state).filter(r => !laterConcentration.includes(r.key)) : [];
  const { encounter } = state;
  const combat = encounter.active;
  const tempo: Tempo = combat ? 'round' : tempoChoice;
  const moon = moonState(state.time.sec);
  const phase = dayPhase(state.time.sec);
  const places = placeChain(state);
  const scaleLabel = (sc: ScaleLevel) => (places[sc] ? `${SCALE_LABELS[sc]} · ${places[sc]}` : SCALE_LABELS[sc]);
  const stepDeltas = dmView ? (lastStep?.deltaIds ?? []).map(id => state.deltas[id]).filter(d => d?.status === 'pending') : [];
  // Тетрадь (Д6) — когда партия что-то узнала: пустого вида нет.
  const hasNotebook = Object.keys(state.knowledge ?? {}).length > 0;
  const views: readonly DeskView[] = [...(dmView ? ['desk', 'time', 'pulse', 'chrono', 'journal'] as const : ['desk', 'journal'] as const), ...(hasNotebook ? ['notebook'] as const : [])];
  // Виды «Время» и «Пульс» — экраны мастера: на столе игроков вместо них стол, а состояние вида не теряется до возврата.
  const shownView = (!dmView && (view === 'time' || view === 'pulse' || view === 'chrono')) || (view === 'notebook' && !hasNotebook) ? 'desk' : view;
  const openThreads = Object.values(state.world.threads).filter(t => t.status === 'open');
  const activeId = combat ? encounter.order[encounter.turnIndex] : undefined;
  const initiative: InitiativeBarEntry[] = encounter.order.flatMap(id => {
    const a = state.actors[id];
    if (!a) return [];
    // Легендарные действия блока (Q13) — только мастеру: на столе игроков у монстра нет блока (Q1).
    const legendaryActions = dmView ? legendaryTrackOf(a) : null;
    return [{ ...initiativeTokenOf(a, a.initiative ?? 0, { players: !dmView }), ...(legendaryActions ? { legendaryActions } : {}) }];
  });
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
  const onRoll = (formula: string, label: string) => { api.rollDice(formula, { label, hidden: hiddenRolls }); };
  const onCommand = (cmd: Command) => { api.dispatch(cmd); };
  const open = (id: string) => {
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
   * Переход по лестнице: уровень и путь — новые, слот карточки — место в фокусе, главная зона — стол. Темп часов
   * следует за уровнем (HANDOFF §3: на уровне боя — раунды, на планете — сезоны), мастер может сменить его руками.
   */
  const goLadder = (next: Ladder) => {
    if (next === ladder) return;
    setLadderState(next);
    if (next.level !== ladder.level) setTempoChoice(LEVEL_TEMPO[next.level]);
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
  }, [store, hiddenRolls]);

  /** @упоминание открывает карточку: актёра — в слоте, место — прыжком лестницы к нему, фракцию — со стопки держав. */
  const onMention = (entity: 'actor' | 'location' | 'faction' | 'ref', id: string) => {
    if (entity === 'ref') { if (isEntityRef(id)) openEntity(id); return; }
    if (entity === 'actor' && state.actors[id]) { open(id); setView('desk'); }
    else if (entity === 'location' && state.world.locations[id]) goLadder(selectPlace(state, ladder, id));
    else if (entity === 'faction' && state.world.factions[id]) { showCard({ kind: 'faction', id }); setView('desk'); }
  };
  /** Карточка по ссылке «вид:id»: актёр, место кампании и фракция — своими слотами, остальное — общей карточкой. */
  const openEntity = (r: EntityRef) => {
    const p = parseRef(r);
    if (!p) return;
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
  /** Шаг времени: TIME_ADVANCED и предложения симуляции за отрезок; сводка «что изменилось» поднимается сразу. */
  const onStep = (steps: number) => {
    const { event, proposals } = stepTime(store.getState(), tempo, steps);
    setLastStep({ eventId: event.id, deltaIds: proposals.map(d => d.id) });
    setView('time');
  };
  /** «Перейти к этому дню» (Д5): шаг днями до выбранного дня — тот же шаг времени, время суток то же. */
  const goToDay = (daySec: number) => {
    const n = Math.round((daySec - Math.floor(state.time.sec / SECONDS_PER_DAY) * SECONDS_PER_DAY) / SECONDS_PER_DAY);
    if (n <= 0) return;
    const { event, proposals } = stepTime(store.getState(), 'day', n);
    setLastStep({ eventId: event.id, deltaIds: proposals.map(d => d.id) });
  };
  const decide = (deltaId: string, verdict: 'accept' | 'reject') => (verdict === 'accept' ? api.accept(deltaId) : api.reject(deltaId));
  /** Бросок для редактора инициативы и новичков: DICE_ROLLED в лог (скрытость — как у прочих бросков мастера), итог — числом. */
  const rollTotal = (formula: string, label: string) => api.rollDice(formula, { label, hidden: hiddenRolls }).payload.total;
  const initiativeRows: InitiativeRow[] = encounterCandidates(state).map(a => ({ id: a.id, name: a.name, kind: a.kind, mod: initiativeMod(a), initiative: a.initiative }));
  /** Порядок из редактора: до боя — ENCOUNTER_STARTED с ним, в бою — INITIATIVE_SET (ход остаётся у того, чей был). */
  const applyInitiative = (order: InitiativeEntry[]) => {
    if (combat) api.setInitiative(order);
    else {
      api.startEncounter(order);
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
  const spawnOptions: SpawnOption[] = MONSTER_IDS.map(id => {
    const m = MONSTERS[id];
    return { id, name: m.name, cr: m.cr, ac: m.ac.value, hp: m.hp.average, origin: MONSTER_ORIGIN_LABEL[monsterOrigin(m)], suggested: suggestMonsterName(state, id), humanoid: /humanoid/i.test(m.type) };
  });
  const suggestName = (monsterId: string) => suggestNpcName(store.getState().state, MONSTERS[monsterId as MonsterId].type);
  /**
   * Противник появился: ACTOR_SPAWNED на каждого снимком; в бою — бросок инициативы каждому и INITIATIVE_SET
   * с прежними бросками остальных (порядок — снимком целиком, §7). Первый новичок — в слоте карточки.
   */
  const onSpawn = (monsterId: string, name: string, count: number) => {
    const actors = spawnMonsters(store.getState().state, monsterId as MonsterId, name, count);
    for (const a of actors) api.spawn(a);
    if (combat) {
      const fresh = actors.map(a => ({ actorId: a.id, initiative: rollTotal(initiativeFormula(initiativeMod(a)), `Инициатива · ${a.name}`) }));
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
  const festival = nextFestival(state.time.sec);
  // Святой день меняется раз в сутки: перебор года по дням — только при смене дня.
  const today = Math.floor(state.time.sec / SECONDS_PER_DAY);
  // Сначала святые дни богов партии (E8): ключ — их id, чтобы пересчёт шёл и при смене бога на листе.
  const partyGods = [...partyDeitiesOf(state).keys()].sort().join(',');
  const holy = useMemo(
    () => nextHolyDayFor(today * SECONDS_PER_DAY, eraOf(harptos(today * SECONDS_PER_DAY).year), new Set(partyGods ? partyGods.split(',') : [])),
    [today, partyGods],
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
  const toolsPin = railTools ? (
    <button type="button" title="Закрепить панель на столе" onClick={() => { setRailTools(false); setOpenRail(null); }} className={`ml-auto ${BTN_HEAD}`}>Закрепить</button>
  ) : (
    <button type="button" title="Свернуть панель в полосу иконок" onClick={() => setRailTools(true)} className={`ml-auto ${BTN_HEAD}`}>Свернуть</button>
  );
  const restRows: RestRow[] = restCandidates(state).map(a => {
    const hd = hitDiceOf(a);
    return {
      id: a.id, name: a.name, kind: a.kind, hp: a.hp, conMod: conModOf(a),
      hitDice: hd ? { die: hd.die, available: hd.available, total: hd.total } : undefined,
      exhaustion: a.conditions.exhaustion?.level,
      shortRestores: restResourcesOf([a], 'short').map(r => poolLabel(resourcePoolsOf(a).find(p => p.id === r.resourceId)!)),
      longRestores: resourcePoolsOf(a).filter(p => p.spent > 0).map(poolLabel),
    };
  });
  /**
   * Отдых — час или восемь часов времени (симуляция предлагает, что случилось в мире) и REST_TAKEN. Есть предложения —
   * главная зона «Время» со сводкой, как после шага; нет — стол остаётся: хиты видны в корешке.
   */
  const onRest = (kind: RestKind, actorIds: string[], hitDice: RestHitDice[]) => {
    // Короткий отдых возвращает ресурсы по правилу SRD (система предлагает — форма показала список); долгий — все сам.
    const resting = actorIds.map(id => state.actors[id]).filter((a): a is Actor => a !== undefined);
    const { time, proposals } = takeRest(store.getState(), kind, actorIds, hitDice, restResourcesOf(resting, kind));
    setRestOpen(false);
    if (proposals.length > 0) {
      setLastStep({ eventId: time.id, deltaIds: proposals.map(d => d.id) });
      setView('time');
    }
  };
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
  const onTravel = (route: TravelRoute) => {
    if (!map) return;
    const { time, proposals } = travel(store.getState(), { ...route, map: map.passport.id, fromId: partyPlaceId(state) });
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
    if (!s.encounter.active) setTempoChoice(LEVEL_TEMPO[next.level]);
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

  const cardView = actor ? sheetViewOf(actor) : undefined;
  // Шансы блока монстра — по партии на столе (ROADMAP 5.2); только мастеру: MonsterActions у игроков не рисуется.
  const oddsTargets = party.filter(a => !a.removed).map(oddsTargetOf);
  // Шансы листа (5.3) — по блокам противников на столе: одинаковые блоки одной строкой «Bandit ×3».
  const byBlock = new Map<string, Actor[]>();
  for (const a of Object.values(state.actors)) if (a.kind === 'monster' && !a.removed && a.monsterId) byBlock.set(a.monsterId, [...(byBlock.get(a.monsterId) ?? []), a]);
  const enemyTargets = [...byBlock].map(([id, list]) => ({ ...oddsTargetOf(list[0]), id, name: `${MONSTERS[id]?.name ?? list[0].name}${list.length > 1 ? ` ×${list.length}` : ''}` }));
  const whyKey = actor && why?.actorId === actor.id ? why.key : undefined;
  const whyOf = whyKey && actor ? explain(actor, whyKey) : undefined;
  const closeWhy = () => setWhy(null);
  // Персонаж с листом (Д9): карта 63 × 88 на лице, «Лист» — полная карточка; выбор держится, пока стол открыт.
  const [face, setFace] = useState<CardFace>(cardFace);
  const pcCard = actor?.sheet && face === 'card' ? characterCardProps(actor, pcHeaderData(actor.sheet), state.time.sec) : undefined;
  const cardProps = actor ? actorCardProps(actor, {
    onHp: dmView ? openFromCard : undefined, dmFacts: dmFactsOf(actor, state.facts).length, initiative: cardView?.initiative, players: !dmView, hitDice: cardView?.hitDice,
    onExplain: key => setWhy(w => (w?.actorId === actor.id && w.key === key ? null : { actorId: actor.id, key })), explaining: whyKey,
  }) : null;
  /**
   * Тело вкладки актёра: `column` — одиночная карточка целиком; в оверлее 720px обзор делится на две колонки —
   * навыки персонажа и действия монстра уходят вправо (`aside`), остальное — влево (`main`). В оверлее
   * инструментов нет: хиты и концентрация правятся из одиночной карточки, оверлей — для чтения.
   */
  const [levelError, setLevelError] = useState<string | null>(null);
  const renderActorBody = (current: string, column: 'column' | 'main' | 'aside'): ReactNode => {
    if (!actor) return null;
    const body: BodyProps = { actor, worldSec: state.time.sec, onRoll, onCommand, tools: dmView && column === 'column' ? cardTools : null, dmView };
    if (column === 'aside') {
      if (current !== 'overview') return null;
      if (actor.kind === 'monster') return dmView ? <MonsterActions actor={actor} targets={oddsTargets} /> : null;
      return <PcSkills actor={actor} onRoll={onRoll} columns={1} />;
    }
    switch (current) {
      case 'overview':
        if (actor.kind === 'monster') return dmView ? <MonsterOverview {...body} /> : <MonsterSeen {...body} />;
        return <PcOverview {...body} skills={column === 'column'} passport={passportOf(actor, events)} enemies={enemyTargets} />;
      case 'actions':
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
          </>
        );
      case 'gear':
        return (
          <>
            <Paperdoll items={deskDollItems(actor.sheet)} {...dollExtrasOf(actor.sheet)} />
            {actor.sheet ? <SheetEquipment sheet={actor.sheet} /> : null}
          </>
        );
      case 'path': {
        const path = actor.sheet ? pathOf(actor.sheet) : undefined;
        if (!path) return null;
        // Повышение (Q10) — у мастера и только у персонажа партии; повысить нельзя (20-й, класс без SRD) — формы нет.
        let plan: LevelUpPlan | null = null;
        try { plan = dmView && actor.kind === 'pc' ? levelUpPlan(actor) : null; } catch { plan = null; }
        return (
          <>
            {plan ? (
              <LevelUpForm
                key={`${actor.id}-${actor.sheet!.level}`}
                plan={plan}
                abilities={actor.sheet!.abilities}
                onRoll={rollTotal}
                error={levelError}
                onLevelUp={choice => {
                  try { api.levelUp(levelUp(actor, choice)); setLevelError(null); } catch (err) { setLevelError(err instanceof Error ? err.message : String(err)); }
                }}
              />
            ) : null}
            <CharacterPathView path={path} next={nextLevelText(path)} />
          </>
        );
      }
      case 'dm':
        return <DmTab subjectId={actor.id} facts={state.facts} />;
      default:
        return null;
    }
  };
  const actorCard = actor && pcCard ? (
    <div ref={cardRef as React.RefObject<HTMLDivElement>} role="region" aria-label={actor.name} className="flex flex-col flex-none max-h-full">
      {anchor === 'card' ? <Popover.Anchor className="h-0 flex-none" /> : null}
      <CharacterCard
        card={pcCard}
        features={[...classFeatureItems(actor.sheet!), ...raceTraitItems(actor.sheet!).map(t => ({ ...t, meta: 'раса' }))]}
        onHp={dmView ? openFromCard : undefined}
        {...(dmView ? { onDamage: (n: number) => api.damage(actor.id, n), onHeal: (n: number) => api.heal(actor.id, n), conditions: renderActorBody('conditions', 'column') } : {})}
        onRollAbility={a => onRoll(d20Formula(a.mod), `${ABILITIES[a.id].code} · ${actor.name}`)}
        onRollSkill={sk => onRoll(d20Formula(sk.mod), `${SKILL_LABEL[sk.id]} · ${actor.name}`)}
        onInitiative={() => onRoll(d20Formula(pcCard.initiative), `Инициатива · ${actor.name}`)}
        gear={renderActorBody('gear', 'column')}
        // Пустая вкладка не показывается: «Заклинания» — у заклинателя, «История» — когда есть предыстория или хроника.
        {...(actor.sheet?.spellcasting ? { spells: <PcSpells actor={actor} /> } : {})}
        {...(actor.sheet?.backgroundId || chronicleOf(actor, allEntries).length > 0 ? { lore: <PcLore actor={actor} entries={allEntries} /> } : {})}
        onSheet={() => setFace('sheet')}
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
  const placeCard = focus ? (
    <EntityCard
      key={focus.id}
      {...placeCardProps(focus, { pending: pendingIds.has(focus.id), dmFacts: dmView ? dmFactsAbout(focus.id, state.facts).length : 0 })}
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
          wikiYear={dmView ? harptos(state.time.sec).year : undefined}
          onOpenEntity={openEntity}
          dm={dmView}
        />
      ) : current === TAB_NOW.id && scene ? <SceneView scene={scene} onOpen={openEntity} loading={sceneLoading} />
        : current === 'dm' ? <DmTab subjectId={focus.id} facts={state.facts} /> : null}
    </EntityCard>
  ) : null;
  const factionCard = faction ? (
    <EntityCard key={faction.id} {...factionCardProps(faction, { pending: pendingIds.has(faction.id) })} activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full flex-none">
      {(current: string) => (current === 'overview' ? <FactionOverview faction={faction} factions={state.world.factions} pending={dmView ? pendingFor(state, faction.id) : []} onOpenEntity={openEntity} onRenown={dmView ? step => api.propose(renownDelta(state, faction.id, step)) : undefined} /> : null)}
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
  const knowledgeMembers: KnowledgeMember[] = party.filter(a => !a.removed && a.sheet).map(a => ({ id: a.id, name: a.name, mods: Object.fromEntries((sheetViewOf(a)?.skills ?? []).map(sk => [sk.id, sk.mod])) }));
  const factAction = (view: EntityView) => (f: EntityFact) => {
    if (!dmView || !isLore(view)) return null;
    const known = knownFacts(state, view.ref).get(f.label);
    if (known) return <span className="inline-flex align-middle ml-1" data-known={f.label}><Icon name="src-players" size={16} color="var(--src-players)" title={`Известно игрокам: ${knownLine(known, state)}`} /></span>;
    return (
      <KnowledgeCheck
        fact={f}
        members={knowledgeMembers}
        skills={KNOWLEDGE_SKILLS}
        skill={knowledgeSkillOf(view)}
        dc={KNOWLEDGE_DC}
        rule={KNOWLEDGE_RULE}
        onRoll={rollTotal}
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
  const shownEntity = entityView && entityView !== 'loading' && !dmView ? playersEntityView(entityView, state) : entityView;
  const entityCard = cardOf.kind === 'entity' && entityView ? (
    <EntityCard
      key={cardOf.ref}
      type={entityView === 'loading' ? 'rule' : cardTypeOf(entityView.kind)}
      name={entityView === 'loading' ? 'Загрузка…' : entityView.name}
      badges={entityView === 'loading' ? [] : [KIND_LABEL[entityView.kind], ...(entityView.nameRu ? [entityView.nameRu] : [])]}
      origin={entityView !== 'loading' && entityView.source.kind === 'campaign' ? 'dm' : 'canon'}
      {...(entityPlace ? { tabs: PLACE_TABS, activeTab: tab, onTab: setTab } : {})}
      dmView={dmView}
      className="max-h-full flex-none"
    >
      {(current: string) => (entityView === 'loading' ? <p className="type-body-sm text-t2">Справочник загружается…</p>
        : entityPlace && current === TAB_NOW.id && scene ? <SceneView scene={scene} onOpen={openEntity} loading={sceneLoading} />
          : <>{orgLine(entityView, openEntity)}{voicesLine(entityView)}<EntityViewBody view={shownEntity as EntityView} onOpen={openEntity} factAction={factAction(entityView)} /></>)}
    </EntityCard>
  ) : null;
  const card = cardOf.kind === 'actor' ? actorCard : cardOf.kind === 'place' ? placeCard : cardOf.kind === 'entity' ? entityCard : factionCard;
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
  ) : cardOf.kind === 'place' && focus ? (
    <EntityCard {...placeCardProps(focus, { pending: pendingIds.has(focus.id), dmFacts: dmView ? dmFactsAbout(focus.id, state.facts).length : 0 })} overlay activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full">
      {(current: string) => current === 'overview' ? (
        <PlaceOverview place={focus} parent={focusParent} onOpenParent={focusParent ? () => { setCardOverlay(false); goLadder(selectPlace(state, ladder, focusParent.id)); } : undefined} pending={dmView ? pendingFor(state, focus.id) : []} facts={state.facts} wikiYear={dmView ? harptos(state.time.sec).year : undefined} onOpenEntity={r => { setCardOverlay(false); openEntity(r); }} dm={dmView} />
      ) : current === TAB_NOW.id && scene ? <SceneView scene={scene} onOpen={r => { setCardOverlay(false); openEntity(r); }} loading={sceneLoading} />
        : current === 'dm' ? <DmTab subjectId={focus.id} facts={state.facts} /> : null}
    </EntityCard>
  ) : cardOf.kind === 'entity' && entityView && entityView !== 'loading' ? (
    <EntityCard
      type={cardTypeOf(entityView.kind)}
      name={entityView.name}
      badges={[KIND_LABEL[entityView.kind], ...(entityView.nameRu ? [entityView.nameRu] : [])]}
      origin={entityView.source.kind === 'campaign' ? 'dm' : 'canon'}
      {...(entityPlace ? { tabs: PLACE_TABS, activeTab: tab, onTab: setTab } : {})}
      overlay
      dmView={dmView}
      className="max-h-full"
    >
      {(current: string) => (entityPlace && current === TAB_NOW.id && scene
        ? <SceneView scene={scene} onOpen={r => { setCardOverlay(false); openEntity(r); }} loading={sceneLoading} />
        : <>{orgLine(entityView, r => { setCardOverlay(false); openEntity(r); })}<EntityViewBody view={shownEntity as EntityView} onOpen={r => { setCardOverlay(false); openEntity(r); }} factAction={factAction(entityView)} /></>)}
    </EntityCard>
  ) : faction ? (
    <EntityCard {...factionCardProps(faction, { pending: pendingIds.has(faction.id) })} overlay activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full">
      {(current: string) => (current === 'overview' ? <FactionOverview faction={faction} factions={state.world.factions} pending={dmView ? pendingFor(state, faction.id) : []} onOpenEntity={r => { setCardOverlay(false); openEntity(r); }} onRenown={dmView ? step => api.propose(renownDelta(state, faction.id, step)) : undefined} /> : null)}
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
    <Dialog.Root open onOpenChange={o => { if (!o) setCompareOpen(false); }}>
      <Dialog.Portal container={mainRef.current ?? undefined}>
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
    <Dialog.Root open onOpenChange={o => { if (!o) setCardOverlay(false); }}>
      <Dialog.Portal container={mainRef.current ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        {/* Имя диалога — из Title (Radix ставит aria-labelledby сам): «Bo Tambernack: карточка». */}
        <Dialog.Content aria-describedby={undefined} className="absolute top-6 left-1/2 -translate-x-1/2 z-30 max-h-[calc(100%-48px)] flex outline-none">
          <Dialog.Title className="sr-only">{`${overlayName}: карточка`}</Dialog.Title>
          {overlayCard}
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
    <Dialog.Root open onOpenChange={o => { if (!o) setEditorOpen(false); }}>
      <Dialog.Portal container={mainRef.current ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        <Dialog.Content aria-describedby={undefined} className="absolute inset-4 z-30 flex justify-center outline-none focus-visible:shadow-none">
          <Dialog.Title className="sr-only">Новый персонаж</Dialog.Title>
          <CharacterEditor takenIds={new Set(Object.keys(state.actors))} onCreate={onCreatePc} onClose={() => setEditorOpen(false)} era={eraOf(harptos(state.time.sec).year)} />
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
          onDamage={n => api.damage(actor.id, n)}
          onHeal={n => api.heal(actor.id, n)}
          onTempHp={n => api.tempHp(actor.id, n)}
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
      {saveFailed && !past && !playersView ? (
        // Квота браузера кончилась (И2, 30.10.2026): сессия живёт только в памяти — перезагрузка её потеряет.
        <div role="alert" data-part="save-failed" className="flex-none flex items-center gap-3 px-4 py-1.5 bg-cd shadow-[inset_0_-2px_0_var(--st-conflict)] type-body-sm text-tx">
          <span>Журнал больше не сохраняется в браузере: место кончилось или запись запрещена. Перезагрузка вкладки потеряет сессию — сохраните её файлом.</span>
          <button type="button" onClick={onExport} className="ml-auto type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)]">Сохранить файлом</button>
        </div>
      ) : null}
      <ClockBar
        railParty={railParty}
        state={state}
        encounter={encounter}
        phase={phase}
        narrow={narrow}
        weather={weather}
        moon={moon}
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
        onRest={onRest}
        tempo={tempo}
        setTempoChoice={setTempoChoice}
        onStep={onStep}
        setPlayersView={setPlayersView}
      />

      <div className="relative flex-1 min-h-0 flex">
        <PartyPanel
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
          railParty={railParty}
          setRailParty={setRailParty}
          openRail={openRail}
          setOpenRail={setOpenRail}
          onSupply={(reason, amount) => { api.changeSupply(reason, amount); }}
        />

        {/* Popover.Root — вокруг всей главной зоны: якорь один, но живёт то в карточке, то на токене. */}
        <Popover.Root key={actor?.id ?? 'none'} open={popoverOpen} onOpenChange={setPopoverOpen}>
          {anchor === 'token' ? <Popover.Anchor virtualRef={tokenAnchor} /> : null}
          {shownView === 'time' ? (
            <TimeView
              sec={state.time.sec}
              partyDeities={new Set(partyGods ? partyGods.split(',') : [])}
              mainRef={mainRef}
              dmView={dmView}
              phase={phase}
              moon={moon}
              tempo={tempo}
              lastStep={lastStep}
              stepDeltas={stepDeltas}
              scaleLabel={scaleLabel}
              decide={decide}
              api={api}
              {...(dmView ? { onGoTo: goToDay } : {})}
            />
          ) : shownView === 'pulse' ? (
            <PulseView
              state={state} mainRef={mainRef} onOpenEntity={openEntity} tensions={tensions} onThread={t => api.propose(tensionThreadDelta(state, t))}
              branches={<BranchPanel main={state} branches={branchApi.branches} onOpen={branchApi.open} onKeep={branchApi.keep} onDrop={branchApi.drop} fresh={branchApi.fresh} />}
            />
          ) : shownView === 'chrono' ? (
            <ChronologyView
              mainRef={mainRef}
              campaignYear={campaignYear}
              year={lens ?? campaignYear}
              onYear={y => setLens(y === campaignYear ? null : y)}
              onOpenEntity={openEntity}
              onShowMap={() => setView('desk')}
            />
          ) : shownView === 'notebook' ? (
            <NotebookView mainRef={mainRef} state={state} onOpen={openEntity} />
          ) : shownView === 'journal' ? (
            <JournalView
              mainRef={mainRef}
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
            <section aria-label={ladder.level === 'battle' && combat ? 'Поле боя' : 'Мир'} ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col">
              <ScaleLadder steps={steps} current={ladder.level} onSelect={lvl => goLadder(jumpTo(state, ladder, lvl))} className="flex-none" />
              <div className={HEAD}>
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
                    <span data-part="level">{SCALE_LABELS[ladder.level]}{focus ? ` · ${focus.name}` : ''}</span>
                    {dmView ? <span className="type-key text-t2 normal-case" data-part="level-tempo" title="Темп часов на этом уровне">темп: {SCALE_TEMPO_LABELS[ladder.level]}</span> : null}
                    {chosenPlace ? <span className="type-key text-t2 normal-case" data-part="chosen" title="Место пути ниже: туда спустится ]">выбрано: {chosenPlace.name}</span> : null}
                  </>
                )}
                {dmView || combat || card ? (
                  <div className="ml-auto flex items-center gap-1">
                    {card ? (
                      // Подсказка клавиши — только мастеру: на столе игроков подсказок нет (F8).
                      <button type="button" title={`Развернуть карточку: ${overlayName ?? ''} в две колонки поверх стола${dmView ? ' · Esc закрывает' : ''}`} onClick={() => setCardOverlay(true)} className={BTN}>Развернуть</button>
                    ) : null}
                    {dmView ? (
                      <Popover.Root open={spawnOpen} onOpenChange={o => { setSpawnOpen(o); if (!o) setSpawnPick(undefined); }}>
                        <Popover.Trigger asChild>
                          <button type="button" title="Добавить противника из блока SRD; в бою — сразу в порядок инициативы" className={BTN}>Добавить</button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Добавить противника" className="z-20 outline-none">
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
                <div className="flex-1 min-h-0 flex items-start gap-4 p-4 overflow-auto">
                  <BattleGrid
                    cols={field.cols}
                    rows={field.rows}
                    cell={BATTLE_CELL}
                    tokens={tokens}
                    walls={field.walls}
                    cone={field.cone}
                    affected={field.affected}
                    activeId={activeId}
                    selectedId={selectedId}
                    onSelect={openFromToken(mainRef)}
                    className="flex-none"
                  />
                  {cardInCombat ? card : null}
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
                  journey={journeyReady ? journey : undefined}
                  onTravel={onTravel}
                  goLadder={goLadder}
                  onPin={id => goLadder(selectPlace(state, ladder, id))}
                  onNewPlace={(d, parent) => map && api.propose(newPlaceDelta(state, { ...d, map: map.passport.id }, parent))}
                  tensions={tensions}
                  influence={tensionData?.influence}
                  stacks={levelStacks}
                  card={card}
                />
              )}
              {cardOverlayDialog}
              {compareDialog}
              {editorDialog}
            </section>
          )}
          {hpPopover}
        </Popover.Root>

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
          onExport={onExport}
          onImport={onImport}
          note={note}
          setNote={setNote}
          toast={toast}
          shownRoll={shownRoll}
          setClosedRollId={setClosedRollId}
          hiddenRolls={hiddenRolls}
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
            onNextTurn={dmView ? () => { api.nextTurn(); regainLegendary(store.getState()); } : undefined}
            onEnd={dmView ? () => api.endEncounter() : undefined}
            onLegendarySpend={dmView ? spendLegendary : undefined}
            onLegendaryRestore={dmView ? restoreLegendary : undefined}
          />
        </div>
      ) : null}
    </main>
    </PlayerFrame>
    </OpenEntityContext.Provider>
  );
}

export default DeskPage;
