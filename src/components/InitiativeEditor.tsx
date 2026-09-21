// Редактор инициативы — то, чего не было у стола до живой игры: игроки бросают сами и называют числа,
// мастер их вводит; монстрам бросает система (d20 + DEX, SRD — проверка Ловкости), и бросок уходит в лог
// как DICE_ROLLED через `onRoll`. Компонент тупой: строки и колбэки — пропсами, в стор не ходит; черновики
// полей — состояние формы, не события. Итог — один снимок порядка целиком (ENCOUNTER_STARTED / INITIATIVE_SET):
// по убыванию, при равенстве — как строки переданы (партия раньше монстров). Строка без числа в бой не встаёт.
import { useState, type KeyboardEvent } from 'react';
import type { ActorKind, InitiativeEntry } from '../engine';
import { Icon } from '../icons/Icon';
import { ENTITY } from './EntityCard';

export interface InitiativeRow {
  id: string;
  name: string;
  kind: ActorKind;
  /** Модификатор броска — DEX; печатается подсказкой и входит в формулу «Бросить». */
  mod: number;
  /** Уже известный бросок — из сида или прошлого порядка; пусто — поле пустое. */
  initiative?: number;
}

export interface InitiativeEditorProps {
  rows: readonly InitiativeRow[];
  /** «Начать бой» — до боя (ENCOUNTER_STARTED), «Применить» — в бою (INITIATIVE_SET). */
  mode: 'start' | 'set';
  /** Бросок по формуле «1d20+3» с подписью; возвращает итог — страница пишет DICE_ROLLED и отдаёт total. */
  onRoll: (formula: string, label: string) => number;
  onApply: (order: InitiativeEntry[]) => void;
  className?: string;
}

/** Черновик поля → число: целое, можно отрицательное (DEX −1 и единица на кубе дают 0 и ниже). Иное — null. */
export function parseInitiative(raw: string): number | null {
  const t = raw.trim().replace('−', '-');
  if (!/^-?\d{1,3}$/.test(t)) return null;
  return Number(t);
}

/** Формула броска инициативы: d20 с модификатором. */
export function initiativeFormula(mod: number): string {
  return mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : ''}${mod}`;
}

/** Порядок из черновиков: строки с числом, по убыванию; равные — как в `rows`. Пустые строки в порядок не идут. */
export function orderFromDrafts(rows: readonly InitiativeRow[], drafts: Readonly<Record<string, string>>): InitiativeEntry[] {
  return rows
    .flatMap(r => {
      const n = parseInitiative(drafts[r.id] ?? '');
      return n === null ? [] : [{ actorId: r.id, initiative: n }];
    })
    .sort((a, b) => b.initiative - a.initiative);
}

const MINUS = '−';
const signed = (n: number) => (n < 0 ? `${MINUS}${-n}` : `+${n}`);

/* Классы целыми строками: Tailwind ищет их в исходнике. Поле — провал wl с утопленной фаской, число моноширинным. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const INPUT = 'w-14 h-7 px-1 text-center type-num-15 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

export function InitiativeEditor({ rows, mode, onRoll, onApply, className = '' }: InitiativeEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rows.filter(r => r.initiative !== undefined).map(r => [r.id, String(r.initiative)])));
  const order = orderFromDrafts(rows, drafts);
  const empty = rows.filter(r => parseInitiative(drafts[r.id] ?? '') === null);

  const rollFor = (r: InitiativeRow) => {
    const total = onRoll(initiativeFormula(r.mod), `Инициатива · ${r.name}`);
    setDrafts(d => ({ ...d, [r.id]: String(total) }));
  };
  const rollEmpty = () => {
    const next: Record<string, string> = {};
    for (const r of empty) next[r.id] = String(onRoll(initiativeFormula(r.mod), `Инициатива · ${r.name}`));
    setDrafts(d => ({ ...d, ...next }));
  };
  const apply = () => { if (order.length > 0) onApply(order); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter в любом поле — главное действие: числа названы, бой начинается.
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
  };

  return (
    <div className={`flex w-80 flex-col gap-2 bg-pn p-3 shadow-float ${className}`}>
      <div className="flex items-center gap-2">
        <Icon name="initiative" size={16} color="var(--gd)" title="Инициатива" />
        <span className="type-h-17 text-tx">Инициатива</span>
        <span className="ml-auto type-key text-t2" title="В порядке боя">{order.length} из {rows.length}</span>
      </div>
      <ol aria-label="Броски инициативы" className="flex flex-col gap-1 max-h-80 overflow-auto">
        {rows.map(r => {
          const ent = ENTITY[r.kind];
          return (
            <li key={r.id} data-actor={r.id} className="flex items-center gap-2">
              <Icon name={ent.icon} size={16} color={ent.color} title={ent.label} className="flex-none" />
              <span className="flex-1 min-w-0 truncate type-body text-tx" title={r.name}>{r.name}</span>
              <span className="type-key text-t2 flex-none" title="Модификатор инициативы (DEX)">DEX {signed(r.mod)}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Инициатива: ${r.name}`}
                value={drafts[r.id] ?? ''}
                onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value.replace(/[^\d-−]/g, '').slice(0, 3) }))}
                onKeyDown={onKeyDown}
                className={INPUT}
              />
              <button type="button" title={`Бросить ${initiativeFormula(r.mod)}: ${r.name}`} aria-label={`Бросить: ${r.name}`} onClick={() => rollFor(r)} className={BTN}>
                <Icon name="dice" size={16} color="currentColor" title="Бросить" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-1">
        <button type="button" title="Бросить d20 + DEX всем, у кого поле пустое" disabled={empty.length === 0} onClick={rollEmpty} className={BTN}>
          Бросить пустым
        </button>
        <button type="button" title={mode === 'start' ? 'Начать бой с этим порядком · Enter' : 'Записать порядок инициативы · Enter'} disabled={order.length === 0} onClick={apply} className={`ml-auto ${BTN_MAIN}`}>
          {mode === 'start' ? 'Начать бой' : 'Применить'}
        </button>
      </div>
    </div>
  );
}

export default InitiativeEditor;
