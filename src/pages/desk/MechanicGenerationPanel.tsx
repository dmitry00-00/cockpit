import { useRef, useState } from 'react';
import type { HomebrewNumericField, ManualHomebrewNumberInput } from '../../import/generatedHomebrewMechanic';
import type { MechanicTargetEdition } from '../../rules/generation/localMechanicDraft';
import { BTN } from './styles';

interface Props {
  busy: boolean;
  onGenerate: (concept: string, edition: MechanicTargetEdition, numericInputs: readonly ManualHomebrewNumberInput[]) => Promise<void>;
}

type OriginKind = 'author-input' | 'source' | 'derived';
interface NumericDraft {
  key: string;
  field: HomebrewNumericField;
  label: string;
  value: string;
  originKind: OriginKind;
  note: string;
  sourceTitle: string;
  sourceSystem: string;
  sourceVersion: string;
  sourceLayer: string;
  locator: string;
  excerpt: string;
  formula: string;
  sourceRefs: string;
}

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const FIELD_LABELS: Record<HomebrewNumericField, string> = {
  trigger: 'Условие запуска',
  effect: 'Эффект',
  costOrLimit: 'Цена / ограничение',
  recoveryOrDuration: 'Восстановление / длительность',
};

function emptyNumericDraft(key: string): NumericDraft {
  return {
    key, field: 'effect', label: '', value: '', originKind: 'author-input', note: '',
    sourceTitle: '', sourceSystem: 'D&D 5e', sourceVersion: '', sourceLayer: '', locator: '', excerpt: '', formula: '', sourceRefs: '',
  };
}

function toNumericInput(draft: NumericDraft): ManualHomebrewNumberInput {
  const label = draft.label.trim();
  const value = draft.value.trim();
  if (!label || label.length > 80) throw new Error('Для каждого числа добавь краткую метку и назначение (до 80 символов).');
  if (!value || value.length > 80 || !/\p{N}/u.test(value)) throw new Error('Введи числовое выражение: например, 2d6, DC 15 или 30 футов.');
  const common = { field: draft.field, label, value };
  if (draft.originKind === 'author-input') {
    if (draft.note.length > 300) throw new Error('Комментарий автора должен быть короче 300 символов.');
    return { ...common, origin: { kind: 'author-input', ...(draft.note.trim() ? { note: draft.note.trim() } : {}) } };
  }
  if (draft.originKind === 'source') {
    const title = draft.sourceTitle.trim(), system = draft.sourceSystem.trim(), version = draft.sourceVersion.trim();
    const layer = draft.sourceLayer.trim(), locator = draft.locator.trim();
    if (!title || !system || !version || !layer || !locator) throw new Error('Для числа из источника укажи название, систему, версию, слой и точный локатор.');
    if ([title, system, version, layer, locator].some(part => part.length > 240) || draft.excerpt.length > 500) throw new Error('Данные источника превышают допустимую длину.');
    return { ...common, origin: { kind: 'source', title, system, version, layer, locator, ...(draft.excerpt.trim() ? { excerpt: draft.excerpt.trim() } : {}) } };
  }
  const formula = draft.formula.trim();
  const sourceRefs = draft.sourceRefs.split('\n').map(ref => ref.trim()).filter(Boolean);
  if (!formula || formula.length > 240 || sourceRefs.length === 0 || sourceRefs.length > 12 || sourceRefs.some(ref => ref.length > 240)) {
    throw new Error('Для расчётного числа укажи формулу и хотя бы одну ссылку на исходное значение.');
  }
  return { ...common, origin: { kind: 'derived', formula, sourceRefs } };
}

/** Model-generated clauses stay number-free; numeric HB claims are entered separately and remain non-executable. */
export function MechanicGenerationPanel({ busy, onGenerate }: Props) {
  const [edition, setEdition] = useState<MechanicTargetEdition>('2014');
  const [concept, setConcept] = useState('');
  const [numericDrafts, setNumericDrafts] = useState<NumericDraft[]>([]);
  const [error, setError] = useState('');
  const nextKey = useRef(0);

  const updateNumeric = (key: string, patch: Partial<NumericDraft>) =>
    setNumericDrafts(current => current.map(item => item.key === key ? { ...item, ...patch } : item));
  const addNumeric = () => {
    if (numericDrafts.length >= 24) { setError('В одном черновике можно атрибутировать не более 24 чисел.'); return; }
    setNumericDrafts(current => [...current, emptyNumericDraft(`number-${++nextKey.current}`)]);
    setError('');
  };

  const submit = async () => {
    if (!concept.trim() || busy) return;
    setError('');
    try {
      const numericInputs = numericDrafts.map(toNumericInput);
      await onGenerate(concept.trim(), edition, numericInputs);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <details className="mt-2 bg-cd p-2 shadow-bevel">
      <summary className="cursor-pointer type-body-sm text-tx">Предложить новую механику · HB</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="type-body-xs text-t2">Локальная модель предлагает назначение, условие, эффект и ограничение без чисел. Числа вводятся отдельно, с происхождением; они сохраняются как черновые данные и не исполняются в игре.</p>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Целевая версия правил
          <select aria-label="Версия правил механики" className={INPUT} value={edition} onChange={event => setEdition(event.target.value as MechanicTargetEdition)} disabled={busy}>
            <option value="2014">D&amp;D 5e · 2014 · слой HB</option>
            <option value="2024">D&amp;D 5e · 2024 · слой HB</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 type-body-xs text-t2">
          Концепт
          <textarea aria-label="Концепт новой механики" className={`${INPUT} min-h-16 resize-y`} maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Например: защитная реакция, которая помогает прикрыть союзника, но создаёт тактический риск" />
        </label>
        <section aria-label="Ручные числа HB" className="flex flex-col gap-2 border border-bd p-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="type-body-sm text-tx">Числа и их атрибуция</h3>
            <button type="button" className={BTN} onClick={addNumeric} disabled={busy || numericDrafts.length >= 24}>Добавить число</button>
          </div>
          {numericDrafts.length === 0 ? <p className="type-body-xs text-t2">Пока без чисел. Авторский ввод, точная ссылка на источник и расчётная формула сохраняются разными типами происхождения.</p> : null}
          {numericDrafts.map((draft, index) => (
            <fieldset key={draft.key} className="flex flex-col gap-2 bg-wl p-2 shadow-bevel-in">
              <legend className="px-1 type-body-xs text-t2">HB-число {index + 1}</legend>
              <label className="flex flex-col gap-1 type-body-xs text-t2">
                Часть механики
                <select aria-label={`Часть механики для числа ${index + 1}`} className={INPUT} value={draft.field} onChange={event => updateNumeric(draft.key, { field: event.target.value as HomebrewNumericField })} disabled={busy}>
                  {Object.entries(FIELD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 type-body-xs text-t2">
                Метка значения
                <input aria-label={`Метка числа ${index + 1}`} className={INPUT} maxLength={80} value={draft.label} onChange={event => updateNumeric(draft.key, { label: event.target.value })} placeholder="Например: урон, DC, дистанция, число применений" disabled={busy} />
              </label>
              <label className="flex flex-col gap-1 type-body-xs text-t2">
                Число / выражение
                <input aria-label={`Значение числа ${index + 1}`} className={INPUT} maxLength={80} value={draft.value} onChange={event => updateNumeric(draft.key, { value: event.target.value })} placeholder="Например: 2d6, DC 15 или 30 футов" disabled={busy} />
              </label>
              <label className="flex flex-col gap-1 type-body-xs text-t2">
                Происхождение числа
                <select aria-label={`Происхождение числа ${index + 1}`} className={INPUT} value={draft.originKind} onChange={event => updateNumeric(draft.key, { originKind: event.target.value as OriginKind })} disabled={busy}>
                  <option value="author-input">Авторский ввод · правило стола HB</option>
                  <option value="source">Опубликованный источник</option>
                  <option value="derived">Расчёт по формуле</option>
                </select>
              </label>
              {draft.originKind === 'author-input' ? (
                <>
                  <p className="type-body-xs text-t2">Будет записано как ручной ввод для D&amp;D 5e / {edition}, слой HB.</p>
                  <label className="flex flex-col gap-1 type-body-xs text-t2">
                    Пояснение автора · необязательно
                    <input aria-label={`Пояснение автора числа ${index + 1}`} className={INPUT} maxLength={300} value={draft.note} onChange={event => updateNumeric(draft.key, { note: event.target.value })} disabled={busy} />
                  </label>
                </>
              ) : null}
              {draft.originKind === 'source' ? (
                <>
                  <label className="flex flex-col gap-1 type-body-xs text-t2">Название источника<input aria-label={`Название источника числа ${index + 1}`} className={INPUT} maxLength={240} value={draft.sourceTitle} onChange={event => updateNumeric(draft.key, { sourceTitle: event.target.value })} disabled={busy} /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 type-body-xs text-t2">Система<input aria-label={`Система источника числа ${index + 1}`} className={INPUT} maxLength={240} value={draft.sourceSystem} onChange={event => updateNumeric(draft.key, { sourceSystem: event.target.value })} disabled={busy} /></label>
                    <label className="flex flex-col gap-1 type-body-xs text-t2">Версия<input aria-label={`Версия источника числа ${index + 1}`} className={INPUT} maxLength={240} value={draft.sourceVersion} onChange={event => updateNumeric(draft.key, { sourceVersion: event.target.value })} disabled={busy} /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 type-body-xs text-t2">Слой<input aria-label={`Слой источника числа ${index + 1}`} className={INPUT} maxLength={240} value={draft.sourceLayer} onChange={event => updateNumeric(draft.key, { sourceLayer: event.target.value })} disabled={busy} /></label>
                    <label className="flex flex-col gap-1 type-body-xs text-t2">Локатор · страница / раздел / JSON Pointer<input aria-label={`Локатор источника числа ${index + 1}`} className={INPUT} maxLength={240} value={draft.locator} onChange={event => updateNumeric(draft.key, { locator: event.target.value })} disabled={busy} /></label>
                  </div>
                  <label className="flex flex-col gap-1 type-body-xs text-t2">Короткая цитата · необязательно<textarea aria-label={`Цитата источника числа ${index + 1}`} className={`${INPUT} min-h-12 resize-y`} maxLength={500} value={draft.excerpt} onChange={event => updateNumeric(draft.key, { excerpt: event.target.value })} disabled={busy} /></label>
                </>
              ) : null}
              {draft.originKind === 'derived' ? (
                <>
                  <label className="flex flex-col gap-1 type-body-xs text-t2">Формула · запись, не исполняется<input aria-label={`Формула числа ${index + 1}`} className={INPUT} maxLength={240} value={draft.formula} onChange={event => updateNumeric(draft.key, { formula: event.target.value })} placeholder="Например: базовое значение + модификатор" disabled={busy} /></label>
                  <label className="flex flex-col gap-1 type-body-xs text-t2">Источники входных значений · по одному на строку<textarea aria-label={`Источники расчёта числа ${index + 1}`} className={`${INPUT} min-h-12 resize-y`} value={draft.sourceRefs} onChange={event => updateNumeric(draft.key, { sourceRefs: event.target.value })} placeholder="Ссылка на каждую исходную величину" disabled={busy} /></label>
                </>
              ) : null}
              <button type="button" className={`${BTN} self-start`} onClick={() => setNumericDrafts(current => current.filter(item => item.key !== draft.key))} disabled={busy}>Убрать число</button>
            </fieldset>
          ))}
        </section>
        <button type="button" className={BTN} disabled={busy || !concept.trim()} onClick={() => void submit()}>
          {busy ? 'Локальная модель готовит черновик…' : 'Создать предложение'}
        </button>
        {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">{error}</p> : null}
      </div>
    </details>
  );
}
