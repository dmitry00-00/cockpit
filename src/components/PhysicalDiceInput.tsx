import { useState, type FormEvent } from 'react';
import { Icon } from '../icons/Icon';
import { emitFeedback } from '../feedback/feedback';

const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const SUBMIT_BUTTON = 'type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

export interface PhysicalDiceResult {
  sides: number;
  face: number;
  modifier: number;
  label: string;
}

export interface PhysicalDiceInputProps {
  hidden: boolean;
  onRoll: (result: PhysicalDiceResult) => void;
}

/** Manual bridge for ordinary table dice; connected-die input will use the same event contract. */
export function PhysicalDiceInput({ hidden, onRoll }: PhysicalDiceInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [sides, setSides] = useState<number>(20);
  const [face, setFace] = useState('');
  const [modifier, setModifier] = useState('0');
  const [label, setLabel] = useState('Проверка');
  const [feedback, setFeedback] = useState<{ face: number; sides: number; total: number; modifier: number } | null>(null);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const commit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = Number(face);
    const mod = Number(modifier);
    if (!Number.isSafeInteger(result) || result < 1 || result > sides || !Number.isSafeInteger(mod)) return;
    const normalizedLabel = label.trim() || 'Проверка';
    onRoll({ sides, face: result, modifier: mod, label: normalizedLabel });
    emitFeedback('confirm', 'master');
    setFeedback({ face: result, sides, total: result + mod, modifier: mod });
    setFace('');
    if (speakEnabled && canSpeak) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(String(result + mod)));
    }
  };

  return (
    <section
      aria-label="Физический дайс"
      onKeyDown={event => { if (event.key === 'Escape' && expanded) setExpanded(false); }}
      className="mx-2 mb-2 bg-pl shadow-plate"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="w-full flex items-center gap-2 px-2 py-2 text-left type-body-sm text-tx cursor-pointer focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
      >
        <Icon name="dice" size={16} color="var(--gd)" title="Физический бросок" />
        <span className="flex-1">Физический дайс</span>
        <span className="type-num-12 text-t2">{expanded ? '−' : '+'}</span>
      </button>
      {expanded ? (
        <div className="px-2 pb-2 flex flex-col gap-2">
          <p className="type-body-xs text-t2">
            Введите верхнюю грань после броска. Результат попадёт в журнал как физический; Bluetooth-дайс пока не подключён.
          </p>
          <form onSubmit={commit} data-feedback-skip className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <label className="flex-1 flex flex-col gap-1 type-body-xs text-t2">
                Кость
                <select aria-label="Тип физической кости" value={sides} onChange={event => { setSides(Number(event.target.value)); setFeedback(null); }} className="min-h-8 px-2 bg-cd text-tx">
                  {DIE_SIDES.map(value => <option key={value} value={value}>d{value}</option>)}
                </select>
              </label>
              <label className="w-20 flex flex-col gap-1 type-body-xs text-t2">
                Грань
                <input aria-label="Верхняя грань физической кости" type="number" min={1} max={sides} step={1} required value={face} onChange={event => setFace(event.target.value)} className="min-h-8 px-2 bg-cd text-tx" />
              </label>
              <label className="w-20 flex flex-col gap-1 type-body-xs text-t2">
                Модиф.
                <input aria-label="Модификатор физического броска" type="number" min={-100} max={100} step={1} value={modifier} onChange={event => setModifier(event.target.value)} className="min-h-8 px-2 bg-cd text-tx" />
              </label>
            </div>
            <label className="flex flex-col gap-1 type-body-xs text-t2">
              Подпись
              <input aria-label="Подпись физического броска" value={label} onChange={event => setLabel(event.target.value)} maxLength={100} className="min-h-8 px-2 bg-cd text-tx" />
            </label>
            <label className="flex items-center gap-2 type-body-xs text-t2">
              <input type="checkbox" disabled={!canSpeak} checked={speakEnabled} onChange={event => setSpeakEnabled(event.target.checked)} />
              Озвучивать подтверждённый итог{canSpeak ? '' : ' · недоступно'}
            </label>
            <button type="submit" className={SUBMIT_BUTTON}>Подтвердить физический бросок</button>
          </form>
          {feedback ? (
            <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-2 px-2 py-1 bg-cd shadow-bevel-in">
              <Icon name="check" size={16} color="var(--gd)" title="Результат записан" />
              <span className="type-body-sm text-t2">d{feedback.sides}: {feedback.face}{feedback.modifier ? ` ${feedback.modifier > 0 ? '+' : '−'} ${Math.abs(feedback.modifier)} = ${feedback.total}` : ''}</span>
              <strong className="ml-auto type-num-32 text-gd">{feedback.total}</strong>
            </div>
          ) : null}
          {hidden ? <p className="type-body-xs text-t2">Текущий режим скрытых бросков применится и к этому результату.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export default PhysicalDiceInput;
