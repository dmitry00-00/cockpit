// Темп времени (F6, полоса часов справа): семь ступеней от раунда до года и кнопка «Шаг». Переключатель —
// Radix ToggleGroup (HANDOFF §8): поведение, стрелки и фокус от примитива, вид свой. Значение снять нельзя:
// у часов всегда есть темп, поэтому пустое значение от Radix игнорируется. В бою темп — раунды: переключатель
// недоступен, шаг доступен — раунд тоже двигает время. Компонент ничего не хранит о мире: темп и колбэки
// приходят пропсами; собственное состояние — только поле «сколько шагов», которое открывает долгое
// нажатие (≥ STEP_LONG_PRESS_MS) или Shift+клик, — это вид, не мир. Клавиша T живёт на странице, здесь она
// в тултипе и aria-keyshortcuts. Пиктограмм нет: шаг — словом с иконкой tempo. Строки классов полные:
// Tailwind ищет их в исходнике.

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ToggleGroup } from 'radix-ui';
import type { Tempo } from '../engine';
import { Icon } from '../icons/Icon';

/** Семь темпов от раунда к году — порядок переключателя (HANDOFF §8). */
export const TEMPO_ORDER: readonly Tempo[] = ['round', '10min', 'hour', 'day', 'tenday', 'season', 'year'];

export const TEMPO_LABELS: Readonly<Record<Tempo, string>> = {
  round: 'Раунд',
  '10min': '10 мин',
  hour: 'Час',
  day: 'День',
  tenday: 'Десятидневка',
  season: 'Сезон',
  year: 'Год',
};

/** Долгое нажатие на «Шаг» открывает поле числа шагов. */
export const STEP_LONG_PRESS_MS = 500;
/** Границы поля «сколько шагов». */
export const STEPS_MIN = 1;
export const STEPS_MAX = 99;

export interface TimeTempoProps {
  value: Tempo;
  onChange: (tempo: Tempo) => void;
  /** «Шаг» — один шаг; долгое нажатие или Shift+клик открывает поле «сколько шагов», Enter → onStep(n). */
  onStep: (steps: number) => void;
  /** В бою темп — раунды: переключатель недоступен, шаг доступен. */
  disabled?: boolean;
  className?: string;
}

/** Черновик поля → число шагов: только целое от STEPS_MIN до STEPS_MAX, иначе null и Enter ничего не делает. */
export function parseSteps(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= STEPS_MIN && n <= STEPS_MAX ? n : null;
}

/** Поле принимает только цифры; три знака, чтобы «100» дошло до проверки и было отвергнуто, а не обрезано молча. */
const stepDigits = (raw: string) => raw.replace(/\D/g, '').slice(0, 3);

/* Ступень темпа — плита cd с фаской на подложке lo; включённая — золото и нижняя полоса 3px gd (форма, не только цвет). */
const OPT = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd cursor-pointer disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT_OFF = 'text-t2 shadow-bevel enabled:hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';

/* Кнопка — как BTN на столе: строка целиком. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';

/* Поле «сколько шагов» — утопленное, в рост кнопки (16 + 2×4 = 24px). */
const INPUT = 'w-12 px-1 py-1 text-center type-num-12 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

export function TimeTempo({ value, onChange, onStep, disabled = false, className = '' }: TimeTempoProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Долгое нажатие уже открыло поле — click, который придёт следом за отпусканием, шаг не делает. */
  const held = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const openField = () => {
    setDraft('');
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setDraft('');
  };

  const onPointerDown = () => {
    clearTimer();
    held.current = false;
    timer.current = setTimeout(() => {
      timer.current = null;
      held.current = true;
      openField();
    }, STEP_LONG_PRESS_MS);
  };
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    clearTimer();
    if (held.current) {
      held.current = false;
      return;
    }
    if (e.shiftKey) {
      openField();
      return;
    }
    onStep(1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const n = parseSteps(draft);
      if (n === null) return;
      onStep(n);
      close();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div role="group" aria-label="Темп времени" className={`flex items-center gap-2 ${className}`}>
      <ToggleGroup.Root
        type="single"
        value={value}
        onValueChange={v => {
          if (v) onChange(v as Tempo);
        }}
        disabled={disabled}
        aria-label="Темп"
        data-part="tempos"
        className="flex items-center gap-px p-px bg-lo"
      >
        {TEMPO_ORDER.map(t => (
          <ToggleGroup.Item
            key={t}
            value={t}
            title={`Темп: ${TEMPO_LABELS[t]}`}
            data-tempo={t}
            className={`${OPT} ${t === value ? OPT_ON : OPT_OFF}`}
          >
            {TEMPO_LABELS[t]}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <button
        type="button"
        data-part="step"
        aria-label="Шаг"
        aria-keyshortcuts="T"
        title="Продвинуть время на один шаг · T"
        onPointerDown={onPointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onClick={onClick}
        className={`${BTN} flex items-center gap-1`}
      >
        <Icon name="tempo" size={16} color="currentColor" title="Шаг времени" />
        <span>Шаг</span>
      </button>
      {open ? (
        <span data-part="steps" className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            aria-label="Сколько шагов"
            title={`Сколько шагов: от ${STEPS_MIN} до ${STEPS_MAX} · Enter`}
            value={draft}
            onChange={e => setDraft(stepDigits(e.target.value))}
            onKeyDown={onKeyDown}
            onBlur={close}
            className={INPUT}
          />
          {/* Подпись на плите часов — t2, не t3. */}
          <span aria-hidden="true" className="type-key text-t2">шагов</span>
        </span>
      ) : null}
    </div>
  );
}

export default TimeTempo;
