// Шансы одного действия по целям (ROADMAP 5.2, DESIGN Д1): атака — AC цели, шанс попадания, средний урон с промахами
// и критами; спасбросок — шанс провала. Подсказка у числа — откуда оно: какая грань d20 нужна. Тупой: числа — пропсами
// из campaign/odds.ts, стор не читает. Только у мастера: у игроков нет AC и спасбросков монстров (Q1).
import type { ActionOdds } from '../campaign/odds';
import { ABILITIES } from '../rules/srd/abilities';
import { meanText, percent } from '../rules/srd/odds';

const CELL = 'px-1.5 py-0.5 text-right whitespace-nowrap';
const LINE = { boxShadow: 'inset 0 -1px 0 var(--lo)' };

/** Грань d20, с которой атака попадает: не ниже 2 (1 — промах всегда), не выше 20 (20 — попадание всегда). */
export function faceNeeded(toHit: number, ac: number): number {
  return Math.min(20, Math.max(2, ac - toHit));
}

export function OddsTable({ odds }: { odds: ActionOdds }) {
  if (odds.kind === 'save') {
    const code = ABILITIES[odds.ability].code;
    return (
      <table aria-label={`Шансы: ${odds.name}`} data-part="odds" className="border-separate border-spacing-0 w-full">
        <thead>
          <tr>
            <th className="px-1.5 py-0.5 text-left type-key text-t2 font-normal">DC {odds.dc} {code}</th>
            <th className={`${CELL} type-key text-t2 font-normal`}>спасбросок</th>
            <th className={`${CELL} type-key text-t2 font-normal`}>провал</th>
          </tr>
        </thead>
        <tbody>
          {odds.rows.map(r => {
            const save = r.target.saves![odds.ability];
            return (
              <tr key={r.target.id} data-target={r.target.id}>
                <th scope="row" className="px-1.5 py-0.5 text-left type-body-sm text-tx font-normal truncate max-w-0 w-full" style={LINE} title={r.target.name}>{r.target.name}</th>
                <td className={`${CELL} type-num-12 text-t2`} style={LINE}>{save >= 0 ? `+${save}` : `−${-save}`}</td>
                <td className={`${CELL} type-num-12 text-tx`} style={LINE} title={`Провал, если d20 ${save >= 0 ? '+' : '−'} ${Math.abs(save)} меньше ${odds.dc}; 1 и 20 у спасброска не автоматичны`}>{percent(r.fail)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  return (
    <table aria-label={`Шансы: ${odds.name}`} data-part="odds" className="border-separate border-spacing-0 w-full">
      <thead>
        <tr>
          <th className="px-1.5 py-0.5 text-left type-key text-t2 font-normal">цель</th>
          <th className={`${CELL} type-key text-t2 font-normal`}>AC</th>
          <th className={`${CELL} type-key text-t2 font-normal`}>попадание</th>
          <th className={`${CELL} type-key text-t2 font-normal`} title="Средний урон одной атаки: промахи — 0, крит — кости дважды">урон</th>
        </tr>
      </thead>
      <tbody>
        {odds.rows.map(r => {
          const face = faceNeeded(odds.toHit, r.target.ac);
          return (
            <tr key={r.target.id} data-target={r.target.id}>
              <th scope="row" className="px-1.5 py-0.5 text-left type-body-sm text-tx font-normal truncate max-w-0 w-full" style={LINE} title={r.target.name}>{r.target.name}</th>
              <td className={`${CELL} type-num-12 text-t2`} style={LINE}>{r.target.ac}</td>
              <td className={`${CELL} type-num-12 text-tx`} style={LINE} title={`Нужно ${face}+ на d20 (${odds.toHit >= 0 ? '+' : '−'}${Math.abs(odds.toHit)} против AC ${r.target.ac}); 20 — крит, 1 — промах`}>{percent(r.hit)}</td>
              <td className={`${CELL} type-num-12 text-tx`} style={LINE} title={r.unclear ? 'У цели защита с условием (например, от немагического оружия) — урон посчитан без неё, смотри блок' : undefined}>
                {r.damage === undefined ? '—' : `${r.unclear ? '≈' : ''}${meanText(r.damage)}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default OddsTable;
