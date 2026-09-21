/**
 * DM Cockpit — типы компонентов. Документация, не проверка типов.
 * Глобальная переменная бандла: window.DMCockpit.
 */

export type EntityType =
  | 'pc' | 'npc' | 'monster' | 'item'
  | 'location' | 'faction' | 'plane' | 'planet' | 'deity' | 'event';

export type IconName = string; // DMCockpit.icons — полный список имён

export type Origin = 'canon' | 'dm' | 'sim' | 'players';

export interface PixelIconProps {
  /** Имя из DMCockpit.icons. Сетка 16x16, четыре тона. */
  name: IconName;
  /** 16, 32 или 48 — точные кратности сетки; 24 допустимо для декоративной иконки в строке. */
  size?: 16 | 24 | 32 | 48;
  /**
   * Перекрасить иконку от произвольного цвета или токена: тени, полутень, база и блик
   * считаются от него через color-mix. Без него берётся своя палитра иконки (DMCockpit.IPAL).
   */
  color?: string;
  /** Заменить только самый светлый тон — блик. Работает и со своей палитрой, и с перекраской. */
  accent?: string;
  /** Текст тултипа и aria-label. Обязателен, если иконка без подписи. */
  title?: string;
}

export interface PanelProps {
  title?: string;
  icon?: IconName;
  /** Горячая клавиша, показывается справа в шапке. */
  hotkey?: string;
  active?: boolean;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export interface StatTileProps {
  label: string;
  /** Модификатор; выводится со знаком. */
  mod: number;
  /** Значение характеристики, если плитка — характеристика. */
  score?: number;
  /** Задаёт цвет верхней грани: str | dex | con | int | wis | cha. */
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  /** Владение: золотая грань плюс квадратная метка. */
  owned?: boolean;
  onRoll?: () => void;
  title?: string;
}

export interface Condition {
  label: string;
  icon?: IconName;
  kind?: 'debuff' | 'buff' | 'conc';
  timer?: string;
}

export interface PC {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  temp?: number;
  ac: number;
  pp: number;
  conditions?: Condition[];
  concentration?: string;
  concentrationTimer?: string;
  saves?: number;
  fails?: number;
  /** Имя места, если PC отделился от партии. */
  away?: string;
  awayScale?: IconName;
}

export interface PartySpineProps { pc: PC; onOpen?: () => void; }

export interface HpBarProps {
  hp: number;
  maxHp: number;
  temp?: number;
  /** Показывать иконку сердца слева. */
  icon?: boolean;
  flash?: 'damage' | 'heal' | null;
  style?: React.CSSProperties;
}

export interface HpControlProps {
  name?: string;
  hp: number;
  maxHp: number;
  temp?: number;
  saves?: number;
  fails?: number;
  /** Строка сопротивлений и уязвимостей из карточки. */
  resist?: string;
  onApply?: (e: { delta: number; hp: number }) => void;
}

export interface EntityCardTab { id: string; label: string; icon?: IconName; title?: string; }

export interface EntityCardProps {
  type: EntityType;
  name: string;
  /** До трёх бейджей: уровень, CR, ранг, размер. */
  badges?: string[];
  /** Полоса ключевых показателей: три-четыре пары метка/значение. */
  stats?: Array<{ label: string; value: string; color?: string; title?: string }>;
  tabs?: EntityCardTab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  origin?: Origin;
  /** 720px в две колонки вместо 400px. */
  overlay?: boolean;
  selected?: boolean;
  /** Ждёт решения мастера: бирюзовое свечение. */
  pending?: boolean;
  beforeTabs?: React.ReactNode;
  /** Узел или функция (activeTab) => узел. */
  children?: React.ReactNode | ((tab: string) => React.ReactNode);
  style?: React.CSSProperties;
}

export interface Actor {
  name: string;
  init: number;
  hp: number;
  maxHp: number;
  type?: EntityType;
  legendary?: number;
}

export interface InitiativeTokenProps { actor: Actor; active?: boolean; onOpen?: () => void; }

export interface RollModalProps {
  label?: string;
  formula?: string;
  /** Выпавшие кости; первая — d20. */
  dice?: number[];
  mod?: number;
  crit?: boolean;
  fumble?: boolean;
  history?: Array<{ label: string; total: number; crit?: boolean }>;
}

export interface ScaleStep {
  id: string;
  label: string;
  icon: IconName;
  title: string;
  /** Темп часов на этом уровне: «дни», «раунд, 6 секунд». */
  tempo?: string;
}

export interface ScaleLadderProps {
  steps: ScaleStep[];
  current: string;
  onSelect?: (id: string) => void;
}

export interface TimeTempoProps {
  value?: 'round' | '10min' | 'hour' | 'day' | 'tenday' | 'season' | 'year';
  onChange?: (id: string) => void;
  onStep?: () => void;
}

export interface CelestialBarProps {
  moon?: 'moon-new' | 'moon-waxing' | 'moon-full' | 'moon-waning';
  moonLabel?: string;
  moonTitle?: string;
  next?: string;
  countdown?: string;
  /** Показывается, только если партия не на Материальном плане. */
  plane?: string;
}

export interface WorldDeltaProps {
  scaleIcon: IconName;
  scaleLabel: string;
  scaleTitle?: string;
  subject: string;
  was: string;
  now: string;
  why: string;
  chain?: string[];
  onAccept?: () => void;
  onEdit?: () => void;
  onReroll?: () => void;
  onReject?: () => void;
}

export interface JournalEntryProps {
  worldTime: string;
  realTime: string;
  icon?: IconName;
  iconColor?: string;
  iconTitle?: string;
  /** Текст по кускам: обычный, @упоминание, #нить. */
  parts?: Array<{ t: 'text' | 'mention' | 'tag'; v: string }>;
  text?: string;
  marks?: Array<{ name: IconName; color?: string; title?: string }>;
  secret?: boolean;
}

export interface MapPinProps {
  type: EntityType;
  label: string;
  /** false — секрет: пунктирная рамка и перечёркнутый глаз. */
  revealed?: boolean;
  count?: number;
}

/* --- Этап 2 ------------------------------------------------------------- */

export type ConditionId =
  | 'blinded' | 'charmed' | 'deafened' | 'frightened' | 'grappled'
  | 'incapacitated' | 'invisible' | 'paralyzed' | 'petrified' | 'poisoned'
  | 'prone' | 'restrained' | 'stunned' | 'unconscious' | 'exhaustion';

/** DMCockpit.conditions — пятнадцать состояний 5e с формулировками SRD. */
export interface ConditionDef {
  id: ConditionId;
  label: string;
  icon: IconName;
  /** Эффект состояния по 5e SRD; идёт в тултип. */
  tip: string;
}

export interface ConditionGridProps {
  active: ConditionId[];
  onToggle?: (id: ConditionId, on: boolean) => void;
  style?: React.CSSProperties;
}

export type SlotId =
  | 'head' | 'neck' | 'cloak' | 'armor' | 'hands'
  | 'ring' | 'belt' | 'feet' | 'weapon';

export interface PaperdollProps {
  /** Ключ отсутствует — слот пуст; пустой слот всё равно показывается. */
  items: Partial<Record<SlotId, { name: string; note?: string; rare?: boolean }>>;
  weapons?: Array<{ name: string; hit: string; dmg: string }>;
  /** Ячейки инвентаря; null — пустая. */
  inventory?: Array<{ name: string; icon?: IconName } | null>;
  onSlot?: (id: SlotId) => void;
  onAttack?: (weapon: { name: string; hit: string; dmg: string }) => void;
  style?: React.CSSProperties;
}

export interface BattleActor {
  id: string;
  name: string;
  type?: EntityType;
  /** Координаты в клетках по 5 футов, не в пикселях. */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  conditions?: ConditionId[];
}

export interface BattleGridProps {
  cols?: number;
  rows?: number;
  /** Сторона клетки в px; кратна 4, по умолчанию 48. */
  cell?: number;
  actors: BattleActor[];
  activeId?: string;
  /** Шаблон конуса: длина равна ширине дальнего края — по 5e SRD. */
  cone?: { x: number; y: number; dir?: 'e' | 'w' | 'n' | 's'; length: number };
  /** Кого задел шаблон — решает мастер, не сетка. */
  affected?: string[];
  walls?: Array<{ x: number; y: number; w?: number; h?: number }>;
  onSelect?: (id: string) => void;
  style?: React.CSSProperties;
}

export interface CardStackProps {
  title?: string;
  icon?: IconName;
  items: Array<{ name: string; type?: EntityType; hp?: number; maxHp?: number; badge?: string }>;
  onOpen?: (item: object) => void;
  style?: React.CSSProperties;
}

export interface GraphNodeProps {
  kind: 'faction' | 'plane' | 'deity';
  label: string;
  note?: string;
  title?: string;
  /** 0…100 — полоса влияния фракции. */
  value?: number;
  valueTitle?: string;
  /** Ранг божества пипками. */
  rank?: number;
  icon?: IconName;
  selected?: boolean;
  onOpen?: () => void;
  style?: React.CSSProperties;
}

export interface LayerTogglesProps {
  layers: Array<{ id: string; label: string; icon: IconName; hotkey?: string }>;
  active: string[];
  onToggle?: (id: string, on: boolean) => void;
  style?: React.CSSProperties;
}

export interface ToastProps {
  /** Пустой текст — компонент не рисуется. */
  text?: string;
  icon?: IconName;
  /** Без onUndo кнопки отмены нет (пустое состояние входящих). */
  onUndo?: () => void;
}

/* --- Этап 3 ------------------------------------------------------------- */

/** DMCockpit.outerPlanes — порядок массива = положение на кольце, индекс 0 сверху. */
export interface OuterPlane {
  id: string;
  label: string;
  /** Сектор кольца: верх — good, право — chaos, низ — evil, лево — law. */
  align: 'good' | 'chaos' | 'evil' | 'law';
  /** Имя божества, чьё владение здесь; рисуется значком белого золота. */
  deity?: string;
}

export interface PlaneWheelProps {
  current?: string;
  onSelect?: (id: string, item: { label: string }) => void;
  size?: number;
  rOuter?: number;
  rInner?: number;
  style?: React.CSSProperties;
}

/** DMCockpit.realmspace — тела системы; r и size в пикселях при size = 560. */
export interface CelestialBody {
  id: string;
  label: string;
  r: number;
  size: number;
  color: string;
  /** Период обращения в днях; 0 — центр системы. */
  period: number;
  moon?: boolean;
}

export interface OrreryProps {
  /** День, от которого считаются углы всех тел. */
  day?: number;
  /** Без onDay ползунка нет и планетарий становится статикой. */
  onDay?: (day: number) => void;
  current?: string;
  /** Пара идентификаторов: между ними проводится пунктир соединения. */
  conjunction?: [string, string];
  size?: number;
  style?: React.CSSProperties;
}

export interface Continent { id: string; label: string; lon: [number, number]; lat: [number, number]; }

/** Маска планеты: равнопромежуточная сетка w×h, строка — широта от +90 к −90, столбец — долгота от 0 к 360.
 *  Клетка — один символ: o океан, i лёд, u не нанесено, d пустыня и степь, g равнина, f лес, m горы.
 *  Готовые маски — design/masks/*.json, в бандле — DMCockpit.masks.toril и .planetos. */
export interface PlanetMask {
  w: number; h: number;
  label: string; note?: string;
  regions?: Continent[];
  /** RLE «буква класса + длина». grid — та же сетка развёрнутой строкой w·h символов или массивом
   *  из h строк (так лежит в design/masks/*.json); decodeMask склеивает массив и кэширует строкой. */
  rle?: string; grid?: string | string[];
}

export interface GlobeProps {
  /** Ключ из DMCockpit.masks или своя маска. Без неё — процедурная заглушка CONTINENTS. */
  mask?: 'toril' | 'planetos' | PlanetMask;
  mode?: 'sphere' | 'unwrap';
  /** Долгота в центре: вращение глобуса или сдвиг развёртки. */
  rot?: number;
  /** Долгота подсолнечной точки; дальше 90° от неё — ночная сторона. */
  sun?: number;
  n?: number;
  cell?: number;
  markers?: Array<{ label: string; x: number; y: number; icon?: IconName; color?: string; title?: string }>;
  onContinent?: (continent: Continent | null, coords: { lon: number; lat: number }) => void;
  style?: React.CSSProperties;
}

export interface HexMapProps {
  cols?: number;
  rows?: number;
  hexW?: number;
  hexH?: number;
  /** forest | hills | water | road | null — цвет заливки гекса. */
  terrain?: (row: number, col: number) => string | null;
  /** Туман знаний; приходит из модели знаний, карта его не считает. */
  fog?: Array<{ x: number | string; y: number | string; w: number | string; h: number | string }>;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export interface ChangeSummaryProps {
  groups: Array<{
    id: string;
    icon: IconName;
    label: string;
    collapsed?: boolean;
    items: Array<{ subject: string; was: string; now: string; why?: string }>;
  }>;
  onAcceptAll?: (groupId: string) => void;
  style?: React.CSSProperties;
}

/* --- Этап 4 ------------------------------------------------------------- */

export interface CalendarEvent {
  /** День календаря; лента раскладывает события по нему. */
  day: number;
  label: string;
  icon: IconName;
  /** celestial — цветом планов, deadline — фиолетовым, holiday — пергаментным, quest — золотом. */
  kind: 'celestial' | 'deadline' | 'holiday' | 'quest';
  note?: string;
}

export interface CalendarRibbonProps {
  from: number;
  to: number;
  today: number;
  events: CalendarEvent[];
  onSelect?: (e: CalendarEvent) => void;
  style?: React.CSSProperties;
}

export interface PriceIndexProps {
  goods: string[];
  /** values — индексы, где 100 это базовая цена по SRD. */
  rows: Array<{ settlement: string; values: number[]; route: 'safe' | 'risk' | 'cut' }>;
  style?: React.CSSProperties;
}

export interface EncounterWeightsProps {
  regions: Array<{
    name: string;
    icon?: IconName;
    /** Условие, при котором веса верны: «ночь · полнолуние через 3 дня». */
    note?: string;
    rows: Array<{
      label: string;
      icon?: IconName;
      weight: number;
      /** Множитель от события; показывается как «3×2», а не произведением. */
      mult?: number;
      /** Предложено симуляцией и ждёт решения мастера. */
      pending?: boolean;
    }>;
  }>;
  style?: React.CSSProperties;
}

export interface ThreadFilterProps {
  threads: Array<{ id: string; label: string; color: string }>;
  scales: Array<{ id: string; label: string; icon: IconName }>;
  /** Пустой массив значит «все», а не «ничего». */
  activeThreads: string[];
  activeScales: string[];
  onThread?: (id: string, on: boolean) => void;
  onScale?: (id: string, on: boolean) => void;
  style?: React.CSSProperties;
}

export interface PlayerFrameProps {
  /** При false компонент возвращает содержимое без обёртки. */
  on: boolean;
  label?: string;
  /** Рамка только обозначает режим; фильтрацию делает модель. */
  children?: React.ReactNode;
}

export interface IconRailProps {
  items: Array<{ id: string; icon: IconName; label: string; hotkey?: string; badge?: number }>;
  active?: string;
  onSelect?: (id: string) => void;
  style?: React.CSSProperties;
}
