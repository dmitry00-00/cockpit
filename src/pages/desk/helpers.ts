// Стол: чистые проекции и подписи — дата Харптоса, иконки записей журнала, строки нитей, напоминания, факты о
// субъекте, шаги лестницы и корешки, кукла из листа. Состояние не трогают, тестируются без DOM.
import { formatHarptos } from '../../campaign';
import {
  SCALE_LABELS, placeEntityType, SKILL_LABEL, type CardStackItem, type JournalEntryProps, type ScaleStep, type SlotId, type SlotItem,
  type ThreadCardRow,
} from '../../components';
import {
  journalParts, ladderLevels, plural, type Actor, type EventType, type Faction, type JournalEntry as JournalRecord, type Ladder, type Location,
  type State, type ThreadSummary,
} from '../../engine';
import { type IconName } from '../../icons/Icon';
import { ARMOR, CONDITIONS, SHIELD, isArmorId, type ConditionId } from '../../rules/srd';
import { SPELLS } from '../../rules/srd/spells';

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

/** Хэш входа в создание персонажа: стол открывается сразу с редактором (кнопка «Создать персонажа» на экране компендиума). */
export const NEW_PC_HASH = '#/desk/new';
export const DESK_HASH = '#/desk';

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
  PARTY_TRAVELED: { icon: 'pin-road', title: 'Поход' },
  PLACE_REVEALED: { icon: 'map', title: 'Место открыто игрокам', color: 'var(--src-players)' },
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
/** Имена справочника для упоминаний в журнале: заклинания SRD (концентрация, броски) — короче четырёх букв не берём. */
export const REFERENCE_MENTIONS: readonly { ref: string; name: string }[] = Object.values(SPELLS)
  .filter(s => s.name.length >= 4).map(s => ({ ref: `spell:${s.id}`, name: s.name }));

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
    parts: journalParts(entry, state, REFERENCE_MENTIONS),
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

/** F9: какая панель раскрыта из полосы иконок и на каком пункте — состояние вида страницы. */
export type OpenRail = { side: 'party' | 'tools'; item: string } | null;
