// Начало концентрации (CONCENTRATION_STARTED): заклинание и срок. Слот один (SRD): новое заклинание сменяет
// прежнее, и форма об этом говорит, если оно есть. Сроки — те, что печатает SRD у заклинаний с концентрацией
// («Concentration, up to 1 minute / 10 minutes / 1 hour / 8 hours / 24 hours»); «без срока» — когда мастер
// снимет сам. Компонент тупой: текущее заклинание и колбэк — пропсами; черновик — состояние формы, не событие.
import { useState, type KeyboardEvent } from 'react';
import { ToggleGroup } from 'radix-ui';
import { Icon } from '../icons/Icon';

/** Сроки SRD в секундах; 0 — без срока. */
export const CONCENTRATION_DURATIONS = [
  { sec: 60, label: '1 мин' },
  { sec: 600, label: '10 мин' },
  { sec: 3600, label: '1 ч' },
  { sec: 8 * 3600, label: '8 ч' },
  { sec: 24 * 3600, label: '24 ч' },
  { sec: 0, label: 'без срока' },
] as const;

export interface ConcentrationFormProps {
  /** На чём актёр концентрируется сейчас — новое заклинание его сменит. */
  current?: string;
  /** Срок в секундах или undefined без срока. */
  onStart: (spell: string, durationSec?: number) => void;
  className?: string;
}

const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';
const OPT_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';
const INPUT = 'h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

export function ConcentrationForm({ current, onStart, className = '' }: ConcentrationFormProps) {
  const [spell, setSpell] = useState('');
  const [duration, setDuration] = useState<string>('60');
  const ready = spell.trim() !== '';
  const submit = () => {
    if (!ready) return;
    const sec = Number(duration);
    onStart(spell.trim(), sec > 0 ? sec : undefined);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  return (
    <div className={`flex w-80 flex-col gap-2 bg-pn p-3 shadow-float ${className}`}>
      <div className="flex items-center gap-2">
        <Icon name="cond-concentration" size={16} color="var(--gd)" title="Концентрация" />
        <span className="type-h-17 text-tx">Концентрация</span>
      </div>
      {current ? <p className="type-body-sm text-t2">Сменит: {current}</p> : null}
      <input
        type="text"
        autoComplete="off"
        aria-label="Заклинание"
        placeholder="Заклинание — Enter начинает"
        value={spell}
        onChange={e => setSpell(e.target.value)}
        onKeyDown={onKeyDown}
        className={INPUT}
      />
      <ToggleGroup.Root
        type="single"
        value={duration}
        onValueChange={v => { if (v) setDuration(v); }}
        aria-label="Срок"
        className="flex flex-wrap items-center gap-px p-px bg-lo"
      >
        {CONCENTRATION_DURATIONS.map(d => (
          <ToggleGroup.Item key={d.sec} value={String(d.sec)} title={d.sec === 0 ? 'Пока мастер не снимет' : `Срок: ${d.label}`} className={`${OPT} ${String(d.sec) === duration ? OPT_ON : OPT_OFF}`}>
            {d.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <div className="flex items-center">
        <button type="button" title="Начать концентрацию · Enter" disabled={!ready} onClick={submit} className={`ml-auto ${BTN_MAIN}`}>
          Начать
        </button>
      </div>
    </div>
  );
}

export default ConcentrationForm;
