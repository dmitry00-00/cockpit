// Карточка сущности: одна анатомия на одиннадцать типов (F3) — корешок 40px, полоса ключевых
// показателей, вкладки, тело. Тип задаёт грань и иконку вместе, через одну карту ENTITY: цвет никогда
// не единственный носитель смысла. Карточка ничего не хранит и в стор не ходит — всё содержимое приходит
// пропсами; проекция актёра в пропсы (actorCardProps) лежит рядом, чтобы корешок партии и карточка
// красили одни и те же числа одинаково; места и фракции (placeCardProps, factionCardProps) — там же:
// выше региона лестница показывает карточки, а не карты (шаг 10). Оверлей 720px — единственная поверхность с бронзовой рамкой;
// Dialog вокруг него ставит страница (карточка принимает ref и лишние атрибуты — годится под asChild).
import { Tabs } from 'radix-ui';
import { useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import type { Actor, Faction, Location, ScaleLevel } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { classById, raceById } from '../rules/compendium';
import { MONSTERS } from '../rules/srd';
import './EntityCard.css';
import { hpLevel, hpText, type HpLevel } from './HpBar';
import { SCALE_LABELS } from './scales';
import { signedMod } from './StatTile';

export type EntityType =
  | 'pc' | 'npc' | 'monster' | 'item'
  | 'location' | 'faction' | 'plane' | 'planet' | 'deity' | 'event'
  /** Запись правил и компендиума: заклинание, состояние, черта, умение, раса, класс, навык (ROADMAP 0.3). */
  | 'rule';

export type Origin = 'canon' | 'dm' | 'sim' | 'players';

/**
 * Тип → иконка, цвет грани и подпись, всегда вместе (HANDOFF §5 F3). Цветовой токен локации — ent-loc,
 * иконка — ent-location; план и планета делят звёздный ent-plane, иконки — из лестницы масштабов.
 * Строки теней полные: Tailwind ищет их в исходнике.
 */
export const ENTITY: Readonly<Record<EntityType, { icon: IconName; label: string; color: string; edge: string }>> = {
  pc: { icon: 'ent-pc', label: 'Персонаж игрока', color: 'var(--ent-pc)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-pc)]' },
  npc: { icon: 'ent-npc', label: 'Персонаж мастера', color: 'var(--ent-npc)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-npc)]' },
  monster: { icon: 'ent-monster', label: 'Чудовище', color: 'var(--ent-monster)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-monster)]' },
  item: { icon: 'ent-item', label: 'Предмет', color: 'var(--ent-item)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-item)]' },
  location: { icon: 'ent-location', label: 'Место', color: 'var(--ent-loc)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-loc)]' },
  faction: { icon: 'ent-faction', label: 'Фракция', color: 'var(--ent-faction)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-faction)]' },
  plane: { icon: 'scale-plane', label: 'План', color: 'var(--ent-plane)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-plane)]' },
  planet: { icon: 'scale-planet', label: 'Планета', color: 'var(--ent-plane)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-plane)]' },
  deity: { icon: 'ent-deity', label: 'Божество', color: 'var(--ent-deity)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-deity)]' },
  event: { icon: 'ent-event', label: 'Событие', color: 'var(--ent-event)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-event)]' },
  rule: { icon: 'src-canon', label: 'Правило', color: 'var(--ent-rule)', edge: 'shadow-[var(--plate),inset_3px_0_0_var(--ent-rule)]' },
};

/** Метка происхождения: иконка src-* тем же цветом, подпись — в title. */
export const ORIGIN: Readonly<Record<Origin, { icon: IconName; label: string; color: string }>> = {
  canon: { icon: 'src-canon', label: 'Канон', color: 'var(--src-canon)' },
  dm: { icon: 'src-dm', label: 'Внесено мастером', color: 'var(--src-dm)' },
  sim: { icon: 'src-sim', label: 'Симуляция, ждёт решения', color: 'var(--src-sim)' },
  players: { icon: 'src-players', label: 'Известно игрокам', color: 'var(--src-players)' },
};

export interface EntityCardTab {
  id: string;
  /** Подпись как говорят за столом («Обзор», «Снаряжение»); заглавные даёт CSS. */
  label: string;
  icon?: IconName;
  title?: string;
  /** Только мастеру: без dmView вкладки нет в DOM (шаг 9 требует отсутствия, не скрытия). */
  dm?: boolean;
}

/** Цвет значения в полосе показателей — только текстовый токен. Уровень хитов — не цветом текста, а меткой (mark). */
export type StatTone = 'tx' | 'gd' | 't2';

export interface EntityStat {
  label: string;
  value: string;
  tone?: StatTone;
  /**
   * Квадратная метка цвета порога полосы рядом с числом: hp-* — токены заливки, текстом их ставить
   * нельзя (usage ab-str: «как текст не использовать», 2.4:1 на плите). Число остаётся tx.
   */
  mark?: HpLevel;
  title?: string;
  /** Есть колбэк — ячейка кнопка (клик по HP открывает попап хитов); нет — просто ячейка. */
  onClick?: () => void;
}

export interface EntityCardProps extends Omit<ComponentPropsWithRef<'section'>, 'children'> {
  type: EntityType;
  name: string;
  /** До трёх бейджей: уровень, CR, ранг, размер. Первый — золотой. */
  badges?: readonly string[];
  /** Полоса ключевых показателей: три-четыре пары метка/значение. */
  stats?: readonly EntityStat[];
  tabs?: readonly EntityCardTab[];
  /** Активная вкладка — состояние страницы; без неё карточка держит своё. */
  activeTab?: string;
  onTab?: (id: string) => void;
  origin?: Origin;
  /** 720px в две колонки с бронзовой рамкой вместо 400px на фаске. */
  overlay?: boolean;
  selected?: boolean;
  /** Ждёт решения мастера: бирюзовое кольцо и пульс. */
  pending?: boolean;
  /** Стол мастера. В режиме «глазами игроков» — false, и вкладок с dm нет в DOM. */
  dmView?: boolean;
  beforeTabs?: ReactNode;
  /** Узел или функция от активной вкладки. */
  children?: ReactNode | ((tab: string) => ReactNode);
  /** Вторая колонка оверлея; без неё тело занимает обе. В одиночной карточке не рисуется. */
  aside?: ReactNode | ((tab: string) => ReactNode);
}

const TONE: Readonly<Record<StatTone, string>> = {
  tx: 'text-tx',
  gd: 'text-gd',
  t2: 'text-t2',
};

/** Метка порога — заливкой, как полоса; подпись в title, чтобы цвет не был единственным носителем. */
const MARK: Readonly<Record<HpLevel, { cls: string; label: string }>> = {
  high: { cls: 'bg-hp-high', label: 'хиты выше половины' },
  mid: { cls: 'bg-hp-mid', label: 'хиты ниже половины' },
  low: { cls: 'bg-hp-low', label: 'хиты ниже четверти' },
};

/**
 * Тень карточки по состоянию: фаска всегда, рамка — только у оверлея, кольцо — одно (ждёт решения
 * важнее выбора: симуляция не должна выглядеть свершившимся фактом). Шесть строк — все шесть сочетаний.
 */
export function cardShadow(overlay: boolean, selected: boolean, pending: boolean): string {
  if (overlay) {
    if (pending) return 'shadow-[var(--bevel),var(--frame),var(--glow-sim)]';
    if (selected) return 'shadow-[var(--bevel),var(--frame),var(--glow-gold)]';
    return 'shadow-[var(--bevel),var(--frame)]';
  }
  if (pending) return 'shadow-[var(--bevel),var(--glow-sim)]';
  if (selected) return 'shadow-[var(--bevel),var(--glow-gold)]';
  return 'shadow-bevel';
}

/** Вкладки, которые видны в этом режиме: dm-вкладки только на столе мастера. */
export function visibleTabs(tabs: readonly EntityCardTab[] | undefined, dmView: boolean): EntityCardTab[] {
  return (tabs ?? []).filter(t => !t.dm || dmView);
}

const TAB = [
  'type-h-15 uppercase text-t2 bg-cd px-2.5 py-1 flex items-center gap-1.5 cursor-pointer',
  'shadow-[inset_1px_1px_0_var(--hi),inset_-1px_0_0_var(--lo)] hover:text-tx',
  'data-[state=active]:text-gd-hi data-[state=active]:bg-pl data-[state=active]:shadow-[var(--bevel),inset_0_-3px_0_var(--gd)]',
  'focus-visible:shadow-[var(--bevel),var(--glow-gold)]',
].join(' ');

const STAT_CELL = 'min-w-0 flex flex-col items-center px-1 py-1 bg-linear-to-b from-pl to-cd shadow-bevel';

function renderBody(node: EntityCardProps['children'], tab: string | undefined): ReactNode {
  return typeof node === 'function' ? node(tab ?? '') : node;
}

export function EntityCard({
  type, name, badges, stats, tabs, activeTab, onTab, origin,
  overlay = false, selected = false, pending = false, dmView = false,
  beforeTabs, children, aside, className = '', ...rest
}: EntityCardProps) {
  const ent = ENTITY[type];
  const shown = visibleTabs(tabs, dmView);
  const [own, setOwn] = useState<string | undefined>(shown[0]?.id);
  // Хотим activeTab со страницы или своё; если этой вкладки сейчас нет (dm-вкладка ушла с режимом) — первая видимая.
  const wanted = activeTab ?? own;
  const current = shown.some(t => t.id === wanted) ? wanted : shown[0]?.id;
  const select = (id: string) => {
    setOwn(id);
    onTab?.(id);
  };

  const body = renderBody(children, current);
  const side = overlay ? renderBody(aside, current) : null;
  const bodyClass = overlay
    ? 'grid grid-cols-2 gap-8 p-6 min-h-0 overflow-auto'
    : 'flex flex-col gap-3 p-3 min-h-0 overflow-auto';
  const bodyInner = overlay ? (
    <>
      <div className={`flex flex-col gap-3 min-w-0 ${side == null ? 'col-span-2' : ''}`}>{body}</div>
      {side == null ? null : <div className="flex flex-col gap-3 min-w-0">{side}</div>}
    </>
  ) : body;

  const spine = (
    <div
      data-part="spine"
      className={`flex items-center flex-none bg-linear-to-b from-pl to-cd ${ent.edge} ${overlay ? 'gap-4 p-6' : 'gap-2 h-spine-h px-2'}`}
    >
      <Icon name={ent.icon} size={overlay ? 48 : 24} color={ent.color} title={ent.label} />
      <span className={`flex-1 min-w-0 truncate text-tx ${overlay ? 'type-h-28' : 'type-h-17'}`} title={name}>{name}</span>
      {(badges ?? []).slice(0, 3).map((b, i) => (
        <span
          key={`${i}:${b}`}
          data-part="badge"
          className={`type-key uppercase flex-none px-1 py-px shadow-bevel whitespace-nowrap ${i === 0 ? 'bg-pl text-gd' : 'bg-cd text-t2'}`}
        >
          {b}
        </span>
      ))}
      {origin ? <Icon name={ORIGIN[origin].icon} size={16} color={ORIGIN[origin].color} title={ORIGIN[origin].label} /> : null}
    </div>
  );

  const statsBar = stats && stats.length > 0 ? (
    <div data-part="stats" className="flex gap-px bg-lo py-px flex-none">
      {stats.map((s, i) => {
        // Хиты «41/49» вдвое длиннее прочих чисел: в полосе из пяти ячеек первая шире, иначе число упирается в грань.
        const grow = i === 0 && stats.length > 4 ? 'flex-[1.6]' : 'flex-1';
        const inner = (
          <>
            <span className="type-num-12 uppercase text-t2 truncate max-w-full">{s.label}</span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              {s.mark ? <span data-part="mark" role="img" aria-label={MARK[s.mark].label} title={MARK[s.mark].label} className={`size-2 flex-none ${MARK[s.mark].cls}`} /> : null}
              <span className={`type-num-24 [text-shadow:0_1px_0_var(--lo)] ${TONE[s.tone ?? 'tx']}`}>{s.value}</span>
            </span>
          </>
        );
        return s.onClick ? (
          <button
            key={s.label}
            type="button"
            title={s.title ?? s.label}
            onClick={s.onClick}
            className={`${STAT_CELL} ${grow} cursor-pointer hover:from-pl hover:to-pl active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]`}
          >
            {inner}
          </button>
        ) : (
          <div key={s.label} title={s.title ?? s.label} className={`${STAT_CELL} ${grow}`}>
            {inner}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <section
      aria-label={name}
      data-entity-type={type}
      data-pending={pending || undefined}
      data-selected={selected || undefined}
      className={`flex flex-col min-h-0 bg-cd ${overlay ? 'w-card-overlay' : 'w-card-single'} ${cardShadow(overlay, selected, pending)} ${pending ? 'card-pending' : ''} ${className}`}
      {...rest}
    >
      {spine}
      {statsBar}
      {beforeTabs ?? null}
      {shown.length > 0 && current !== undefined ? (
        <Tabs.Root value={current} onValueChange={select} className="flex flex-col min-h-0">
          <Tabs.List aria-label="Разделы карточки" className="flex gap-px bg-lo pt-px px-px flex-none">
            {shown.map(t => (
              <Tabs.Trigger key={t.id} value={t.id} title={t.title ?? t.label} className={TAB}>
                {t.icon ? <Icon name={t.icon} size={16} color="currentColor" title={t.label} /> : null}
                <span>{t.label}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {/* Одна панель на текущую вкладку: тело собирает страница по её id, остальных панелей нет. */}
          <Tabs.Content value={current} className={bodyClass}>
            {bodyInner}
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <div data-part="body" className={bodyClass}>{bodyInner}</div>
      )}
    </section>
  );
}

/* ---------- Проекция актёра в пропсы: корешок партии и карточка красят одно и то же ---------- */

export type ActorCardProps = Pick<EntityCardProps, 'type' | 'name' | 'badges' | 'stats' | 'tabs' | 'origin'>;

/** Вкладки карточки — один набор на всех: коды заглавными даёт CSS, здесь — как говорят за столом. */
export const TAB_OVERVIEW: EntityCardTab = { id: 'overview', label: 'Обзор', title: 'Характеристики, навыки, умения' };
export const TAB_CONDITIONS: EntityCardTab = { id: 'conditions', label: 'Состояния', title: 'Состояния SRD; истощение — уровнями' };
export const TAB_GEAR: EntityCardTab = { id: 'gear', label: 'Снаряжение', title: 'Экипировка' };
export const TAB_ACTIONS: EntityCardTab = { id: 'actions', label: 'Действия', title: 'Действия из блока SRD' };
export const TAB_DM: EntityCardTab = { id: 'dm', label: 'DM', title: 'Только мастеру', dm: true };

/** Ячейка HP: число всегда tx, порог полосы — меткой рядом; клик открывает попап хитов. */
export function hpStat(hp: Actor['hp'], onClick?: () => void): EntityStat {
  return { label: 'HP', value: hpText(hp), mark: hpLevel(hp.current, hp.max), title: 'Хиты', onClick };
}

export interface ActorCardOptions {
  /** Клик по ячейке HP. */
  onHp?: () => void;
  /** Сколько у актёра секретов мастера: вкладка DM появляется только при них — пустая секция не показывается. */
  dmFacts?: number;
  /** Модификатор инициативы листа — ячейка ИНИЦ; не передан — ячейки нет. */
  initiative?: number;
  /** Кости хитов листа (класс SRD) — ячейка КХ «4/5»; у класса из книги костей нет — ячейки нет. */
  hitDice?: { available: number; total: number; die: number };
}

/**
 * Актёр → корешок, полоса и вкладки. HP всегда первая ячейка — она одна и та же у всех и кликабельна.
 * PC — как ряд медальонов бумажной карточки: HP · AC · ИНИЦ · PP · КХ (бонус мастерства — в шапке навыков,
 * «Владение +N»; раса — в шапке листа, третий бейдж обрезал имя); монстр: CR и размер из блока SRD, HP · AC · SPD.
 * Вкладок без данных нет: снаряжение — только при листе, DM — только при секретах. Тела вкладок собирает
 * страница — карточка знает только их коды.
 */
export function actorCardProps(actor: Actor, opts: ActorCardOptions = {}): ActorCardProps {
  const { onHp, dmFacts = 0, initiative, hitDice } = opts;
  const dm = dmFacts > 0 ? [TAB_DM] : [];
  if (actor.kind === 'monster' && actor.monsterId) {
    const m = MONSTERS[actor.monsterId];
    return {
      type: 'monster',
      name: actor.name,
      badges: [`CR ${m.cr}`, m.size],
      stats: [
        hpStat(actor.hp, onHp),
        { label: 'AC', value: String(actor.ac), title: `Класс доспеха · ${m.ac.source}` },
        { label: 'SPD', value: String(m.speed), title: 'Скорость, футов' },
      ],
      tabs: [TAB_OVERVIEW, TAB_ACTIONS, TAB_CONDITIONS, ...dm],
      origin: 'canon',
    };
  }
  const sheet = actor.sheet;
  const badges: string[] = [];
  if (sheet) badges.push(`${sheet.level} ур.`, classById(sheet.classId)?.nameRu ?? sheet.classId);
  const stats: EntityStat[] = [
    hpStat(actor.hp, onHp),
    { label: 'AC', value: String(actor.ac), title: 'Класс доспеха' },
    { label: 'PP', value: String(actor.passivePerception), title: 'Пассивная внимательность' },
  ];
  if (initiative !== undefined) stats.splice(2, 0, { label: 'ИНИЦ', value: signedMod(initiative), title: 'Инициатива: d20 + модификатор DEX' });
  if (hitDice) stats.push({ label: 'КХ', value: `${hitDice.available}/${hitDice.total}`, title: `Кости хитов d${hitDice.die}: осталось ${hitDice.available} из ${hitDice.total}` });
  return {
    type: actor.kind === 'pc' ? 'pc' : 'npc',
    name: actor.name,
    badges,
    stats,
    tabs: sheet ? [TAB_OVERVIEW, TAB_CONDITIONS, TAB_GEAR, ...dm] : [TAB_OVERVIEW, TAB_CONDITIONS, ...dm],
    origin: 'dm',
  };
}

/** Раса персонажа по-русски — для обзора, не для корешка. */
export function raceLabel(sheet: NonNullable<Actor['sheet']>): string {
  const race = raceById(sheet.raceId);
  const sub = race?.subraces.find(x => x.id === sheet.subraceId);
  return sub ? `${race?.nameRu ?? sheet.raceId} · ${sub.nameRu}` : race?.nameRu ?? sheet.raceId;
}

/* ---------- Проекция места и фракции: лестница выше региона показывает карточки (шаг 10) ---------- */

export type PlaceCardProps = Pick<EntityCardProps, 'type' | 'name' | 'badges' | 'stats' | 'tabs' | 'origin' | 'pending'>;

export interface PlaceCardOptions {
  /** Предложение симуляции целится в это место и ждёт решения — кольцо glow-sim (CLAUDE.md: «затронутые карточка и пин пульсируют»). */
  pending?: boolean;
  /** Секретов мастера о месте; вкладка DM — только при > 0 (пустая секция не показывается). */
  dmFacts?: number;
}

/** Тип карточки по уровню: космология и план — plane, система и планета — planet, остальное — location. */
export function placeEntityType(scale: ScaleLevel): EntityType {
  if (scale === 'cosmology' || scale === 'plane') return 'plane';
  if (scale === 'system' || scale === 'planet') return 'planet';
  return 'location';
}

/** 23000 → «23k», 1500 → «1.5k», 800 → «800» (§13 пишет «23k»): до тысячи — как есть, дальше — тысячи с одним знаком, «.0» не пишется. */
export function populationLabel(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** Опасность места для партии — словом, как в шапке региона. */
export const DANGER_LABELS: Readonly<Record<'low' | 'medium' | 'high', string>> = { low: 'низкая', medium: 'средняя', high: 'высокая' };

/** +10 → «+10%», −5 → «−5%» (минус типографский U+2212, как у модификаторов), 0 → «базовые» — так пишет и дельта цен §13. */
export function priceLabel(percent: number): string {
  return percent === 0 ? 'базовые' : `${signedMod(percent)}%`;
}

/**
 * Место → корешок, полоса и вкладки. Бейдж — уровень лестницы; в полосе только то, что у места есть,
 * в порядке население · опасность · цены; нет ничего — полосы нет (undefined, не пустой массив: карточка
 * рисует полосу по длине). DM — только при секретах. Место — канон сеттинга, пока мастер его не правил.
 */
export function placeCardProps(place: Location, opts: PlaceCardOptions = {}): PlaceCardProps {
  const { pending, dmFacts = 0 } = opts;
  const stats: EntityStat[] = [];
  if (place.population !== undefined) stats.push({ label: 'Население', value: populationLabel(place.population), title: 'Население' });
  if (place.danger !== undefined) stats.push({ label: 'Опасность', value: DANGER_LABELS[place.danger], title: 'Опасность для партии' });
  if (place.pricePercent !== undefined) stats.push({ label: 'Цены', value: priceLabel(place.pricePercent), title: 'Надбавка к ценам' });
  return {
    type: placeEntityType(place.scale),
    name: place.name,
    badges: [SCALE_LABELS[place.scale]],
    stats: stats.length > 0 ? stats : undefined,
    tabs: dmFacts > 0 ? [TAB_OVERVIEW, TAB_DM] : [TAB_OVERVIEW],
    origin: 'canon',
    pending,
  };
}

/**
 * Фракция → корешок и полоса: влияние и тренд — если известны, известность партии — всегда (у фракции она
 * есть по устройству). Тренд — со знаком, как модификатор; ноль — «0», не «+0». Бейджей у фракции нет.
 */
export function factionCardProps(faction: Faction, opts: { pending?: boolean } = {}): PlaceCardProps {
  const stats: EntityStat[] = [];
  if (faction.influencePercent !== undefined) stats.push({ label: 'Влияние', value: `${faction.influencePercent}%`, title: 'Влияние фракции' });
  if (faction.trend !== undefined) stats.push({ label: 'Тренд', value: faction.trend === 0 ? '0' : signedMod(faction.trend), title: 'Тренд влияния за десятидневку' });
  stats.push({ label: 'Известность', value: String(faction.renown), title: 'Известность партии у фракции' });
  return {
    type: 'faction',
    name: faction.name,
    stats,
    tabs: [TAB_OVERVIEW],
    origin: 'canon',
    pending: opts.pending,
  };
}
