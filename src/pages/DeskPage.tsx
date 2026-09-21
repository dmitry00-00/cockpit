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
import { Dialog, Popover, ToggleGroup } from 'radix-ui';
import './DeskPage.css';
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  NEAR_SCALES, abilityMod, conModOf, currentOrder, dayPhase, encounterCandidates, formatHarptos, hitDiceOf, inDays, initiativeMod, moonState, nextFestival, placeChain,
  pcActor, placedActors, poolLabel, resourcePoolsOf, restCandidates, restResourcesOf, seedBattlefield, seedEngine, seedState, sortInitiative, spawnMonsters, srdClassOf, stepTime,
  suggestMonsterName, takeRest, weatherLabel, weatherOf,
  type PcSpec, type Sky,
} from '../campaign';
import {
  BattleGrid, CardStack, CelestialBar, ChangeSummary, ConcentrationForm, ConditionChip, ConditionGrid, DayPhaseStrip, EntityCard, HpControl, InitiativeBar,
  IconRail, InitiativeEditor, JournalCascade, JournalEntry, JournalReminder, Paperdoll, PartySpine, PlayerFrame, ResourcePips, RestForm, RollModal, ScaleLadder, SpawnForm, StatTile,
  ThreadCard, ThreadFilter, TimeTempo, WorldDelta,
  CONCENTRATION_DURATIONS, DAY_PHASE_ICONS, DAY_PHASE_LABELS, MOON_ICONS, MOON_LABELS, SCALE_LABELS, SCALE_TEMPO_LABELS, TAB_OVERVIEW, TEMPO_LABELS,
  actorCardProps, battleTokenOf, chipsOf, exhaustionCommand, factionCardProps, initiativeFormula, initiativeTokenOf, lastDamageOf, lastRollOf, placeCardProps,
  placeEntityType, raceLabel, rollHistoryOf, signedMod, stackItemOf, summaryGroups, toggleCommand, toggleIn, worldDeltaProps,
  SKILL_LABEL, SKILLS_BY_ABILITY,
  type CardStackItem, type IconRailItem, type InitiativeBarEntry, type InitiativeRow, type JournalEntryProps, type MoonPhase, type RestRow, type ScaleStep, type SlotId,
  type SlotItem, type SpawnOption, type ThreadCardRow,
} from '../components';
import {
  LEVEL_TEMPO, SCALE_LEVELS, cascadeOf, causeChain, childrenOf, createEngineStore, filterJournal, focusOf, initialLadder, journalEntries, journalParts, journalScales, jumpTo, ladderLevels,
  localStorageStore, memoryStore, parseLog, serializeLog,
  type EventStore,
  moveLevel, normalizeLadder, pendingFor, pendingTargets, placeCounts, plural, selectPlace, threadSummaries,
  type Actor, type Command, type EngineStoreApi, type EventType, type Faction, type InitiativeEntry, type JournalEntry as JournalRecord, type Ladder, type Location,
  type RestHitDice, type RestKind, type ScaleLevel, type State, type Tempo, type ThreadSummary,
} from '../engine';
import { useEngine, useHpFlashes, useUndoKeys } from '../engine/useEngine';
import { Icon, type IconName } from '../icons/Icon';
import { classById, raceById } from '../rules/compendium';
import { CharacterEditor } from './editor/CharacterEditor';
import {
  ABILITIES, ABILITY_IDS, ARMOR, CONDITIONS, MONSTER_IDS, MONSTERS, SHIELD, SKILLS, isArmorId,
  type AbilityId, type ConditionId, type MonsterId, type SkillId,
} from '../rules/srd';

/** Ключ лога в localStorage: сессия переживает перезагрузку, а тесты подставляют memoryStore. */
export const DESK_LOG_KEY = 'dm-cockpit:log';

/** Сколько последних записей журнала показывает правая колонка. */
export const JOURNAL_TAIL = 10;

/** Клетка боевой сетки на столе: 72px — как в F2, кратно 4; при 12 колонках сетка занимает 864px главной зоны. */
export const BATTLE_CELL = 72;

/**
 * Уже этой ширины — планшет (F9, 1366×1024): обе боковые панели свёрнуты в полосы 40px, главная зона занимает
 * всё, панель открывается оверлеем поверх неё; полоса часов — без года, подписей луны и слов у видов.
 */
export const NARROW_WIDTH = 1600;
export const NARROW_QUERY = `(max-width: ${NARROW_WIDTH - 1}px)`;

/** «15 Mirtul 1492 DR, 08:00» → «15 Mirtul, 08:00»: на узкой полосе часов год не помещается, а он один на кампанию. */
export function shortHarptos(sec: number): string {
  return formatHarptos(sec).replace(/ \d+ DR,/, ',');
}

/** Планшет ли сейчас — по matchMedia; без window (тесты движка) — нет. */
export function isNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
}

/**
 * Горячая клавиша стола — только когда фокус не в поле и не на кнопке: Space на кнопке нажимает её,
 * и ход бы ушёл дважды; в поле пробел — символ. Модификаторы не наши (Ctrl+Z — у useUndoKeys).
 */
export function isDeskHotkey(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>, code: string): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.code !== code) return false;
  const t = e.target instanceof Element ? e.target : null;
  return !t?.closest('input, textarea, select, button, a, [contenteditable], [role="dialog"]');
}

/** Иконка записи журнала по типу события — вместе с подписью, цвет — только там, где он уже что-то значит (урон, лечение, симуляция). */
export const ENTRY_ICON: Readonly<Record<EventType, { icon: IconName; title: string; color?: string }>> = {
  DAMAGE_APPLIED: { icon: 'attack', title: 'Урон', color: 'var(--fx-damage-hi)' },
  HEALING_APPLIED: { icon: 'hp', title: 'Лечение', color: 'var(--fx-heal-hi)' },
  TEMP_HP_GRANTED: { icon: 'hp', title: 'Временные хиты', color: 'var(--fx-temp)' },
  CONDITION_ADDED: { icon: 'pulse', title: 'Состояние' },
  CONDITION_REMOVED: { icon: 'check', title: 'Состояние снято' },
  DICE_ROLLED: { icon: 'dice', title: 'Бросок' },
  TURN_ADVANCED: { icon: 'initiative', title: 'Ход' },
  TIME_ADVANCED: { icon: 'tempo', title: 'Шаг времени' },
  WORLD_DELTA_ACCEPTED: { icon: 'src-sim', title: 'Принятое предложение', color: 'var(--src-sim)' },
  WORLD_DELTA_REJECTED: { icon: 'cross', title: 'Отклонённое предложение' },
  WORLD_DELTA_REROLLED: { icon: 'reroll', title: 'Переброс' },
  FACT_REVEALED: { icon: 'src-players', title: 'Открыто игрокам', color: 'var(--src-players)' },
  NOTE_ADDED: { icon: 'note', title: 'Заметка' },
  ENCOUNTER_STARTED: { icon: 'scale-battle', title: 'Бой' },
  ENCOUNTER_ENDED: { icon: 'scale-battle', title: 'Бой окончен' },
  INITIATIVE_SET: { icon: 'initiative', title: 'Порядок инициативы' },
  CONCENTRATION_STARTED: { icon: 'cond-concentration', title: 'Концентрация' },
  CONCENTRATION_ENDED: { icon: 'cond-concentration', title: 'Концентрация снята' },
  ACTOR_SPAWNED: { icon: 'move', title: 'Появился' },
  ACTOR_REMOVED: { icon: 'cross', title: 'Выбыл' },
  WORLD_DELTA_PROPOSED: { icon: 'src-sim', title: 'Предложение' },
  REST_TAKEN: { icon: 'night', title: 'Отдых' },
  RESOURCE_SPENT: { icon: 'spell', title: 'Ресурс потрачен' },
  RESOURCE_RESTORED: { icon: 'spell', title: 'Ресурс возвращён' },
};

/** «15 Mirtul 1492 DR, 08:00» → дата «15 Mirtul» и время «08:00»: журналу год не нужен, он один на кампанию. */
export function splitHarptos(sec: number): { date: string; time: string } {
  const [date, time = ''] = formatHarptos(sec).split(', ');
  return { date: date.replace(/ \d+ DR$/, ''), time };
}

/** Реальное время записи — часы:минуты по стене; у записей сида (at = 0) его нет. */
export function wallTimeOf(at: number): string | undefined {
  if (at <= 0) return undefined;
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Запись журнала → пропсы компонента: время, иконка по типу, текст по кускам с упоминаниями и нитями. */
export function journalEntryProps(entry: JournalRecord, state: State): Omit<JournalEntryProps, 'onMention' | 'onThread' | 'className'> {
  const { date, time } = splitHarptos(entry.worldSec);
  const ic = ENTRY_ICON[entry.type];
  return {
    id: entry.id,
    worldDate: date,
    worldTime: time,
    wallTime: wallTimeOf(entry.at),
    icon: ic.icon,
    iconColor: ic.color,
    iconTitle: ic.title,
    parts: journalParts(entry, state),
    origin: entry.origin,
    secret: entry.secret,
    undone: entry.undone,
    compensation: entry.compensation,
  };
}

const DAYS: readonly [string, string, string] = ['день', 'дня', 'дней'];

/** Строки карточки нити из сводки: срок, последняя запись, «без внимания», секреты, каскад. Пустого не рисуется. */
export function threadCardRows(t: ThreadSummary, dmView = true): ThreadCardRow[] {
  const rows: ThreadCardRow[] = [{ key: 'opened', label: `${t.openedDays} ${plural(t.openedDays, DAYS)}`, text: 'открыта', tone: 't2' }];
  if (t.last) rows.push({ key: 'last', label: 'сейчас', text: t.last.text });
  // «Без внимания» — планирование мастера, игрокам не показывается.
  if (dmView && t.idleDays >= 3) rows.push({ key: 'idle', label: `${t.idleDays} ${plural(t.idleDays, DAYS)}`, text: 'без внимания', tone: 'gd' });
  for (const f of t.secrets) rows.push({ key: `secret-${f.id}`, label: 'секрет', text: f.text, secret: true });
  if (t.cascade.length > 0) rows.push({ key: 'cascade', label: 'каскад', text: t.cascade.map(c => c.label).join(' → '), tone: 'sim' });
  return rows;
}

/* ---------- Подписи слоя вида — в components/labels.ts; SKILL_LABEL реэкспортируется для тестов стола ---------- */

export { SKILL_LABEL };

/** Формула броска d20 с модификатором: «1d20+3», «1d20-1», без модификатора — «1d20». */
export function d20Formula(mod: number): string {
  return mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : ''}${mod}`;
}

/** Секреты мастера о сущности (актёре, месте): факты `dm` с её subjectId. Ноль — вкладки DM нет (пустая секция не показывается). */
export function dmFactsAbout(subjectId: string, facts: State['facts']) {
  return Object.values(facts).filter(f => f.visibility === 'dm' && f.subjectId === subjectId);
}

export function dmFactsOf(actor: Actor, facts: State['facts']) {
  return dmFactsAbout(actor.id, facts);
}

export interface ConcentrationReminder {
  key: string;
  actorId: string;
  reason: 'unconscious' | 'expired';
  text: string;
}

/**
 * Концентрация, которую система не снимает сама, а предлагает снять (HANDOFF §7): актёр на нуле хитов
 * (без сознания — падает без спасброска) или срок заклинания вышел. Ключ — актёр, заклинание, срок:
 * «Позже» молчит ровно про это заклинание.
 */
export function concentrationRemindersOf(state: State): ConcentrationReminder[] {
  return Object.values(state.actors).flatMap((a): ConcentrationReminder[] => {
    const c = a.concentration;
    if (!c || a.removed) return [];
    const key = `${a.id}:${c.spell}:${c.untilSec ?? ''}`;
    if (a.hp.current === 0) return [{ key: `${key}:unconscious`, actorId: a.id, reason: 'unconscious', text: `${a.name} без сознания — концентрация ${c.spell} падает` }];
    if (c.untilSec !== undefined && c.untilSec <= state.time.sec) return [{ key: `${key}:expired`, actorId: a.id, reason: 'expired', text: `${a.name}: срок концентрации ${c.spell} вышел` }];
    return [];
  });
}

export interface ConditionReminder {
  key: string;
  actorId: string;
  conditionId: ConditionId;
  text: string;
}

/** Состояния со сроком в мировом времени, срок которых вышел: система предлагает снять, мастер решает (как с концентрацией). */
export function conditionRemindersOf(state: State): ConditionReminder[] {
  return Object.values(state.actors).flatMap((a): ConditionReminder[] => {
    if (a.removed) return [];
    return (Object.entries(a.conditions) as [ConditionId, { untilSec?: number } | undefined][])
      .filter(([, snap]) => snap?.untilSec !== undefined && snap.untilSec <= state.time.sec)
      .map(([id, snap]) => ({ key: `${a.id}:${id}:${snap!.untilSec}`, actorId: a.id, conditionId: id, text: `${a.name}: срок состояния «${CONDITIONS[id].label}» вышел` }));
  });
}

/** Что известно игрокам о сущности — открытые факты с её subjectId; видны на обоих столах. */
export function playerFactsAbout(subjectId: string, facts: State['facts']) {
  return Object.values(facts).filter(f => f.visibility === 'players' && f.subjectId === subjectId);
}

/**
 * Ступени лестницы: каждый уровень сеттинга (и бой, пока он идёт) с именем места пути на нём; уровень без
 * места на пути подписан именем уровня — крошка всё равно прыгает туда, куда найдётся спуск или подъём.
 */
export function ladderSteps(state: State, ladder: Ladder): ScaleStep[] {
  return ladderLevels(state).map(id => {
    const placeId = ladder.path[id];
    const place = placeId ? state.world.locations[placeId] : undefined;
    return { id, label: id === 'battle' ? SCALE_LABELS.battle : (place?.name ?? SCALE_LABELS[id]) };
  });
}

/**
 * Корешки «Здесь»: прямые дети фокуса — иконка уровня, бейдж — сколько о месте записей и фактов, выбран тот,
 * что на пути (ВЫБРАНО), пульс — цель ждущего предложения (только мастеру: симуляция игрокам не видна).
 */
export function hereItems(children: readonly Location[], ladder: Ladder, counts: ReadonlyMap<string, number>, pending: ReadonlySet<string>): CardStackItem[] {
  return children.map(l => ({
    id: l.id,
    name: l.name,
    type: placeEntityType(l.scale),
    icon: `scale-${l.scale}` as const,
    badge: counts.get(l.id) ? String(counts.get(l.id)) : undefined,
    selected: ladder.path[l.scale] === l.id,
    pending: pending.has(l.id),
  }));
}

/** Корешки держав на уровне континента: бейдж — влияние, пульс — цель ждущего предложения. */
export function factionItems(factions: readonly Faction[], pending: ReadonlySet<string>): CardStackItem[] {
  return factions.map(f => ({
    id: f.id,
    name: f.name,
    type: 'faction',
    badge: f.influencePercent !== undefined ? `${f.influencePercent}%` : undefined,
    pending: pending.has(f.id),
  }));
}

/** Доспех — в слот доспеха, щит — в слот кистей (решение ведущего для стола); остальные семь честно пусты. */
export function deskDollItems(sheet: Actor['sheet']): Partial<Record<SlotId, SlotItem>> {
  const out: Partial<Record<SlotId, SlotItem>> = {};
  if (!sheet) return out;
  if (sheet.armor && isArmorId(sheet.armor)) out.armor = { name: ARMOR[sheet.armor].name };
  if (sheet.shield) out.hands = { name: SHIELD.name, note: `AC +${SHIELD.acBonus}` };
  return out;
}

/** Текст умения класса по id из компендиума; у части умений он пуст — тогда имя без текста (ловушка импорта). */
/** Текст умения: у класса, затем у выбранного подкласса — id умений повторяются между подклассами (заклинания доменов), поэтому чужие подклассы не смотрим. */
function featureText(classId: string, featureId: string, subclassId?: string): string {
  const cls = classById(classId);
  if (!cls) return '';
  const own = cls.levels.flatMap(l => l.features).find(f => f.id === featureId);
  if (own) return own.text;
  return cls.subclasses.find(sc => sc.id === subclassId)?.features.find(f => f.id === featureId)?.text ?? '';
}

function traitText(raceId: string, subraceId: string | undefined, traitId: string): string {
  const race = raceById(raceId);
  if (!race) return '';
  const pool = [...race.traits, ...(race.subraces.find(s => s.id === subraceId)?.traits ?? [])];
  return pool.find(t => t.id === traitId)?.text ?? '';
}

/* ---------- Мелкая разметка стола ---------- */

const HEAD = 'flex items-center gap-2 h-7 px-2 flex-none bg-linear-to-b from-pl to-cd shadow-plate type-h-15 uppercase text-t2 whitespace-nowrap';
const VIEW_LABEL = { desk: 'Стол', time: 'Время', journal: 'Журнал' } as const;
const VIEW_ICON = { desk: 'map', time: 'tempo', journal: 'journal' } as const satisfies Record<keyof typeof VIEW_LABEL, IconName>;
const VIEW_TITLE = { desk: 'Стол: карточка или поле боя · Esc', time: 'Шаг времени и сводка «что изменилось» · T делает шаг', journal: 'Журнал сессии · J' } as const;
const MOON_PHASES: readonly MoonPhase[] = ['new', 'waxing', 'full', 'waning'];
/** Иконка неба — из набора погоды генератора; у каждой title, подпись рядом словами. */
const SKY_ICON: Readonly<Record<Sky, IconName>> = { clear: 'day', cloudy: 'cloudy', rain: 'rain', storm: 'storm' };
const BTN = 'type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';
const OPT_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';

/** Сроки состояний из сетки — те же ступени, что у концентрации, но по умолчанию «без срока». */
const CONDITION_DURATIONS = [{ sec: 0, label: 'без срока' }, ...CONCENTRATION_DURATIONS.filter(d => d.sec > 0)] as const;
/* Кнопка в шапке-плите: без своей плиты, подпись как у шапки; наведение — текст. */
const BTN_HEAD = 'type-key uppercase px-1 text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--glow-gold)]';
/* F9: панель, раскрытая из полосы иконок, — оверлей поверх главной зоны у своей полосы; float — единственная внешняя тень. */
const PANEL_OVERLAY_LEFT = 'absolute inset-y-0 left-10 z-10 w-rail-party flex flex-col bg-pn shadow-float min-h-0';
const PANEL_OVERLAY_RIGHT = 'absolute inset-y-0 right-10 z-10 w-rail-tools flex flex-col bg-pn shadow-float min-h-0';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2 truncate">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Имя и текст умения или черты; пустой текст — только имя, а не пустой абзац. */
function Entry({ name, meta, text }: { name: string; meta?: string; text: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="type-body-bold text-tx">{name}</span>
        {meta ? <span className="type-key text-t3 flex-none">{meta}</span> : null}
      </div>
      {text ? <p className="type-body-sm text-t2 whitespace-pre-line break-words [overflow-wrap:anywhere]">{text}</p> : null}
    </div>
  );
}

/* ---------- Тела вкладок ---------- */

interface BodyProps {
  actor: Actor;
  worldSec: number;
  onRoll: (formula: string, label: string) => void;
  onCommand: (cmd: Command) => void;
  /** Инструменты мастера в теле: «Хиты» (попап, который страница держит вокруг карточки) и «Концентрация»; на столе игроков — нет. */
  tools: ReactNode;
  /** Стол мастера: у чипов есть крестик снятия. */
  dmView: boolean;
}

function ChipsRow({ actor, worldSec, onCommand, dmView }: Pick<BodyProps, 'actor' | 'worldSec' | 'onCommand' | 'dmView'>) {
  const chips = chipsOf(actor, worldSec);
  if (chips.length === 0) return null;
  // Снять можно состояние SRD и концентрацию (CONCENTRATION_ENDED, решение мастера); у эффектов события нет — данные сида.
  const removeOf = (id: ConditionId | 'concentration'): (() => void) => () => onCommand(
    id === 'concentration'
      ? { type: 'CONCENTRATION_ENDED', payload: { actorId: actor.id, reason: 'dm' } }
      : id === 'exhaustion'
        ? exhaustionCommand(actor.id, (actor.conditions.exhaustion?.level ?? 1) - 1)
        : toggleCommand(actor.id, id, false),
  );
  return (
    <Section title="Состояния и эффекты">
      <div className="flex flex-wrap gap-1" data-part="chips">
        {chips.map(({ key, id, ...chip }) => (
          <ConditionChip key={key} {...chip} onRemove={id === 'effect' || !dmView ? undefined : removeOf(id)} />
        ))}
      </div>
    </Section>
  );
}

/** Навыки листа плитками — в одиночной карточке под характеристиками, в оверлее 720px — второй колонкой. */
function PcSkills({ actor, onRoll }: Pick<BodyProps, 'actor' | 'onRoll'>) {
  const sheet = actor.sheet!;
  const mods = Object.fromEntries(ABILITY_IDS.map(id => [id, abilityMod(sheet.abilities[id])])) as Record<AbilityId, number>;
  return (
    <Section title="Навыки">
      <div className="grid grid-cols-3 gap-1">
        {SKILLS_BY_ABILITY.map(id => {
          const owned = sheet.skills.includes(id);
          const mod = mods[SKILLS[id].ability] + (owned ? sheet.proficiencyBonus : 0);
          return (
            <StatTile
              key={id}
              label={SKILL_LABEL[id]}
              mod={mod}
              ability={SKILLS[id].ability}
              owned={owned}
              onRoll={() => onRoll(d20Formula(mod), `${SKILL_LABEL[id]} · ${actor.name}`)}
            />
          );
        })}
      </div>
    </Section>
  );
}

/** Владение спасбросками по классу SRD; класс вне SRD — никаких. */
function saveProficiencies(classId: string): readonly AbilityId[] {
  const cls = classById(classId);
  if (!cls) return [];
  try { return srdClassOf(cls).saves; } catch { return []; }
}

/**
 * Шапка листа по бумажной карточке владельца: портрет (пока — иконка класса на плите), раса и класс, мировоззрение,
 * скорость, рост · вес · возраст. Чего на листе нет — не показывается, пустых подписей не бывает.
 */
function PcHeader({ actor }: Pick<BodyProps, 'actor'>) {
  const sheet = actor.sheet!;
  const cls = classById(sheet.classId);
  const bio = [sheet.bio?.height, sheet.bio?.weight, sheet.bio?.age !== undefined ? `${sheet.bio.age} ${plural(sheet.bio.age, ['год', 'года', 'лет'])}` : undefined].filter(Boolean);
  const rows: { label: string; value: string }[] = [
    { label: 'Раса', value: raceLabel(sheet) },
    { label: 'Класс', value: `${cls?.nameRu ?? sheet.classId} · ${sheet.level} ур.` },
  ];
  if (sheet.alignment) rows.push({ label: 'Мировоззрение', value: sheet.alignment });
  if (sheet.speed !== undefined) rows.push({ label: 'Скорость', value: `${sheet.speed} фт` });
  if (bio.length > 0) rows.push({ label: 'Тело', value: bio.join(' · ') });
  return (
    <div className="flex items-start gap-3" data-part="pc-header">
      <div className="size-12 flex-none flex items-center justify-center bg-linear-to-b from-pl to-cd shadow-plate" data-part="portrait" title="Портрет: пока иконка класса">
        <Icon name="ent-pc" size={32} color="var(--gd)" title={actor.name} />
      </div>
      <dl className="flex-1 min-w-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(r => (
          <Fragment key={r.label}>
            <dt className="type-key uppercase text-t2">{r.label}</dt>
            <dd className="type-body-sm text-tx truncate" title={r.value}>{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/** Ресурсы листа (решение владельца 21.09.2026): ячейки, ярость, ци, применения умений — пипками; на столе игроков без кнопок. */
function PcResources({ actor, onCommand, dmView }: Pick<BodyProps, 'actor' | 'onCommand' | 'dmView'>) {
  const pools = resourcePoolsOf(actor);
  if (pools.length === 0) return null;
  return (
    <Section title="Ресурсы">
      <div className="flex flex-col gap-1" data-part="resources">
        {pools.map(p => (
          <ResourcePips
            key={p.id}
            id={p.id}
            label={poolLabel(p)}
            max={p.max}
            spent={p.spent}
            kind={p.kind}
            restoresOn={p.restoresOn}
            onSpend={dmView ? amount => onCommand({ type: 'RESOURCE_SPENT', payload: { actorId: actor.id, resourceId: p.id, amount, max: p.max } }) : undefined}
            onRestore={dmView ? amount => onCommand({ type: 'RESOURCE_RESTORED', payload: { actorId: actor.id, resourceId: p.id, amount, max: p.max } }) : undefined}
          />
        ))}
      </div>
    </Section>
  );
}

function PcOverview({ actor, worldSec, onRoll, onCommand, tools, dmView, skills = true }: BodyProps & { skills?: boolean }) {
  const sheet = actor.sheet!;
  const mods = Object.fromEntries(ABILITY_IDS.map(id => [id, abilityMod(sheet.abilities[id])])) as Record<AbilityId, number>;
  const cls = classById(sheet.classId);
  const saves = saveProficiencies(sheet.classId);
  return (
    <>
      <PcHeader actor={actor} />
      <Section title="Характеристики" right={tools}>
        <div className="grid grid-cols-6 gap-1">
          {ABILITY_IDS.map(id => {
            const owned = saves.includes(id);
            const save = mods[id] + (owned ? sheet.proficiencyBonus : 0);
            return (
              <StatTile
                key={id}
                label={ABILITIES[id].code}
                mod={mods[id]}
                score={sheet.abilities[id]}
                ability={id}
                owned={owned}
                title={`${ABILITIES[id].name}: ${signedMod(mods[id])} · спасбросок ${signedMod(save)}${owned ? ' (владение)' : ''}`}
                onRoll={() => onRoll(d20Formula(mods[id]), `${ABILITIES[id].code} · ${actor.name}`)}
              />
            );
          })}
        </div>
      </Section>
      <PcResources actor={actor} onCommand={onCommand} dmView={dmView} />
      {skills ? <PcSkills actor={actor} onRoll={onRoll} /> : null}
      <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />
      {sheet.features.length > 0 ? (
        <Section title={`Умения класса${cls ? ` · ${cls.nameRu}` : ''}`}>
          <div className="flex flex-col gap-2">
            {sheet.features.map(f => (
              <Entry key={`${f.level}:${f.id}`} name={f.name} meta={`${f.level} ур.`} text={featureText(sheet.classId, f.id, sheet.subclassId)} />
            ))}
          </div>
        </Section>
      ) : null}
      {sheet.traits.length > 0 ? (
        <Section title="Черты расы">
          <div className="flex flex-col gap-2">
            {sheet.traits.map(t => (
              <Entry key={t.id} name={t.name} text={traitText(sheet.raceId, sheet.subraceId, t.id)} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

/** Пара «подпись — значение» блока монстра: как в F3 (СПАСБРОСКИ · STR +4, DEX +5). */
function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="type-num-12 uppercase text-t2 w-24 flex-none">{label}</span>
      <span className="type-body text-tx min-w-0">{value}</span>
    </div>
  );
}

function MonsterOverview({ actor, worldSec, onRoll, onCommand, tools, dmView }: BodyProps) {
  const m = MONSTERS[actor.monsterId!];
  const saves = Object.entries(m.savingThrows).map(([ab, v]) => `${ABILITIES[ab as AbilityId].code} ${signedMod(v ?? 0)}`).join(', ');
  const skills = Object.entries(m.skills).map(([id, v]) => `${SKILL_LABEL[id as SkillId]} ${signedMod(v ?? 0)}`).join(', ');
  return (
    <>
      <Section title="Характеристики" right={tools}>
        <div className="grid grid-cols-6 gap-1">
          {ABILITY_IDS.map(id => {
            const mod = abilityMod(m.abilities[id]);
            return (
              <StatTile
                key={id}
                label={ABILITIES[id].code}
                mod={mod}
                score={m.abilities[id]}
                ability={id}
                onRoll={() => onRoll(d20Formula(mod), `${ABILITIES[id].code} · ${actor.name}`)}
              />
            );
          })}
        </div>
      </Section>
      <div className="flex flex-col gap-1">
        {/* Скорость ходьбы — в полосе показателей (SPD); строка здесь — только когда есть полёт, плавание, лазание. */}
        {m.speedText !== `${m.speed} ft.` ? <Pair label="Скорость" value={m.speedText} /> : null}
        {saves ? <Pair label="Спасброски" value={saves} /> : null}
        {skills ? <Pair label="Навыки" value={skills} /> : null}
        {m.damageVulnerabilities.length > 0 ? <Pair label="Уязвимость" value={m.damageVulnerabilities.join('; ')} /> : null}
        {m.damageResistances.length > 0 ? <Pair label="Сопротивление" value={m.damageResistances.join('; ')} /> : null}
        {m.damageImmunities.length > 0 ? <Pair label="Иммунитет" value={m.damageImmunities.join('; ')} /> : null}
        {m.conditionImmunities.length > 0 ? <Pair label="Не подвержен" value={m.conditionImmunities.join(', ')} /> : null}
        <Pair label="Чувства" value={m.senses} />
        <Pair label="Языки" value={m.languages} />
        <Pair label="CR" value={`${m.cr} (${m.xp} XP)`} />
      </div>
      <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />
      {m.traits.length > 0 ? (
        <Section title="Особенности">
          <div className="flex flex-col gap-2">
            {m.traits.map(t => <Entry key={t.name} name={t.name} text={t.text} />)}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function MonsterActions({ actor }: { actor: Actor }) {
  const m = MONSTERS[actor.monsterId!];
  return (
    <>
      <Section title="Действия">
        <div className="flex flex-col gap-2">
          {m.actions.map(a => <Entry key={a.name} name={a.name} text={a.text} />)}
        </div>
      </Section>
      {m.reactions.length > 0 ? (
        <Section title="Реакции">
          <div className="flex flex-col gap-2">
            {m.reactions.map(a => <Entry key={a.name} name={a.name} text={a.text} />)}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function DmTab({ subjectId, facts }: { subjectId: string; facts: State['facts'] }) {
  const own = dmFactsAbout(subjectId, facts);
  return (
    <ul className="flex flex-col gap-1">
      {own.map(f => (
        <li key={f.id} className="flex items-start gap-2 type-body-sm text-tx">
          <Icon name="hidden" size={16} color="var(--t2)" title="Скрыто от игроков" className="mt-0.5" />
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ссылка-текст на сущность (родитель места): кнопка без плиты, чтобы читалась строкой, а не действием. */
function TextLink({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="type-body text-tx underline decoration-t2 underline-offset-2 hover:text-gd-hi cursor-pointer text-left">
      {children}
    </button>
  );
}

/**
 * «Ждёт решения» в карточке места или фракции: ждущие предложения, целящие в неё, — было → стало словами.
 * Только мастеру: игроки симуляции не видят. Решения — во входящих, здесь только знак, почему карточка пульсирует.
 */
function PendingRows({ deltas }: { deltas: readonly State['deltas'][string][] }) {
  if (deltas.length === 0) return null;
  return (
    <Section title="Ждёт решения">
      <ul className="flex flex-col gap-1">
        {deltas.map(d => (
          <li key={d.id} className="flex items-start gap-2 type-body-sm text-tx">
            <Icon name="src-sim" size={16} color="var(--src-sim)" title="Симуляция, ждёт решения" className="mt-0.5" />
            <span className="min-w-0">
              <span className="type-body-bold">{d.subject}</span>
              <span className="text-t2">{` · ${d.was} → ${d.now}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface PlaceOverviewProps {
  place: Location;
  parent?: Location;
  onOpenParent?: () => void;
  /** Ждущие предложения о месте — только мастеру. */
  pending: readonly State['deltas'][string][];
  facts: State['facts'];
}

/** Обзор места: внутри чего лежит, что о нём известно игрокам, что ждёт решения. Уровень — бейдж, показатели — полоса карточки: здесь не повторяются. */
function PlaceOverview({ place, parent, onOpenParent, pending, facts }: PlaceOverviewProps) {
  const known = playerFactsAbout(place.id, facts);
  return (
    <>
      {/* Уровень — бейдж корешка, здесь не повторяется (факт живёт в одном месте). */}
      <div className="flex flex-col gap-1">
        {parent ? (
          <div className="flex items-baseline gap-3">
            <span className="type-num-12 uppercase text-t2 w-24 flex-none">Внутри</span>
            {onOpenParent ? <TextLink title={`${SCALE_LABELS[parent.scale]} · ${parent.name}: подняться на уровень выше`} onClick={onOpenParent}>{parent.name}</TextLink> : <span className="type-body text-tx">{parent.name}</span>}
          </div>
        ) : null}
      </div>
      {known.length > 0 ? (
        <Section title="Известно игрокам">
          <ul className="flex flex-col gap-1">
            {known.map(f => (
              <li key={f.id} className="flex items-start gap-2 type-body-sm text-tx">
                <Icon name="src-players" size={16} color="var(--src-players)" title="Известно игрокам" className="mt-0.5" />
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <PendingRows deltas={pending} />
    </>
  );
}

/** Обзор фракции: цель словами и что ждёт решения; влияние, тренд и известность — в полосе карточки. */
function FactionOverview({ faction, pending }: { faction: Faction; pending: readonly State['deltas'][string][] }) {
  return (
    <>
      {faction.goal ? <Pair label="Цель" value={faction.goal} /> : null}
      <PendingRows deltas={pending} />
    </>
  );
}

/* ---------- Страница ---------- */

export interface DeskPageProps {
  /** Стор снаружи — для тестов (seedEngine с memoryStore); без него страница поднимает сид из хранилища. */
  store?: EngineStoreApi;
  /** Хранилище лога: localStorage по умолчанию; «Новая сессия» чистит его и поднимает сид заново. Тесты подставляют memoryStore. */
  persist?: EventStore;
  /** Стол мастера. false — стол игроков с самого начала (как после `P`): секретов в DOM нет. */
  dmView?: boolean;
}

interface DeskProps {
  store: EngineStoreApi;
  dmView: boolean;
  /** Сохранённый лог не поднялся или файл не открылся — первая заметка мастеру. */
  recoverNote: string | null;
  /** «Новая сессия»: стереть журнал и собрать стол из сида заново. */
  onReset: () => void;
  /** «Сохранить» — журнал сессии файлом; «Открыть…» — стол из файла (проверяется реплеем до подмены). */
  onExport: () => void;
  onImport: (file: File) => void;
}

/** Имя файла сессии: dm-cockpit-<дата стены>.json. */
export function sessionFileName(now: Date = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `dm-cockpit-${d}.json`;
}

/** Текст файла через FileReader: он есть везде, где есть <input type="file">; Blob.text() — не везде (jsdom). */
export function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error ?? new Error('файл не прочитался'));
    r.readAsText(file);
  });
}

/** Скачать текст файлом через временную ссылку; без URL.createObjectURL (старый браузер, jsdom) — тихо ничего. */
export function downloadText(name: string, text: string, doc: Document = document): void {
  const url = globalThis.URL?.createObjectURL?.(new Blob([text], { type: 'application/json' }));
  if (!url) return;
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  globalThis.URL.revokeObjectURL(url);
}

/**
 * Страница: один стор на сессию. Сохранённый лог мог перестать реплеиться (сид изменился) — seedEngine чистит
 * хранилище и собирает стол из сида, а причина становится первой заметкой мастеру: потеря сессии не проходит
 * молча. «Новая сессия» — не событие (нечего отменять: журнала больше нет): хранилище чистится, стор поднимается
 * из сида, стол перемонтируется целиком — выбор, лестница и фильтры начинаются заново.
 */
export function DeskPage({ store: given, persist: givenPersist, dmView = true }: DeskPageProps) {
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
      persist.current.save(events);
      recovered.current = null;
      setSession(s => ({ n: s.n + 1, store: make(), note: `Открыт файл ${file.name}: ${events.length} ${plural(events.length, ['событие', 'события', 'событий'])}.` }));
      return;
    } catch (err) {
      note = `Файл ${file.name} не открылся: ${err instanceof Error ? err.message : String(err)}. Сессия осталась прежней.`;
    }
    setSession(s => ({ ...s, n: s.n + 1, note }));
  };
  return (
    <Desk
      key={session.n}
      store={session.store}
      dmView={dmView}
      recoverNote={session.note ?? (recovered.current ? 'Сохранённая сессия не открылась — стол собран заново из сида.' : null)}
      onReset={reset}
      onExport={exportLog}
      onImport={file => { void importLog(file); }}
    />
  );
}

/** Откуда падает попап хитов: от ячейки HP карточки или от токена (сетка, полоса инициативы). */
type PopoverAnchor = 'card' | 'token';

/** Что показывает слот карточки: выбранного актёра, место в фокусе лестницы или державу по id. */
type CardSlot = { kind: 'actor' } | { kind: 'place' } | { kind: 'faction'; id: string };

function Desk({ store, dmView: dmViewProp, recoverNote, onReset, onExport, onImport }: DeskProps) {
  // Режим «глазами игроков» — состояние вида, не событие: P переключает, рамка обозначает, модель фильтрует.
  // Всё, чего игрокам видеть нельзя, в DOM не попадает (CLAUDE.md «Правила экрана»), а не приглушается.
  const [playersView, setPlayersView] = useState(!dmViewProp);
  const dmView = !playersView;
  const state = useEngine(store, s => s.state);
  const events = useEngine(store, s => s.events);
  const toast = useEngine(store, s => s.toast);
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
  const [cardInCombat, setCardInCombat] = useState(false);
  // Попапы живого стола — редактор инициативы, появление противника, начало концентрации: состояние вида.
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [concentrationOpen, setConcentrationOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  /** Срок следующего состояния из сетки, секунд мирового времени; 0 — пока мастер не снимет. */
  const [conditionDuration, setConditionDuration] = useState(0);
  // Оверлей карточки 720px (F3) — вид: та же карточка в две колонки с бронзовой рамкой поверх главной зоны.
  const [cardOverlay, setCardOverlay] = useState(false);
  /** Редактор персонажа (шаг B) — оверлей в главной зоне; черновик — его собственное состояние, в лог идёт только ACTOR_SPAWNED. */
  const [editorOpen, setEditorOpen] = useState(false);
  // Лестница масштабов (шаг 10) — навигация, не событие: уровень и путь (по месту на уровень) живут здесь.
  // Что в слоте карточки: актёр из корешка, место в фокусе лестницы или держава со стопки континента.
  const [ladderState, setLadderState] = useState<Ladder>(() => initialLadder(state));
  const [cardOf, setCardOf] = useState<CardSlot>({ kind: 'actor' });
  // Журнал сессии (F7) — вид главной зоны, не событие: фильтр по нитям и уровням, черновик заметки,
  // отложенные напоминания о секретах («Позже») — всё живёт здесь и не переживает перезагрузку.
  const [view, setView] = useState<'desk' | 'time' | 'journal'>('desk');
  // Темп — переключатель, не событие (HANDOFF §7): начальный — из состояния, в бою всегда раунды.
  const [tempoChoice, setTempoChoice] = useState<Tempo>(() => state.time.tempo);
  // Последний шаг времени этого экрана: сводка «что изменилось» — предложения именно этого шага, пока они ждут решения.
  const [lastStep, setLastStep] = useState<{ eventId: string; deltaIds: string[] } | null>(null);
  const [filterThreads, setFilterThreads] = useState<string[]>([]);
  const [filterScales, setFilterScales] = useState<ScaleLevel[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [laterFacts, setLaterFacts] = useState<string[]>([]);
  // «Позже» у напоминаний о концентрации — по ключу актёр + заклинание + срок: новое заклинание напомнит заново.
  const [laterConcentration, setLaterConcentration] = useState<string[]>([]);
  // F9: боковые панели свёрнуты в полосы 40px — состояние вида. На планшете — с самого начала обе; мастер
  // сворачивает и закрепляет руками. Раскрытая из полосы панель лежит оверлеем поверх главной зоны до Esc.
  const [narrow, setNarrow] = useState(isNarrow);
  const [railParty, setRailParty] = useState(narrow);
  const [railTools, setRailTools] = useState(narrow);
  const [openRail, setOpenRail] = useState<{ side: 'party' | 'tools'; item: string } | null>(null);
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
  // Поле боя — данные сида (расстановка F2); событий перемещения нет, поэтому оно не в State и не меняется.
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
  const views = dmView ? (['desk', 'time', 'journal'] as const) : (['desk', 'journal'] as const);
  // Вид «Время» — экран мастера: на столе игроков вместо него стол, а состояние вида не теряется до возврата.
  const shownView = !dmView && view === 'time' ? 'desk' : view;
  const openThreads = Object.values(state.world.threads).filter(t => t.status === 'open');
  const activeId = combat ? encounter.order[encounter.turnIndex] : undefined;
  const initiative: InitiativeBarEntry[] = encounter.order.flatMap(id => {
    const a = state.actors[id];
    return a ? [initiativeTokenOf(a, a.initiative ?? 0)] : [];
  });
  const tokens = placedActors(state, field).map(({ actor: a, cell }) => battleTokenOf(a, cell));
  const lastRoll = lastRollOf(events);
  // Скрытый бросок на столе игроков не показывается — ни карточкой, ни строкой истории.
  const shownRoll = lastRoll && lastRoll.id !== closedRollId && (dmView || !lastRoll.roll.hidden) ? lastRoll : null;
  // Вне боя токенов нет — попап падает только от карточки, даже если последний раз открывался с токена.
  const anchor: PopoverAnchor = combat ? popoverAnchor : 'card';
  // Лестница, приведённая к сеттингу: бой кончился (или его начало отменили) — с уровня боя на место, откуда он начался.
  const ladder = normalizeLadder(state, ladderState);
  const focus = focusOf(state, ladder);
  const focusParent = focus?.parentId ? state.world.locations[focus.parentId] : undefined;
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
      } else if (isDeskHotkey(e, 'KeyR')) {
        const last = lastRollOf(store.getState().events);
        if (playersRef.current || !last) return;
        e.preventDefault();
        store.getState().rollDice(last.roll.formula, { label: last.roll.label, hidden: hiddenRolls });
      } else if (isDeskHotkey(e, 'KeyJ')) {
        e.preventDefault();
        setView(v => (v === 'journal' ? 'desk' : 'journal'));
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
  const onMention = (entity: 'actor' | 'location' | 'faction', id: string) => {
    if (entity === 'actor' && state.actors[id]) { open(id); setView('desk'); }
    else if (entity === 'location' && state.world.locations[id]) goLadder(selectPlace(state, ladder, id));
    else if (entity === 'faction' && state.world.factions[id]) { showCard({ kind: 'faction', id }); setView('desk'); }
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
    api.note(text, filterThreads, scale);
    setNoteDraft('');
  };
  const entryProps = (entry: JournalRecord) => ({ ...journalEntryProps(entry, state), onMention, onThread });
  /** Шаг времени: TIME_ADVANCED и предложения симуляции за отрезок; сводка «что изменилось» поднимается сразу. */
  const onStep = (steps: number) => {
    const { event, proposals } = stepTime(store.getState(), tempo, steps);
    setLastStep({ eventId: event.id, deltaIds: proposals.map(d => d.id) });
    setView('time');
  };
  const decide = (deltaId: string, verdict: 'accept' | 'reject') => (verdict === 'accept' ? api.accept(deltaId) : api.reject(deltaId));
  /** Бросок для редактора инициативы и новичков: DICE_ROLLED в лог (скрытость — как у прочих бросков мастера), итог — числом. */
  const rollTotal = (formula: string, label: string) => api.rollDice(formula, { label, hidden: hiddenRolls }).payload.total;
  const initiativeRows: InitiativeRow[] = encounterCandidates(state).map(a => ({ id: a.id, name: a.name, kind: a.kind, mod: initiativeMod(a), initiative: a.initiative }));
  /** Порядок из редактора: до боя — ENCOUNTER_STARTED с ним, в бою — INITIATIVE_SET (ход остаётся у того, чей был). */
  const applyInitiative = (order: InitiativeEntry[]) => {
    if (combat) api.setInitiative(order);
    else api.startEncounter(order);
    setInitiativeOpen(false);
  };
  const spawnOptions: SpawnOption[] = MONSTER_IDS.map(id => {
    const m = MONSTERS[id];
    return { id, name: m.name, cr: m.cr, ac: m.ac.value, hp: m.hp.average, suggested: suggestMonsterName(state, id) };
  });
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
    open(actors[0].id);
  };
  const startConcentration = (spell: string, durationSec?: number) => {
    if (!actor) return;
    api.startConcentration(actor.id, spell, durationSec === undefined ? undefined : state.time.sec + durationSec);
    setConcentrationOpen(false);
  };
  const festival = nextFestival(state.time.sec);
  // Погода — проекция календаря (§4): день задаёт её целиком, ни состояния, ни события.
  const weather = weatherOf(state.time.sec);
  // Полосы F9: те же иконки в том же порядке, что секции панелей; счётчик — сколько ждёт решения.
  const partyRailItems: IconRailItem[] = [{ id: 'party', icon: 'ent-pc', label: 'Партия', color: 'var(--ent-pc)' }];
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
            {actor ? <ConcentrationForm current={actor.concentration?.spell} onStart={startConcentration} /> : null}
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

  const cardProps = actor ? actorCardProps(actor, { onHp: dmView ? openFromCard : undefined, dmFacts: dmFactsOf(actor, state.facts).length }) : null;
  /**
   * Тело вкладки актёра: `column` — одиночная карточка целиком; в оверлее 720px обзор делится на две колонки —
   * навыки персонажа и действия монстра уходят вправо (`aside`), остальное — влево (`main`). В оверлее
   * инструментов нет: хиты и концентрация правятся из одиночной карточки, оверлей — для чтения.
   */
  const renderActorBody = (current: string, column: 'column' | 'main' | 'aside'): ReactNode => {
    if (!actor) return null;
    const body: BodyProps = { actor, worldSec: state.time.sec, onRoll, onCommand, tools: dmView && column === 'column' ? cardTools : null, dmView };
    if (column === 'aside') {
      if (current !== 'overview') return null;
      return actor.kind === 'monster' ? <MonsterActions actor={actor} /> : <PcSkills actor={actor} onRoll={onRoll} />;
    }
    switch (current) {
      case 'overview':
        return actor.kind === 'monster' ? <MonsterOverview {...body} /> : <PcOverview {...body} skills={column === 'column'} />;
      case 'actions':
        return <MonsterActions actor={actor} />;
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
        return <Paperdoll items={deskDollItems(actor.sheet)} />;
      case 'dm':
        return <DmTab subjectId={actor.id} facts={state.facts} />;
      default:
        return null;
    }
  };
  const actorCard = actor && cardProps ? (
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
      beforeTabs={anchor === 'card' ? <Popover.Anchor className="h-0 flex-none" /> : null}
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
        />
      ) : current === 'dm' ? <DmTab subjectId={focus.id} facts={state.facts} /> : null}
    </EntityCard>
  ) : null;
  const factionCard = faction ? (
    <EntityCard key={faction.id} {...factionCardProps(faction, { pending: pendingIds.has(faction.id) })} activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full flex-none">
      {(current: string) => (current === 'overview' ? <FactionOverview faction={faction} pending={dmView ? pendingFor(state, faction.id) : []} /> : null)}
    </EntityCard>
  ) : null;
  const card = cardOf.kind === 'actor' ? actorCard : cardOf.kind === 'place' ? placeCard : factionCard;
  // Оверлей 720px — та же сущность в две колонки с бронзовой рамкой (F3). Живёт в главной зоне (портал в неё):
  // партию и полосу часов не накрывает (CLAUDE.md), Esc и клик по затемнению закрывают. У места и державы —
  // тот же обзор в одну колонку. В оверлее вкладка та же, что в одиночной карточке.
  const overlayName = cardOf.kind === 'actor' ? actor?.name : cardOf.kind === 'place' ? focus?.name : faction?.name;
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
        <PlaceOverview place={focus} parent={focusParent} onOpenParent={focusParent ? () => { setCardOverlay(false); goLadder(selectPlace(state, ladder, focusParent.id)); } : undefined} pending={dmView ? pendingFor(state, focus.id) : []} facts={state.facts} />
      ) : current === 'dm' ? <DmTab subjectId={focus.id} facts={state.facts} /> : null}
    </EntityCard>
  ) : faction ? (
    <EntityCard {...factionCardProps(faction, { pending: pendingIds.has(faction.id) })} overlay activeTab={tab} onTab={setTab} dmView={dmView} className="max-h-full">
      {(current: string) => (current === 'overview' ? <FactionOverview faction={faction} pending={dmView ? pendingFor(state, faction.id) : []} /> : null)}
    </EntityCard>
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
        <Dialog.Content aria-describedby={undefined} className="absolute top-6 left-1/2 -translate-x-1/2 z-30 max-h-[calc(100%-48px)] flex outline-none">
          <Dialog.Title className="sr-only">Новый персонаж</Dialog.Title>
          <CharacterEditor takenIds={new Set(Object.keys(state.actors))} onCreate={onCreatePc} onClose={() => setEditorOpen(false)} />
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

  return (
    <PlayerFrame on={playersView}>
    <main aria-label={playersView ? 'Стол игроков' : 'Стол'} data-view={playersView ? 'players' : 'dm'} className="flex-1 min-h-0 flex flex-col">
      <header aria-label="Мировые часы" className="h-bar-clock flex-none flex items-center gap-3 px-3 bg-linear-to-b from-pl to-cd shadow-plate">
        <Icon name={DAY_PHASE_ICONS[phase]} size={16} color="var(--gd)" title={`Фаза суток: ${DAY_PHASE_LABELS[phase].toLowerCase()}`} />
        <time className="type-num-15 text-gd whitespace-nowrap" title={narrow ? `Дата и время мира: ${formatHarptos(state.time.sec)}` : 'Дата и время мира'}>{narrow ? shortHarptos(state.time.sec) : formatHarptos(state.time.sec)}</time>
        {narrow ? null : <span className="type-num-12 uppercase text-t2" data-part="phase">{DAY_PHASE_LABELS[phase]}</span>}
        <span data-part="weather" title={`Погода: ${weatherLabel(weather)}`} className="flex flex-none items-center gap-1 whitespace-nowrap type-body-sm text-t2">
          <Icon name={SKY_ICON[weather.sky]} size={16} color="var(--t2)" title={weatherLabel(weather)} />
          <span>{narrow ? `${weather.tempC < 0 ? '\u2212' : '+'}${Math.abs(weather.tempC)} °C` : weatherLabel(weather)}</span>
        </span>
        <CelestialBar moon={moon.phase} next={{ label: 'Полнолуние', countdown: inDays(moon.daysToFull) }} compact={narrow} />
        {combat ? <span className="type-num-12 uppercase text-t2" data-part="round">Раунд {encounter.round}</span> : null}
        <div role="group" aria-label="Вид главной зоны" className="ml-auto flex items-center gap-1">
          {views.map(v => (
            <button
              key={v}
              type="button"
              aria-pressed={shownView === v}
              aria-label={narrow ? VIEW_LABEL[v] : undefined}
              title={dmView ? VIEW_TITLE[v] : VIEW_LABEL[v]}
              onClick={() => setView(v)}
              className={`${BTN} ${shownView === v ? 'text-gd-hi' : ''}`}
            >
              {narrow ? <Icon name={VIEW_ICON[v]} size={16} color="currentColor" title={VIEW_LABEL[v]} /> : VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        {/* Инструменты мастера — темп, шаг, начало боя, переключатель режима — на столе игроков отсутствуют (F8). */}
        {dmView ? (
          <>
            <Popover.Root open={initiativeOpen} onOpenChange={setInitiativeOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  title={combat ? 'Порядок инициативы: поправить броски, вписать новичка' : 'Начать бой: броски инициативы — игроки называют, монстрам бросает стол'}
                  className={BTN}
                >
                  {combat ? 'Порядок' : 'Начать бой'}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Инициатива" className="z-20 outline-none">
                  <InitiativeEditor rows={initiativeRows} mode={combat ? 'set' : 'start'} onRoll={rollTotal} onApply={applyInitiative} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {combat ? null : (
              // Отдых — вне боя (SRD: бой прерывает отдых); в бою кнопки нет вовсе.
              <Popover.Root open={restOpen} onOpenChange={setRestOpen}>
                <Popover.Trigger asChild>
                  <button type="button" title="Отдых: короткий — час и кости хитов, долгий — восемь часов и хиты полны" className={BTN}>Отдых</button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Отдых" className="z-20 outline-none">
                    <RestForm rows={restRows} onRoll={rollTotal} onRest={onRest} />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
            <TimeTempo value={tempo} onChange={setTempoChoice} onStep={onStep} disabled={combat} />
            <button
              type="button"
              aria-pressed={false}
              title="Глазами игроков: секреты уходят из DOM · P"
              onClick={() => setPlayersView(true)}
              className={BTN}
            >
              Игроки
            </button>
          </>
        ) : null}
      </header>

      <div className="relative flex-1 min-h-0 flex">
        {railParty ? (
          <IconRail
            side="left"
            label="Партия"
            items={partyRailItems}
            active={openRail?.side === 'party' ? openRail.item : undefined}
            onOpen={item => setOpenRail(o => (o?.side === 'party' ? null : { side: 'party', item }))}
          />
        ) : null}
        {!railParty || openRail?.side === 'party' ? (
        <aside aria-label="Партия" data-overlay={railParty || undefined} className={railParty ? PANEL_OVERLAY_LEFT : 'w-rail-party flex-none flex flex-col bg-pn shadow-bevel min-h-0'}>
          <div className={HEAD}>
            <Icon name="ent-pc" size={16} color="var(--t2)" title="Партия" />
            <span>Партия</span>
            <span className="ml-auto type-key text-t2" title="Персонажей в партии">{party.length}</span>
            {dmView ? (
              <button type="button" title="Новый персонаж из компендиума: раса, класс, point buy, навыки — в партию одним событием" onClick={() => setEditorOpen(true)} className={BTN_HEAD}>Новый</button>
            ) : null}
            {railParty ? (
              <button type="button" title="Закрепить панель на столе" onClick={() => { setRailParty(false); setOpenRail(null); }} className={BTN_HEAD}>Закрепить</button>
            ) : (
              <button type="button" title="Свернуть панель в полосу иконок" onClick={() => setRailParty(true)} className={BTN_HEAD}>Свернуть</button>
            )}
          </div>
          <div className="min-h-0 overflow-auto">
            <PartySpine actors={party} worldSec={state.time.sec} selectedId={selectedId} onOpen={open} flash={flashes} locations={state.world.locations} />
          </div>
        </aside>
        ) : null}

        {/* Popover.Root — вокруг всей главной зоны: якорь один, но живёт то в карточке, то на токене. */}
        <Popover.Root key={actor?.id ?? 'none'} open={popoverOpen} onOpenChange={setPopoverOpen}>
          {anchor === 'token' ? <Popover.Anchor virtualRef={tokenAnchor} /> : null}
          {shownView === 'time' ? (
            <section aria-label="Шаг времени" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-4 p-4 overflow-auto">
              <DayPhaseStrip value={phase} />
              <div className="flex flex-col bg-pn shadow-bevel">
                <div className={HEAD}>
                  <Icon name="scale-system" size={16} color="var(--ent-plane)" title="Небесные тела" />
                  <span>Небесные тела</span>
                  <span className="type-key text-t2 normal-case">темп часов: {TEMPO_LABELS[tempo].toLowerCase()}</span>
                </div>
                {/* Планетарий (Orrery) — уровень звёздной системы, шаг 10; здесь — фазы Selûne и обратный отсчёт. */}
                <ol aria-label="Фазы Selûne" className="flex flex-col gap-1 p-3">
                  {MOON_PHASES.map(ph => (
                    <li key={ph} aria-current={ph === moon.phase ? 'true' : undefined} className={`flex items-center gap-2 type-body-sm ${ph === moon.phase ? 'text-tx' : 'text-t2'}`}>
                      <Icon name={MOON_ICONS[ph]} size={16} color={ph === moon.phase ? 'var(--src-canon)' : 'var(--t2)'} title={MOON_LABELS[ph]} />
                      <span>{MOON_LABELS[ph]}</span>
                      {ph === 'full' ? <span className="type-key text-t2">{inDays(moon.daysToFull)}</span> : null}
                      {ph === 'new' ? <span className="type-key text-t2">{inDays(moon.daysToNew)}</span> : null}
                    </li>
                  ))}
                </ol>
              </div>
              {dmView ? (
              <div className="flex flex-col bg-pn shadow-bevel">
                <div className={HEAD}>
                  <Icon name="pulse" size={16} color="var(--src-sim)" title="Что изменилось" />
                  <span>Что изменилось</span>
                  {lastStep ? <span className="type-key text-t2 normal-case">после шага · ждут решения: {stepDeltas.length}</span> : null}
                </div>
                <ChangeSummary
                  className="p-3"
                  emptyText={lastStep ? 'Всё решено — предложения этого шага разобраны.' : 'Сводка появится после шага времени: выбери темп в полосе часов и нажми «Шаг» (или T).'}
                  groups={summaryGroups(stepDeltas, scaleLabel, NEAR_SCALES).map(g => ({
                    ...g,
                    items: g.items.map(it => ({ ...it, onAccept: () => decide(it.id, 'accept'), onReject: () => decide(it.id, 'reject') })),
                  }))}
                  onAcceptAll={groupId => { for (const d of stepDeltas) if (d.scale === groupId) api.accept(d.id); }}
                />
              </div>
              ) : null}
            </section>
          ) : shownView === 'journal' ? (
            <section aria-label="Журнал сессии" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="flex flex-col gap-2 px-4 pt-3 pb-2 shadow-[inset_0_-1px_0_var(--lo)]">
                <div className="flex items-start gap-4">
                  <ThreadFilter
                    threads={threads.map(t => ({ id: t.id, name: t.name, count: t.count }))}
                    scales={journalScales(allEntries).map(id => ({ id }))}
                    activeThreads={filterThreads}
                    activeScales={filterScales}
                    onThread={(id, on) => setFilterThreads(t => toggleIn(t, id, on))}
                    onScale={(id, on) => setFilterScales(sc => toggleIn(sc, id, on))}
                    className="flex-1 min-w-0"
                  />
                  <span className="type-key uppercase text-t2 whitespace-nowrap" data-part="count">Записей: {filtered.length} из {allEntries.length}</span>
                </div>
                {dmView ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={e => { e.preventDefault(); addNote(); }}
                >
                  <Icon name="note" size={16} color="var(--src-dm)" title="Заметка мастера" />
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    aria-label="Заметка"
                    placeholder={filterThreads.length > 0 ? `Заметка в нить: ${filterThreads.map(id => state.world.threads[id]?.name ?? id).join(', ')}` : 'Заметка — Enter записывает'}
                    className="flex-1 min-w-0 type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1 placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
                  />
                  <button type="submit" disabled={noteDraft.trim() === ''} title="Записать в журнал · Enter" className={BTN}>Записать</button>
                </form>
                ) : null}
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-4">
                {reminders.map(f => (
                  <JournalReminder
                    key={f.id}
                    text={`${f.text} — открыть игрокам?`}
                    onReveal={() => api.reveal(f.id)}
                    onLater={() => setLaterFacts(l => [...l, f.id])}
                    className="my-2"
                  />
                ))}
                <ol aria-label="Записи журнала сессии" className="flex flex-col">
                  {filtered.map(entry => {
                    const cascade = cascadeOf(entry, allEntries, state);
                    return (
                      <li key={entry.id} data-undone={entry.undone || undefined} className="flex flex-col">
                        <JournalEntry {...entryProps(entry)} />
                        {cascade.length > 0 ? <JournalCascade steps={cascade} className="mb-2" /> : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
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
                      <Popover.Root open={spawnOpen} onOpenChange={setSpawnOpen}>
                        <Popover.Trigger asChild>
                          <button type="button" title="Добавить противника из блока SRD; в бою — сразу в порядок инициативы" className={BTN}>Добавить</button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Добавить противника" className="z-20 outline-none">
                            <SpawnForm options={spawnOptions} onSpawn={onSpawn} />
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
                // Ключ — уровень и фокус: переход — одна анимация приближения на 200 мс (HANDOFF §3), точка фокуса та же.
                <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex items-start gap-4 p-4 overflow-auto">
                  {here.length > 0 || (ladder.level === 'continent' && factions.length > 0) || foes.length > 0 ? (
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
                          items={foes.map(stackItemOf)}
                          onOpen={it => open(it.id)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {!combat || cardInCombat ? card : null}
                </div>
              )}
              {cardOverlayDialog}
              {editorDialog}
            </section>
          )}
          {hpPopover}
        </Popover.Root>

        {railTools ? (
          <IconRail
            side="right"
            label={dmView ? 'Инструменты' : 'Хроника'}
            items={toolsRailItems}
            active={openRail?.side === 'tools' ? openRail.item : undefined}
            onOpen={item => setOpenRail(o => (o?.side === 'tools' ? null : { side: 'tools', item }))}
            className="order-last"
          />
        ) : null}
        {!railTools || openRail?.side === 'tools' ? (
        <aside aria-label={dmView ? 'Журнал и отмена' : 'Хроника похода'} data-overlay={railTools || undefined} className={railTools ? PANEL_OVERLAY_RIGHT : 'w-rail-tools flex-none flex flex-col bg-pn shadow-bevel min-h-0'}>
          {dmView ? (
          <>
          <div className={HEAD}>
            <Icon name="reroll" size={16} color="var(--t2)" title="Отмена и повтор" />
            <span>Действия</span>
            {toolsPin}
          </div>
          <div className="flex items-center gap-1 p-2">
            <button type="button" title="Отменить последнее действие · Ctrl+Z" disabled={!canUndo} onClick={() => api.undo()} className={BTN}>Отменить</button>
            <button type="button" title="Повторить отменённое · Ctrl+Shift+Z" disabled={!canRedo} onClick={() => api.redo()} className={BTN}>Повторить</button>
            {resetArmed ? null : (
              <button type="button" title="Новая сессия: стереть журнал и собрать стол из сида заново — спросит подтверждение" onClick={() => setResetArmed(true)} className={`ml-auto ${BTN}`}>Новая сессия</button>
            )}
          </div>
          {/* Файл сессии — страховка живой игры: журнал целиком, тем же конвертом, что в хранилище браузера. */}
          <div className="flex items-center gap-1 px-2 pb-2">
            <button type="button" title="Сохранить журнал сессии файлом (dm-cockpit-<дата>.json)" onClick={onExport} className={BTN}>Сохранить</button>
            <label title="Открыть журнал сессии из файла: стол соберётся из него, битый файл сессию не тронет" className={`${BTN} inline-flex items-center`}>
              Открыть…
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Файл сессии"
                onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
                className="sr-only"
              />
            </label>
          </div>
          {resetArmed ? (
            <div role="alertdialog" aria-label="Новая сессия" className="flex flex-col gap-2 mx-2 mb-2 px-2 py-2 bg-pl shadow-plate type-body-sm text-tx">
              <span>Стереть журнал сессии и начать заново? Отменить это будет нельзя.</span>
              <div className="flex items-center gap-1">
                <button type="button" title="Стереть журнал: стол из сида" onClick={onReset} className={`${BTN} text-fx-damage-hi`}>Стереть</button>
                <button type="button" title="Оставить сессию как есть" onClick={() => setResetArmed(false)} className={BTN}>Оставить</button>
              </div>
            </div>
          ) : null}
          {/* Живой регион существует всегда: скринридер объявляет изменения внутри него, а не его появление. */}
          <div role="status" aria-live="polite" className={toast ? 'flex items-start gap-2 mx-2 mb-2 px-2 py-1 bg-pl shadow-plate type-body-sm text-tx' : 'sr-only'}>
            {toast ? (
              <>
                <span className="flex-1 min-w-0">{toast}</span>
                <button type="button" aria-label="Скрыть тост" title="Скрыть" onClick={() => api.dismissToast()} className="flex-none text-t2 hover:text-tx">
                  <Icon name="cross" size={16} color="currentColor" title="Скрыть" />
                </button>
              </>
            ) : null}
          </div>
          {note ? (
            <div role="note" className="flex items-start gap-2 mx-2 mb-2 px-2 py-1 bg-cd shadow-bevel type-body-sm text-t2">
              <Icon name="note" size={16} color="var(--src-dm)" title="Заметка мастера" className="mt-0.5" />
              <span className="flex-1 min-w-0">{note}</span>
              <button type="button" aria-label="Скрыть заметку" title="Скрыть" onClick={() => setNote(null)} className="flex-none text-t2 hover:text-tx">
                <Icon name="cross" size={16} color="currentColor" title="Скрыть" />
              </button>
            </div>
          ) : null}
          </>
          ) : (
            // Стол игроков (F8): вместо действий мастера — открытые задачи партии, без сроков и секретов.
            <>
              <div className={HEAD}>
                <Icon name="threads" size={16} color="var(--t2)" title="Хроника похода" />
                <span>Хроника похода</span>
                {toolsPin}
              </div>
              {openThreads.length > 0 ? (
                <p className="px-2 py-2 type-body-sm text-tx">
                  Открытые задачи: {openThreads.map(t => t.name).join('; ')}.
                </p>
              ) : null}
            </>
          )}
          {shownRoll ? (
            // Последний бросок из лога (DICE_ROLLED); закрытый крестиком не возвращается, следующий бросок — новая карточка.
            // На столе игроков — без переключателя скрытости, переброса и истории со скрытыми бросками.
            <RollModal
              roll={shownRoll.roll}
              history={rollHistoryOf(events).filter(r => r.id !== shownRoll.id && (dmView || !r.hidden))}
              hidden={hiddenRolls}
              onHiddenChange={dmView ? setHiddenRolls : undefined}
              onReroll={dmView ? () => api.rollDice(shownRoll.roll.formula, { label: shownRoll.roll.label, hidden: hiddenRolls }) : undefined}
              onClose={() => setClosedRollId(shownRoll.id)}
              className="mx-auto mb-2"
            />
          ) : null}
          {shownView === 'journal' ? (
            <>
              <div className={HEAD}>
                <Icon name="threads" size={16} color="var(--t2)" title="Нити" />
                <span>Нити</span>
                <span className="ml-auto type-key text-t2" title="Открытых нитей">{threads.length}</span>
              </div>
              <div className="min-h-0 overflow-auto flex flex-col gap-2 p-2">
                {threads.map(t => (
                  <ThreadCard
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    count={t.count}
                    rows={threadCardRows(t, dmView)}
                    selected={filterThreads.includes(t.id)}
                    onSelect={id => setFilterThreads(f => toggleIn(f, id, !f.includes(id)))}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {concentrationReminders.length > 0 || conditionReminders.length > 0 ? (
                // Система предлагает, мастер решает: снять — событие, «Позже» — вид. Пустого списка нет вовсе.
                <div aria-label="Напоминания" role="list" className="flex flex-col px-2 pt-1">
                  {conditionReminders.map(r => (
                    <div key={r.key} role="listitem">
                      <JournalReminder
                        inset={false}
                        icon={{ name: `cond-${r.conditionId}` as IconName, color: 'var(--fx-damage-hi)', title: 'Срок вышел' }}
                        action={{ label: 'Снять', title: `Снять состояние «${CONDITIONS[r.conditionId].label}»: срок вышел` }}
                        text={r.text}
                        onReveal={() => onCommand({ type: 'CONDITION_REMOVED', payload: { targetId: r.actorId, conditionId: r.conditionId } })}
                        onLater={() => setLaterConcentration(l => [...l, r.key])}
                      />
                    </div>
                  ))}
                  {concentrationReminders.map(r => (
                    <div key={r.key} role="listitem">
                      <JournalReminder
                        inset={false}
                        icon={{ name: r.reason === 'unconscious' ? 'cond-unconscious' : 'cond-concentration', color: 'var(--fx-damage-hi)', title: r.reason === 'unconscious' ? 'Без сознания' : 'Срок вышел' }}
                        action={{ label: 'Снять', title: r.reason === 'unconscious' ? 'Снять концентрацию: без сознания' : 'Снять концентрацию: срок вышел' }}
                        text={r.text}
                        onReveal={() => onCommand({ type: 'CONCENTRATION_ENDED', payload: { actorId: r.actorId, reason: r.reason } })}
                        onLater={() => setLaterConcentration(l => [...l, r.key])}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              {dmView && pending.length > 0 ? (
                // Входящие — сверху панели инструментов (HANDOFF §4): пока мастер не решил, мир не менялся.
                <>
                  <div className={HEAD}>
                    <Icon name="inbox" size={16} color="var(--src-sim)" title="Предложения мира" />
                    <span>Входящие</span>
                    <span className="ml-auto type-key text-t2" title="Ждут решения">{pending.length}</span>
                  </div>
                  <div aria-label="Входящие" role="list" className="min-h-0 max-h-[45%] overflow-auto flex flex-col gap-2 p-2">
                    {pending.map(d => (
                      <div key={d.id} role="listitem">
                        <WorldDelta
                          {...worldDeltaProps(d)}
                          chain={causeChain(d.causeId, allEntries, state, [d.id]).map(c => c.label)}
                          onAccept={() => api.accept(d.id)}
                          onReject={() => api.reject(d.id)}
                          onReroll={(d.variants?.length ?? 0) > 1 ? () => api.reroll(d.id) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : dmView ? (
                // Единственная секция, что показывается пустой (CLAUDE.md): «Мир спокоен» и ближайший праздник —
                // луна уже в полосе часов, второй раз не печатается.
                <>
                  <div className={HEAD}>
                    <Icon name="inbox" size={16} color="var(--t2)" title="Предложения мира" />
                    <span>Входящие</span>
                  </div>
                  <p data-part="calm" className="px-2 py-2 type-body-sm text-t2">
                    Мир спокоен. Ближайший праздник — <span className="text-tx">{festival.festival}</span> {inDays(festival.days)}.
                  </p>
                </>
              ) : null}
              <div className={HEAD}>
                <Icon name="journal" size={16} color="var(--t2)" title="Журнал" />
                <span>{combat ? 'Журнал боя' : 'Журнал'}</span>
                <span className="ml-auto type-key text-t2" title="Показаны последние записи">последние {journal.length}</span>
              </div>
              <ol aria-label="Записи журнала" className="min-h-0 overflow-auto flex flex-col px-2">
                {journal.map(e => (
                  <li key={e.id} data-undone={e.undone || undefined} className="flex flex-col">
                    <JournalEntry {...entryProps(e)} />
                  </li>
                ))}
              </ol>
            </>
          )}
        </aside>
        ) : null}
      </div>

      {combat ? (
        <div ref={barRef} className="flex-none">
          <InitiativeBar
            round={encounter.round}
            entries={initiative}
            activeId={activeId}
            selectedId={selectedId}
            onOpen={openFromToken(barRef)}
            onNextTurn={dmView ? () => api.nextTurn() : undefined}
            onEnd={dmView ? () => api.endEncounter() : undefined}
          />
        </div>
      ) : null}
    </main>
    </PlayerFrame>
  );
}

export default DeskPage;
