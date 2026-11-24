import type { TimeStepPreview } from '../../campaign/timeStepPreview';
import { calendarAdapterForState } from '../../campaign';
import { TEMPO_LABELS } from '../../components/TimeTempo';
import { CONDITIONS } from '../../rules/srd/conditions';

export function TimeStepReview({ preview, stale, onApply, onCancel, contextText }: { preview: TimeStepPreview; stale?: boolean; onApply: () => void; onCancel: () => void; contextText?: string | null }) {
  const calendar = calendarAdapterForState(preview.state);
  const days = (preview.toSec - preview.fromSec) / 86400;
  return <div className="flex flex-col gap-3 min-w-0">
    <p className="type-body-sm text-t2">Выбранный шаг: {TEMPO_LABELS[preview.tempo]} × {preview.steps} · период {days} сут.</p>
    <dl className="type-body flex flex-col gap-1 text-tx">
      <div><dt className="type-body-xs text-t2">Сейчас</dt><dd>{calendar.formatDate(preview.fromSec)}</dd></div>
      <div><dt className="type-body-xs text-t2">После шага</dt><dd>{calendar.formatDate(preview.toSec)}</dd></div>
    </dl>
    <p className="type-body-sm text-t2">Время изменится после применения. Предложения мира потребуют отдельного решения; их патчи сейчас не применяются.</p>
    {contextText ? <details className="type-body-sm text-t2"><summary className="cursor-pointer text-tx">Запись промежутка</summary><pre className="whitespace-pre-wrap font-sans py-2">{contextText}</pre></details> : null}
    {preview.deadlines.length ? <div><h3 className="type-h-17 text-tx">За период наступят сроки эффектов</h3><ul className="type-body-sm text-t2 list-disc pl-4">{preview.deadlines.map((d,i) => <li key={i}>{d.actor} · {d.condition ? CONDITIONS[d.condition].label : d.name}</li>)}</ul><p className="type-body-xs text-t2">Проверьте завершение эффектов; предпросмотр их не снимает.</p></div> : null}
    <details className="type-body-sm text-t2">
      <summary className="cursor-pointer text-tx">Возможные предложения: {preview.proposals.length}</summary>
      <ul className="flex flex-col gap-2 py-2">{preview.proposals.map(d => <li key={d.id}><strong className="text-tx">{d.subject}</strong><p>{d.was} → {d.now}</p><p className="type-body-xs">{d.cause}</p></li>)}</ul>
      {!preview.proposals.length ? <p>Текущие правила не предложат изменений за этот период.</p> : null}
    </details>
    {stale ? <p role="status" className="type-body-sm text-gd-hi">Состояние кампании изменилось. Прогноз обновлён; проверьте его перед применением.</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onCancel} className="type-body-sm bg-cd text-t2 shadow-bevel px-3 py-2 cursor-pointer focus-visible:shadow-[var(--glow-gold)]">Отмена</button>
      <button type="button" onClick={onApply} className="type-body-sm bg-pl text-gd-hi shadow-bevel px-3 py-2 cursor-pointer focus-visible:shadow-[var(--glow-gold)]">Применить шаг</button>
    </div>
  </div>;
}
