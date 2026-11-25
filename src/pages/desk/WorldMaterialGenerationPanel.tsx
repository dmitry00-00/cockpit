import { useState } from 'react';
import type { WorldMaterialEdition, WorldMaterialKind } from '../../rules/generation/localWorldMaterialDraft';
import { BTN } from './styles';

interface Props {
  busy: boolean;
  onGenerate: (kind: WorldMaterialKind, concept: string, edition: WorldMaterialEdition) => Promise<void>;
}

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

/** Generates linked descriptive nodes for later map/runtime work, without making canon or mechanical claims. */
export function WorldMaterialGenerationPanel({ busy, onGenerate }: Props) {
  const [kind, setKind] = useState<WorldMaterialKind>('dungeon');
  const [edition, setEdition] = useState<WorldMaterialEdition>('2014');
  const [concept, setConcept] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!concept.trim() || busy) return;
    setError('');
    try { await onGenerate(kind, concept.trim(), edition); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <details className="mt-2 bg-cd p-2 shadow-bevel">
      <summary className="cursor-pointer type-body-sm text-tx">Черновик подземелья или локации · HB</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="type-body-xs text-t2">Локальная модель создаёт связный описательный граф областей. Она не задаёт числа, население, координаты, цены, существ, ловушки или игровые правила. Принятый материал останется в каталоге: карта и место кампании автоматически не создаются.</p>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Тип материала
          <select aria-label="Тип места для генерации" className={INPUT} value={kind} onChange={event => setKind(event.target.value as WorldMaterialKind)} disabled={busy}>
            <option value="dungeon">Подземелье</option>
            <option value="location">Локация</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Целевая версия правил
          <select aria-label="Версия правил материала" className={INPUT} value={edition} onChange={event => setEdition(event.target.value as WorldMaterialEdition)} disabled={busy}>
            <option value="2014">D&amp;D 5e · 2014 · слой HB</option>
            <option value="2024">D&amp;D 5e · 2024 · слой HB</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Концепт
          <textarea aria-label="Концепт подземелья или локации" className={`${INPUT} min-h-16 resize-y`} maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Например: заброшенная обсерватория над подземной рекой" />
        </label>
        <button type="button" className={BTN} disabled={busy || !concept.trim()} onClick={() => void submit()}>
          {busy ? 'Локальная модель строит граф…' : 'Создать предложение'}
        </button>
        {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">{error}</p> : null}
      </div>
    </details>
  );
}
