// HpControl: управление хитами одного актёра — поле числа, урон / лечение / временные, быстрые
// кнопки, полоса с вспышкой, пипки спасбросков при 0 HP, промпт концентрации после урона.
// Хиты живут в State: компонент их не хранит и не клампит (это делает редьюсер) — он зовёт
// колбэки, а страница мапит их на store.damage / heal / tempHp. Вспышка и «последний урон» приходят
// из лога пропсами: отменённый урон гасит промпт сам, потому что его больше нет в логе. Локальное
// состояние здесь — черновик в поле и «на какой урон мастер уже ответил»: это вид, не домен.
// HpPopover — та же панель под Radix Popover: поведение (якорь, Esc, фокус) от Radix, вид свой.

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { undoneIds, type Actor, type DomainEvent, type PayloadByType } from '../engine';
import { Icon } from '../icons/Icon';
import { concentrationSaveDc } from '../rules/srd';
import { concentrationHoldChance, percent } from '../rules/srd/odds';
import { DeathSaves } from './DeathSaves';
import { HpBar, type HpFlash } from './HpBar';

/** Последний действующий (не отменённый) урон по актёру: id события и величина — для DC концентрации. */
export interface DamageRef {
  id: string;
  amount: number;
}

/** Проекция лога: последний DAMAGE_APPLIED по актёру, который сейчас не отменён; нет такого — null. */
export function lastDamageOf(events: readonly DomainEvent[], targetId: string): DamageRef | null {
  const undone = undoneIds(events);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== 'DAMAGE_APPLIED' || e.undoes || e.redoes || undone.has(e.id)) continue;
    const p = e.payload as PayloadByType['DAMAGE_APPLIED'];
    if (p.targetId === targetId) return { id: e.id, amount: p.amount };
  }
  return null;
}

export interface HpControlProps {
  actor: Actor;
  /** Величина всегда целая и больше нуля — кнопки недоступны иначе, до колбэка неверное не доходит. */
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onTempHp: (amount: number) => void;
  /** Вспышка полосы — из лога (useHpFlashes на странице); таймер держит она же. */
  flash?: HpFlash;
  /**
   * Последний действующий урон по актёру из лога (lastDamageOf). Промпт концентрации задаётся про него,
   * если он появился после открытия панели и мастер ещё не ответил; отмена урона снимает промпт.
   */
  lastDamage?: DamageRef | null;
  /**
   * Ответ мастера на промпт концентрации после урона. События для концентрации нет (HANDOFF §7),
   * поэтому колбэки, а не dispatch; без них промпт всё равно задаёт вопрос и гаснет по ответу.
   */
  onConcentrationKept?: () => void;
  onConcentrationLost?: () => void;
  /** Roll the CON concentration save; the caller logs the d20 and applies any enabled campaign effects. */
  onConcentrationCheck?: () => number | undefined;
  /**
   * Спасбросок CON актёра (лист или блок) — промпт пишет «удержит с шансом N%» (ROADMAP 5.5). Нет — только DC.
   * Только у мастера: у монстра это число блока (Q1), а промпт — в попапе хитов мастера.
   */
  conSave?: number;
  /**
   * 0 хитов при концентрации: без сознания — концентрация падает без спасброска (SRD), но система не снимает
   * её сама (HANDOFF §7) — предлагает «Снять», событие пишет мастер (CONCENTRATION_ENDED, unconscious).
   */
  onConcentrationDropped?: () => void;
  /** Спасброски от смерти — в State их нет; пока не передано, при 0 HP показывается 0/0. */
  deathSaves?: { saves: number; fails: number };
  /** Строка сопротивлений и уязвимостей — из карточки; в State её нет, без неё секции нет. */
  resist?: string;
  /** Панель на месте — bevel; всплывшая над картой — float, единственная внешняя тень системы. */
  surface?: 'panel' | 'float';
  className?: string;
}

/** Черновик поля → величина: только целое больше нуля. Всё прочее — null, и кнопки недоступны. */
export function parseAmount(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Поле принимает только цифры: всё прочее вырезается на вводе, как в прототипе; длина — до четырёх. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/** Быстрые кнопки прототипа: три урона и одни временные. Минус — U+2212, как в плитке. */
export const QUICK_DAMAGE = [1, 5, 10] as const;
export const QUICK_TEMP = 5;

const MINUS = '\u2212';

/**
 * Сколько отвеченных уронов панель помнит. Хватает на отмену нескольких ударов подряд; глубже —
 * вопрос задаётся снова, и это дешевле, чем список, растущий всю сессию.
 */
export const ANSWERED_KEEP = 8;

/* Классы — целыми строками: Tailwind ищет их в исходнике. */
const BTN = [
  'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer',
  'enabled:hover:text-gd-hi enabled:active:shadow-bevel-in',
  'focus-visible:shadow-[var(--bevel),var(--glow-gold)]',
  'disabled:cursor-default disabled:opacity-(--op-disabled)',
].join(' ');
const PLATE = 'bg-linear-to-b from-pl to-cd enabled:hover:from-pl enabled:hover:to-pl';
/** Нижний кант цвета действия под фаской: цвет текста и грани — один и тот же смысл дважды. */
const BTN_DAMAGE = `${BTN} ${PLATE} text-fx-damage-hi shadow-[var(--bevel),inset_0_-2px_0_var(--fx-damage)]`;
const BTN_HEAL = `${BTN} ${PLATE} text-fx-heal-hi shadow-[var(--bevel),inset_0_-2px_0_var(--fx-heal)]`;
const BTN_TEMP = `${BTN} ${PLATE} text-fx-buff-hi shadow-[var(--bevel),inset_0_-2px_0_var(--fx-temp)]`;
const BTN_GHOST = `${BTN} bg-cd text-t2 shadow-bevel`;

const INPUT = [
  'w-16 h-8 px-2 py-0.5 text-center type-num-24 text-tx bg-wl shadow-bevel-in',
  'focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]',
].join(' ');

const SURFACE: Record<NonNullable<HpControlProps['surface']>, string> = {
  panel: 'shadow-bevel',
  float: 'shadow-float',
};

export function HpControl({
  actor, onDamage, onHeal, onTempHp, flash = null, lastDamage = null, onConcentrationKept, onConcentrationLost, onConcentrationCheck, onConcentrationDropped,
  deathSaves, resist, surface = 'panel', className, conSave,
}: HpControlProps) {
  const [draft, setDraft] = useState('');
  // Уроны, на которые ответ уже дан. Урон, бывший в логе при открытии панели, — история, вопрос не про него.
  // Хранятся id событий, а не величина: отменённый урон уходит из lastDamage, и промпт гаснет сам —
  // как и при уходе концентрации из актёра. Список короткий (ANSWERED_KEEP) и начинается заново,
  // когда панель переключили на другого актёра: его последний урон — тоже история.
  const [answered, setAnswered] = useState<readonly string[]>(() => (lastDamage ? [lastDamage.id] : []));
  const [answeredFor, setAnsweredFor] = useState(actor.id);
  if (answeredFor !== actor.id) {
    setAnsweredFor(actor.id);
    setAnswered(lastDamage ? [lastDamage.id] : []);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const amount = parseAmount(draft);
  const down = actor.hp.current === 0;
  const concentration = actor.concentration;
  // На нуле хитов спасбросок не нужен: без сознания концентрация падает — вместо DC предлагается снять её.
  const savePrompt = concentration && !down && lastDamage && !answered.includes(lastDamage.id)
    ? { spell: concentration.spell, dc: concentrationSaveDc(lastDamage.amount), hold: conSave === undefined ? undefined : concentrationHoldChance(conSave, lastDamage.amount) }
    : null;
  const dropPrompt = concentration && down ? concentration.spell : null;

  const damage = (n: number) => onDamage(n);
  /** После ввода поле очищается и остаётся в фокусе: следующий удар — следующее число. */
  const applyTyped = (fn: (n: number) => void) => {
    if (amount === null) return;
    fn(amount);
    setDraft('');
    inputRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter — урон по умолчанию: за столом это самое частое действие. Esc остаётся Radix.
    if (e.key === 'Enter') {
      e.preventDefault();
      applyTyped(damage);
    }
  };
  const answer = (fn?: () => void) => {
    if (lastDamage) setAnswered(a => [...a, lastDamage.id].slice(-ANSWERED_KEEP));
    fn?.();
  };
  const rollConcentrationCheck = () => {
    if (!savePrompt || !onConcentrationCheck) return;
    const total = onConcentrationCheck();
    if (total === undefined) return;
    answer(total >= savePrompt.dc ? onConcentrationKept : onConcentrationLost);
  };

  return (
    <div className={`flex w-72 flex-col gap-2 bg-pn p-3 ${SURFACE[surface]}${className ? ` ${className}` : ''}`}>
      <div className="type-h-20 truncate text-tx" title={actor.name}>{actor.name}</div>

      <HpBar hp={actor.hp} label={actor.name} flash={flash} />

      {/* 0 HP: у персонажа и NPC — спасброски от смерти; монстр по умолчанию SRD просто выбыл. */}
      {down && actor.kind !== 'monster' ? (
        <div className="flex items-center gap-2">
          <DeathSaves saves={deathSaves?.saves ?? 0} fails={deathSaves?.fails ?? 0} />
          <span className="type-body-xs text-t2 truncate">Спасброски от смерти</span>
        </div>
      ) : null}
      {down && actor.kind === 'monster' ? (
        <div className="type-body-xs text-t2">Выбыл: 0 хитов</div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          aria-label="Величина"
          value={draft}
          onChange={e => setDraft(digitsOnly(e.target.value))}
          onKeyDown={onKeyDown}
          className={INPUT}
        />
        <div className="flex items-center gap-1">
          <button type="button" title="Урон на введённое число · Enter" disabled={amount === null} onClick={() => applyTyped(damage)} className={BTN_DAMAGE}>Урон</button>
          <button type="button" title="Лечение на введённое число" disabled={amount === null} onClick={() => applyTyped(onHeal)} className={BTN_HEAL}>Лечение</button>
          <button type="button" title="Временные хиты: введённое число (не складываются — берётся большее)" disabled={amount === null} onClick={() => applyTyped(onTempHp)} className={BTN_TEMP}>Врем.</button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {QUICK_DAMAGE.map(n => (
          <button key={n} type="button" aria-label={`Урон ${n}`} title={`Урон ${n}`} onClick={() => damage(n)} className={BTN_GHOST}>
            {MINUS}{n}
          </button>
        ))}
        <button type="button" aria-label={`Временные хиты ${QUICK_TEMP}`} title={`Временные хиты ${QUICK_TEMP}`} onClick={() => onTempHp(QUICK_TEMP)} className={BTN_GHOST}>
          Врем. +{QUICK_TEMP}
        </button>
      </div>

      {savePrompt ? (
        <div role="group" aria-label="Проверка концентрации" className="flex flex-col gap-1">
          <div className="flex items-start gap-2 type-body-sm">
            <Icon name="ac" size={16} color="var(--fx-buff-hi)" title="Концентрация" className="mt-px" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-tx" title={savePrompt.spell}>{savePrompt.spell}</span>
              <span className="text-t2">{`Спасбросок Телосложения на концентрацию, DC ${savePrompt.dc}`}</span>
              {savePrompt.hold !== undefined && conSave !== undefined ? (
                <span
                  data-part="concentration-hold"
                  className="text-tx"
                  title={`CON ${conSave < 0 ? '−' : '+'}${Math.abs(conSave)} против DC ${savePrompt.dc}: нужно ${Math.max(1, savePrompt.dc - conSave)}+ на d20; 1 и 20 у спасброска не автоматичны`}
                >
                  {`удержит с шансом ${percent(savePrompt.hold)}`}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onConcentrationCheck && conSave !== undefined ? <button type="button" title={`Бросить CON на концентрацию: d20 ${conSave >= 0 ? '+' + conSave : conSave}, DC ${savePrompt.dc}`} onClick={rollConcentrationCheck} className={BTN_GHOST}>Бросить спасбросок</button> : null}
            <button type="button" title="Концентрация удержана" onClick={() => answer(onConcentrationKept)} className={BTN_GHOST}>Удержал</button>
            <button type="button" title="Концентрация потеряна" onClick={() => answer(onConcentrationLost)} className={BTN_GHOST}>Потерял</button>
          </div>
        </div>
      ) : null}

      {dropPrompt ? (
        <div role="group" aria-label="Концентрация без сознания" className="flex items-center gap-2">
          <Icon name="cond-unconscious" size={16} color="var(--fx-damage-hi)" title="Без сознания" className="flex-none" />
          <div className="flex min-w-0 flex-1 flex-col type-body-sm">
            <span className="truncate text-tx" title={dropPrompt}>{dropPrompt}</span>
            <span className="text-t2">Без сознания — концентрация падает</span>
          </div>
          {onConcentrationDropped ? (
            <button type="button" title="Снять концентрацию: без сознания" onClick={onConcentrationDropped} className={BTN_GHOST}>Снять</button>
          ) : null}
        </div>
      ) : null}

      {resist ? (
        <div className="flex items-center gap-2 type-body-sm text-t2">
          <Icon name="ac" size={16} color="var(--fx-buff-hi)" title="Сопротивления и уязвимости" />
          <span className="truncate" title={resist}>{resist}</span>
        </div>
      ) : null}
    </div>
  );
}

export interface HpPopoverProps extends Omit<HpControlProps, 'surface' | 'className'> {
  /** Якорь: строка корешка, ячейка HP карточки, токен — любой элемент, принимающий ref и onClick. */
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

/**
 * Попап хитов: Radix даёт якорь, портал, Esc, клик вне и фокус на первом поле (это поле числа —
 * мастер сразу печатает). Содержимое — HpControl над картой, поэтому тень float.
 */
export function HpPopover({ children, open, onOpenChange, side = 'top', align = 'start', ...control }: HpPopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          aria-label={`Хиты: ${control.actor.name}`}
          className="z-20 outline-none"
        >
          <HpControl {...control} surface="float" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default HpControl;
