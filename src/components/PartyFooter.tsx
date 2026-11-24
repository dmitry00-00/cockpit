// Подвал панели партии — рабочая поверхность, а не пустое место (макет «футер как рабочая поверхность»):
// в покое — сводка одной строкой и кнопка «Сводка», раскрывающая док; при выборе строк — «выбрано N из M» и
// действия над выбором («Сравнить», «Снять»). Док считается по всей выборке (выбранные, иначе вся партия), а не
// по видимой части: лучший и худший в групповой проверке, запас костей хитов и ячеек, пробелы листов.
// Тупой: сводку считает campaign/sheetView.ts (partySummaryOf), открыт ли док — его собственное состояние вида.
// Припасы (Supply A5E, 29.10.2026) — общий запас партии: число, сколько унесут по Силе, расход в день; запись — пропсом.
import { useState, type ReactNode } from 'react';
import type { SupplyReason } from '../engine/events';
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
  /** Возможности партии по уровням (Д8): есть сейчас — кто; нет — у кого с какого уровня придёт или «ни у кого». */
  capabilities?: readonly { id: string; label: string; covered: boolean; who: string }[];
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
  /** Общий запас партии: сколько есть, сколько унесут (null — не у всех есть лист), сколько едят в день; onChange — запись. */
  supply?: { value: number; capacity: number | null; perDay: number; onChange?: (reason: SupplyReason, amount: number) => void };
  /** Навыки выбранных участников для проверки группой; выбор без листа остаётся неподдержанным. */
  groupMembers?: readonly { id: string; name: string; mods: Partial<Record<SkillId, number>> }[];
  onGroupCheck?: (skill: SkillId, dc: number, members: readonly { actorId: string; name: string; modifier: number }[]) => void;
}

/** Причины, которые мастер пишет руками; «съедено» пишут отдых и поход сами. */
const SUPPLY_MANUAL: readonly { id: SupplyReason; label: string }[] = [
  { id: 'bought', label: '+ куплено' }, { id: 'found', label: '+ найдено' }, { id: 'foraged', label: '+ добыто' }, { id: 'lost', label: '− потеряно' },
];

function SupplyRow({ supply }: { supply: NonNullable<PartyFooterProps['supply']> }) {
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState<SupplyReason>('bought');
  const n = Number(amount);
  const ok = Number.isInteger(n) && n > 0 && (reason !== 'lost' || n <= supply.value);
  const over = supply.capacity !== null && supply.value > supply.capacity;
  return (
    <>
      <dt className="text-t2" title="Supply A5E: еда и вода на одного Small или Medium на день; съедается на длинном отдыхе">Припасы</dt>
      <dd className={`type-num-12 ${over ? 'text-fx-debuff-hi' : 'text-tx'}`} title={supply.capacity === null ? 'Сколько унесут — не у всех есть лист' : `Унесут ${supply.capacity}: Сила каждого (A5E)${over ? ' — сверх сил' : ''}`}>
        {supply.value}{supply.capacity === null ? '' : `/${supply.capacity}`}
      </dd>
      <dt className="text-t2">Хватит на</dt>
      <dd className="type-num-12 text-tx" title={`Едят ${supply.perDay} в день`}>{supply.perDay > 0 ? Math.floor(supply.value / supply.perDay) : '—'} дн</dd>
      {supply.onChange ? (
        <div className="col-span-2 flex items-center gap-1 pt-1">
          <input aria-label="Сколько припасов" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 3))} className="w-10 h-7 px-1 type-num-12 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]" />
          <select aria-label="Причина" value={reason} onChange={e => setReason(e.target.value as SupplyReason)} className="h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]">
            {SUPPLY_MANUAL.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button type="button" className={BTN} disabled={!ok} onClick={() => { supply.onChange!(reason, n); setAmount('1'); }} title={reason === 'bought' ? 'A5E: базовый паёк — 5 sp за 1 Supply; деньги — на листе' : 'Записать в журнал'}>Записать</button>
        </div>
      ) : null}
    </>
  );
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

export function PartyFooter({ total, selected, summary, onCompare, onClear, dmView = true, renown = [], defaultOpen = false, supply, groupMembers = [], onGroupCheck }: PartyFooterProps) {
  const [dock, setDock] = useState(defaultOpen);
  const [groupSkill, setGroupSkill] = useState<SkillId>('stealth');
  const [groupDc, setGroupDc] = useState('15');
  const dc = Number(groupDc);
  const allHaveSkill = groupMembers.length === selected && groupMembers.every(m => m.mods[groupSkill] !== undefined);
  const groupRolls = groupMembers.map(m => ({ actorId: m.id, name: m.name, modifier: m.mods[groupSkill] ?? 0 }));
  const canGroupCheck = selected >= 2 && allHaveSkill && Number.isInteger(dc) && dc >= 1 && dc <= 30 && !!onGroupCheck;
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
          {selected > 0 ? (
            <DockSection title="Проверка группой">
              <div className="flex items-center gap-1">
                <select aria-label="Навык групповой проверки" value={groupSkill} onChange={e => setGroupSkill(e.target.value as SkillId)} className="min-w-0 flex-1 h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]">
                  {summary.leaders.map(l => <option key={l.skill} value={l.skill}>{SKILL_LABEL[l.skill]}</option>)}
                </select>
                <label className="flex items-center gap-1 type-body-sm text-t2" title="Сложность проверки: от 1 до 30">
                  Сл
                  <input aria-label="Сложность групповой проверки" inputMode="numeric" value={groupDc} onChange={e => setGroupDc(e.target.value.replace(/\D/g, '').slice(0, 2))} className="w-10 h-7 px-1 text-center type-num-12 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]" />
                </label>
                <button type="button" className={BTN_PRI} disabled={!canGroupCheck} onClick={() => onGroupCheck?.(groupSkill, dc, groupRolls)} title={!allHaveSkill ? 'Для проверки нужны листы и выбранный навык у всех отмеченных' : selected < 2 ? 'Отметьте минимум двух персонажей' : 'Проверка группой'}>
                  Бросить
                </button>
              </div>
              {groupMembers.length !== selected ? <p className="type-body-xs text-fx-debuff-hi">У части выбранных нет листа с навыками.</p> : null}
            </DockSection>
          ) : null}
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
          {summary.capabilities?.length ? (
            <DockSection title="Возможности">
              <ul className="flex flex-col" aria-label="Возможности партии">
                {summary.capabilities.map(c => (
                  <li key={c.id} data-capability={c.id} data-covered={c.covered || undefined} className="grid grid-cols-[auto_1fr] gap-x-2 type-body-sm" title={c.covered ? `${c.label}: есть — ${c.who}` : `${c.label}: в партии сейчас нет; ${c.who === 'ни у кого' ? 'по пути классов не придёт' : `придёт: ${c.who}`}`}>
                    <span className={c.covered ? 'text-t2' : 'text-fx-debuff-hi'}>{c.covered ? c.label : `нет: ${c.label.toLowerCase()}`}</span>
                    <span className="text-tx truncate text-right">{c.who}</span>
                  </li>
                ))}
              </ul>
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
              {supply ? <SupplyRow supply={supply} /> : null}
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
            {levelText(summary.levels)} · HP {summary.hp.current}/{summary.hp.max}{supply ? ` · припасы ${supply.value}` : ''}
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
