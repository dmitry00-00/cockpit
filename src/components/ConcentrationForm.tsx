// Начало концентрации (CONCENTRATION_STARTED): заклинание и срок. Слот один (SRD): новое заклинание сменяет
// прежнее, и форма об этом говорит, если оно есть. Сроки — те, что печатает SRD у заклинаний с концентрацией
// («Concentration, up to 1 minute / 10 minutes / 1 hour / 8 hours / 24 hours»); «без срока» — когда мастер
// снимет сам. Компонент тупой: текущее заклинание и колбэк — пропсами; черновик — состояние формы, не событие.
// Заклинания листа с концентрацией (ROADMAP 5.5, Q9) — кнопками над вводом: щелчок ставит имя и срок SRD; свободный
// ввод остаётся для предметов и умений. Срок вне ряда (1 раунд у одного заклинания SRD, 2 ч у другого) — своей кнопкой.
import { useState, type KeyboardEvent } from 'react';
import { ToggleGroup } from 'radix-ui';
import { Icon } from '../icons/Icon';
import { CONCENTRATION_DURATIONS, durationLabel, type ConcentrationOption } from './concentration';

export { CONCENTRATION_DURATIONS, durationLabel, type ConcentrationOption } from './concentration';

export interface ConcentrationFormProps {
  /** На чём актёр концентрируется сейчас — новое заклинание его сменит. */
  current?: string;
  /** Заклинания листа с концентрацией; нет — только ввод. */
  options?: readonly ConcentrationOption[];
  /** Срок в секундах или undefined без срока. */
  onStart: (spell: string, durationSec?: number) => void;
  className?: string;
}

const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';
/** Имя заклинания — текст, а не код: обычный кегль, без капса. */
const NAME_OPT = 'type-body-sm whitespace-nowrap px-2 py-0.5 cursor-pointer bg-linear-to-b from-pl to-cd';
const OPT_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';
const INPUT = 'h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

export function ConcentrationForm({ current, options = [], onStart, className = '' }: ConcentrationFormProps) {
  const [spell, setSpell] = useState('');
  const [duration, setDuration] = useState<string>('60');
  const durations: readonly { sec: number; label: string }[] = CONCENTRATION_DURATIONS.some(d => String(d.sec) === duration)
    ? CONCENTRATION_DURATIONS
    : [...CONCENTRATION_DURATIONS.slice(0, -1), { sec: Number(duration), label: durationLabel(Number(duration)) }, CONCENTRATION_DURATIONS.at(-1)!].sort((a, b) => (a.sec || Infinity) - (b.sec || Infinity));
  const pick = (o: ConcentrationOption) => {
    setSpell(o.name);
    setDuration(String(o.durationSec ?? 0));
  };
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
      {options.length > 0 ? (
        <div role="group" aria-label="С листа" className="flex flex-wrap gap-px p-px bg-lo">
          {options.map(o => {
            const on = spell === o.name;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                title={`${o.name} · SRD: ${o.duration}`}
                onClick={() => pick(o)}
                className={`${NAME_OPT} ${on ? OPT_ON : OPT_OFF}`}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      ) : null}
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
        {durations.map(d => (
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
