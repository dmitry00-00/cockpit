// Подвал панели партии — рабочая поверхность, а не пустое место (макет «футер как рабочая поверхность»):
// в покое — сводка одной строкой и кнопка «Сводка», раскрывающая док; при выборе строк — «выбрано N из M» и
// действия над выбором («Сравнить», «Снять»). Док считается по всей выборке (выбранные, иначе вся партия), а не
// по видимой части: лучший и худший в групповой проверке, запас костей хитов и ячеек, пробелы листов.
// Тупой: сводку считает campaign/sheetView.ts (partySummaryOf), открыт ли док — его собственное состояние вида.
import { useState, type ReactNode } from 'react';
import type { SkillId } from '../rules/srd/abilities';
import { SKILL_LABEL } from './labels';
import { signedMod } from './StatTile';

export interface PartySummaryData {
  count: number;
  levels: { min: number; max: number };
  hp: { current: number; max: number };
  hitDice: { available: number; total: number };
  slots?: { available: number; max: number };
  leaders: readonly { skill: SkillId; best: { name: string; mod: number }; worst: { name: string; mod: number } }[];
  gaps: readonly { field: string; names: readonly string[] }[];
}

export interface PartyFooterProps {
  /** Сколько в партии всего: «выбрано 2 из 4». */
  total: number;
  /** Сколько выбрано; 0 — подвал в покое. */
  selected: number;
  /** Сводка выборки: выбранных, а без выбора — всей партии. */
  summary: PartySummaryData;
  onCompare: () => void;
  onClear: () => void;
  /** Пробелы листов — только мастеру. */
  dmView?: boolean;
  /** Известность партии у фракций кампании (E10): не ноль, по убыванию. Нет — раздела нет. */
  renown?: readonly { id: string; name: string; value: number }[];
  /** Док раскрыт на старте (для проверок и снимков). */
  defaultOpen?: boolean;
}

const BTN = 'type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_PRI = 'type-num-12 uppercase px-2 py-1 bg-pl shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';

const levelText = (l: PartySummaryData['levels']) => (l.min === l.max ? `${l.min} ур.` : `${l.min}–${l.max} ур.`);

function DockSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h4 className="type-key uppercase text-t2">{title}</h4>
      {children}
    </section>
  );
}

export function PartyFooter({ total, selected, summary, onCompare, onClear, dmView = true, renown = [], defaultOpen = false }: PartyFooterProps) {
  const [dock, setDock] = useState(defaultOpen);
  const scope = selected > 0 ? `выбранных ${selected}` : `партии ${total}`;
  return (
    <div data-part="party-footer" className="flex-none flex flex-col bg-pn shadow-plate">
      {dock ? (
        <div data-part="party-dock" aria-label={`Сводка ${scope}`} role="region" className="flex flex-col gap-3 p-2 bg-cd shadow-bevel max-h-[50vh] overflow-auto">
          <DockSection title="Лучший в проверке">
            <ul className="flex flex-col" aria-label="Лучший в проверке">
              {summary.leaders.map(l => (
                <li
                  key={l.skill}
                  className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-2 type-body-sm"
                  title={`${SKILL_LABEL[l.skill]}: лучший ${l.best.name} ${signedMod(l.best.mod)}, худший ${l.worst.name} ${signedMod(l.worst.mod)} — групповая проверка держится на худшем`}
                >
                  <span className="text-t2 truncate">{SKILL_LABEL[l.skill]}</span>
                  <span className="text-tx truncate max-w-24">{l.best.name}</span>
                  <span className="type-num-12 text-gd w-7 text-right">{signedMod(l.best.mod)}</span>
                </li>
              ))}
            </ul>
          </DockSection>
          {renown.length > 0 ? (
            <DockSection title="Известность">
              <dl className="grid grid-cols-[1fr_auto] gap-x-2 type-body-sm" aria-label="Известность партии">
                {renown.map(r => (
                  <div key={r.id} className="contents">
                    <dt className="text-t2 truncate" title={`Известность партии у фракции ${r.name}`}>{r.name}</dt>
                    <dd className="type-num-12 text-tx text-right">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </DockSection>
          ) : null}
          <DockSection title="Запас">
            <dl className="grid grid-cols-[1fr_auto] gap-x-2 type-body-sm">
              <dt className="text-t2">Кости хитов</dt>
              <dd className="type-num-12 text-tx">{summary.hitDice.available}/{summary.hitDice.total}</dd>
              {summary.slots ? (
                <>
                  <dt className="text-t2">Ячейки заклинаний</dt>
                  <dd className="type-num-12 text-tx">{summary.slots.available}/{summary.slots.max}</dd>
                </>
              ) : null}
            </dl>
          </DockSection>
          {dmView && summary.gaps.length > 0 ? (
            <DockSection title="Пробелы листов">
              <ul className="flex flex-col" aria-label="Пробелы листов">
                {summary.gaps.map(g => (
                  <li key={g.field} className="grid grid-cols-[1fr_auto] gap-x-2 type-body-sm" title={`Нет на листе «${g.field}»: ${g.names.join(', ')}`}>
                    <span className="text-t2 truncate">нет: {g.field}</span>
                    <span className="type-num-12 text-fx-debuff-hi">{g.names.length}</span>
                  </li>
                ))}
              </ul>
            </DockSection>
          ) : null}
        </div>
      ) : null}
      {selected > 0 ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 flex-wrap" data-part="party-selection">
          <span className="type-num-12 text-tx w-full whitespace-nowrap">выбрано {selected} из {total}</span>
          <button type="button" className={BTN_PRI} disabled={selected < 2} onClick={onCompare} title={selected < 2 ? 'Сравнение — от двух персонажей' : 'Сравнить выбранных бок о бок · Esc возвращает к столу'}>Сравнить</button>
          <button type="button" className={BTN} onClick={onClear} title="Снять выбор">Снять</button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1.5" data-part="party-rest">
          <span className="type-num-12 text-t2 flex-1 min-w-0 truncate" title={`Партия: ${summary.count}, ${levelText(summary.levels)}, хиты ${summary.hp.current} из ${summary.hp.max}`}>
            {levelText(summary.levels)} · HP {summary.hp.current}/{summary.hp.max}
          </span>
        </div>
      )}
      <button
        type="button"
        aria-expanded={dock}
        onClick={() => setDock(d => !d)}
        className="type-key uppercase text-t2 text-left px-2 py-1 bg-linear-to-b from-pl to-cd shadow-plate cursor-pointer hover:text-tx focus-visible:shadow-[var(--glow-gold)]"
        title={`Сводка ${scope}: лучший в проверке, запас, пробелы листов`}
      >
        {dock ? 'Свернуть сводку' : `Сводка ${scope}`}
      </button>
    </div>
  );
}

export default PartyFooter;
