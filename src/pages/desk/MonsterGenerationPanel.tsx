import { useEffect, useState } from 'react';
import type { Monster } from '../../rules/srd/monsters';
import { monsterOrigin } from '../../rules/srd/monsters';
import { BTN } from './styles';

interface Props {
  monsters: readonly Monster[];
  ready: boolean;
  busy: boolean;
  onGenerate: (monster: Monster, concept: string) => Promise<void>;
}

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

/** Generates narrative-only reskins; all mechanics stay copied from an SRD source record. */
export function MonsterGenerationPanel({ monsters, ready, busy, onGenerate }: Props) {
  const options = monsters.filter(monster => monsterOrigin(monster) === 'srd');
  const [baseId, setBaseId] = useState('');
  const [concept, setConcept] = useState('');
  const [error, setError] = useState('');
  const selected = options.find(monster => monster.id === baseId) ?? options[0];

  useEffect(() => {
    if (!options.some(monster => monster.id === baseId) && options[0]) setBaseId(options[0].id);
  }, [baseId, options]);

  const submit = async () => {
    if (!selected || !concept.trim() || busy || !ready) return;
    setError('');
    try { await onGenerate(selected, concept.trim()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <details className="mt-2 bg-cd p-2 shadow-bevel">
      <summary className="cursor-pointer type-body-sm text-tx">Создать вариацию SRD-монстра</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="type-body-xs text-t2">Локальная модель создаёт только имя и описание. Размеры механики остаются из выбранного SRD-блока; выход попадёт во «Входящие» как предложение.</p>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Базовый блок
          <select aria-label="Базовый SRD-монстр" className={INPUT} value={selected?.id ?? ''} onChange={event => setBaseId(event.target.value)} disabled={!ready || busy || !options.length}>
            {options.map(monster => <option key={monster.id} value={monster.id}>{monster.name} · CR {monster.cr}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Идея образа
          <textarea aria-label="Идея образа монстра" className={`${INPUT} min-h-16 resize-y`} maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Например: болотный дозорный из корней и серого мха" />
        </label>
        <button type="button" className={BTN} disabled={!ready || busy || !selected || !concept.trim()} onClick={() => void submit()}>
          {busy ? 'Локальная модель описывает…' : 'Создать предложение'}
        </button>
        {!ready ? <p className="type-body-xs text-t2">Загружается библиотека SRD-монстров…</p> : null}
        {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">{error}</p> : null}
      </div>
    </details>
  );
}
