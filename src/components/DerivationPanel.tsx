// Дерево вывода числа листа (ROADMAP 5.4, DESIGN Д1): «AC 18 = 14 доспех + 2 DEX + 2 щит», под шагом — строка SRD,
// откуда он (раскрывается щелчком). Тупой: шаги — пропсами из campaign/explain.ts. Esc и крестик закрывают.
import { useEffect } from 'react';
import type { Explanation } from '../campaign/explain';
import { Icon } from '../icons/Icon';

const term = (n: number, first: boolean) => (first ? (n < 0 ? `−${-n}` : String(n)) : n < 0 ? `− ${-n}` : `+ ${n}`);

/** shown — число, как его пишет лист («+3» у инициативы); нет — итог вывода. */
export function DerivationPanel({ title, shown, explanation, onClose }: { title: string; shown?: string; explanation: Explanation; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="region" aria-label={`Из чего: ${title}`} data-part="derivation" className="flex flex-col gap-1 bg-wl shadow-bevel-in px-2 py-1.5 mx-px mt-px flex-none">
      <div className="flex items-baseline gap-2">
        <span className="type-body-bold text-tx flex-1 min-w-0 truncate">{title} {shown ?? explanation.total} — из чего</span>
        <button type="button" aria-label="Закрыть вывод" title="Закрыть вывод (Esc)" onClick={onClose} className="flex-none cursor-pointer text-t2 hover:text-tx">
          <Icon name="cross" size={16} color="currentColor" title="Закрыть" />
        </button>
      </div>
      <ol className="flex flex-col gap-0.5">
        {explanation.steps.map((s, i) => (
          <li key={`${i}:${s.label}`}>
            {s.rule ? (
              <details>
                <summary className="flex items-baseline gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden" title="Строка SRD — щелчком">
                  <span className="type-num-12 text-gd w-8 flex-none text-right">{term(s.value, i === 0)}</span>
                  <span className="type-body-sm text-tx flex-1 min-w-0">{s.label}</span>
                  <span className="type-key text-t2 flex-none">SRD</span>
                </summary>
                <p className="type-body-sm text-t2 pl-10 break-words [overflow-wrap:anywhere]" lang="en">{s.rule}</p>
              </details>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="type-num-12 text-gd w-8 flex-none text-right">{term(s.value, i === 0)}</span>
                <span className="type-body-sm text-tx flex-1 min-w-0">{s.label}{s.mismatch ? ' — расходится с правилами SRD, смотри лист' : ''}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default DerivationPanel;
