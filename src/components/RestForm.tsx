// Отдых (REST_TAKEN): короткий — кто отдыхает и кто сколько костей хитов тратит; хиты за кости игроки бросают сами,
// мастер вводит сумму; NPC и отсутствующим бросает стол («Бросить» — d по классу с CON за кость, через onRoll
// как DICE_ROLLED). Долгий — только кто отдыхает: хиты полны, временные сгорают, истощение −1, половина костей
// назад — форма это перечисляет строкой, чтобы мастер видел, что случится. Компонент тупой: строки и колбэки
// пропсами; галочки и черновики полей — состояние формы. Часы двигает страница (takeRest), не форма.
import { useState, type KeyboardEvent } from 'react';
import { ToggleGroup } from 'radix-ui';
import type { ActorKind, RestHitDice, RestKind } from '../engine';
import { Icon } from '../icons/Icon';
import { ENTITY } from './EntityCard';
import { hpText } from './HpBar';

export interface RestRow {
  id: string;
  name: string;
  kind: ActorKind;
  hp: { current: number; max: number; temp: number };
  /** Кости хитов по листу; без них тратить нечего (NPC без листа) — строка отдыхает без костей. */
  hitDice?: { die: number; available: number; total: number };
  /** CON к каждой кости. */
  conMod: number;
  /** Уровень истощения — долгий отдых снимет один. */
  exhaustion?: number;
  /** Подписи ресурсов, которые вернёт короткий отдых (правило SRD, считает страница) — форма показывает, мастер видит. */
  shortRestores?: readonly string[];
  /** Что вернёт долгий: всё потраченное. */
  longRestores?: readonly string[];
}

export interface RestFormProps {
  rows: readonly RestRow[];
  /** Бросок костей хитов по формуле с подписью; итог — числом (страница пишет DICE_ROLLED). */
  onRoll: (formula: string, label: string) => number;
  onRest: (kind: RestKind, actorIds: string[], hitDice: RestHitDice[]) => void;
  className?: string;
}

export const REST_LABELS: Readonly<Record<RestKind, string>> = { short: 'Короткий · 1 ч', long: 'Долгий · 8 ч' };

/** Черновик костей → 0…available; пусто — 0 (не тратит). Иное — null, строка не проходит. */
export function parseDice(raw: string, available: number): number | null {
  if (raw.trim() === '') return 0;
  if (!/^\d{1,2}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n <= available ? n : null;
}

/** Черновик хитов → целое ≥ 0; пусто — null. */
export function parseHealed(raw: string): number | null {
  return /^\d{1,3}$/.test(raw.trim()) ? Number(raw) : null;
}

/** «2d10+6», «1d6-1», «3d8»: CON за каждую кость. Дубль campaign/rest.ts, чтобы компонент не зависел от кампании. */
export function diceFormula(count: number, die: number, conMod: number): string {
  const mod = count * conMod;
  return `${count}d${die}${mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ''}`;
}

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';
const OPT_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';
const INPUT = 'h-7 px-1 text-center type-num-15 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)] disabled:opacity-(--op-disabled)';

export function RestForm({ rows, onRoll, onRest, className = '' }: RestFormProps) {
  const [kind, setKind] = useState<RestKind>('short');
  const [resting, setResting] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map(r => [r.id, true])));
  const [dice, setDice] = useState<Record<string, string>>({});
  const [healed, setHealed] = useState<Record<string, string>>({});

  const actorIds = rows.filter(r => resting[r.id]).map(r => r.id);
  /** Строки короткого отдыха с костями: сколько тратит и сколько вернулось; null — форма не готова. */
  const spends = (): RestHitDice[] | null => {
    const out: RestHitDice[] = [];
    for (const r of rows) {
      if (!resting[r.id] || !r.hitDice) continue;
      const n = parseDice(dice[r.id] ?? '', r.hitDice.available);
      if (n === null) return null;
      if (n === 0) continue;
      const h = parseHealed(healed[r.id] ?? '');
      if (h === null) return null;
      out.push({ actorId: r.id, dice: n, healed: h });
    }
    return out;
  };
  const hitDice = kind === 'short' ? spends() : [];
  const ready = actorIds.length > 0 && hitDice !== null;

  const rollFor = (r: RestRow) => {
    if (!r.hitDice) return;
    const n = parseDice(dice[r.id] ?? '', r.hitDice.available);
    if (!n) return;
    const total = onRoll(diceFormula(n, r.hitDice.die, r.conMod), `Кости хитов · ${r.name}`);
    setHealed(h => ({ ...h, [r.id]: String(Math.max(0, total)) }));
  };
  const submit = () => { if (ready && hitDice) onRest(kind, actorIds, hitDice); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };
  /** Что даст долгий отдых этой строке — словами, чтобы мастер видел до нажатия. */
  const longNote = (r: RestRow) => {
    const parts: string[] = [];
    if (r.hp.current < r.hp.max || r.hp.temp > 0) parts.push('хиты полны');
    if (r.hitDice && r.hitDice.available < r.hitDice.total) parts.push(`+${Math.min(r.hitDice.total - r.hitDice.available, Math.max(1, Math.floor(r.hitDice.total / 2)))} костей хитов`);
    if (r.exhaustion) parts.push(`истощение ${r.exhaustion} → ${r.exhaustion - 1 || 'снято'}`);
    if (r.longRestores && r.longRestores.length > 0) parts.push(...r.longRestores.map(x => x.toLowerCase()));
    return parts.join(', ') || 'без изменений';
  };

  return (
    <div className={`flex w-140 flex-col gap-2 bg-pn p-3 shadow-float ${className}`}>
      <div className="flex items-center gap-2">
        <Icon name="night" size={16} color="var(--gd)" title="Отдых" />
        <span className="type-h-17 text-tx">Отдых</span>
        <span className="ml-auto type-key text-t2" title="Отдыхают">{actorIds.length} из {rows.length}</span>
      </div>
      <ToggleGroup.Root
        type="single"
        value={kind}
        onValueChange={v => { if (v) setKind(v as RestKind); }}
        aria-label="Вид отдыха"
        className="flex items-center gap-px p-px bg-lo"
      >
        {(['short', 'long'] as const).map(k => (
          <ToggleGroup.Item key={k} value={k} title={k === 'short' ? 'Короткий отдых: час, кости хитов по желанию' : 'Долгий отдых: восемь часов, хиты полны, половина костей хитов назад'} className={`${OPT} flex-1 ${k === kind ? OPT_ON : OPT_OFF}`}>
            {REST_LABELS[k]}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <ol aria-label="Кто отдыхает" className="flex flex-col gap-1 max-h-80 overflow-auto">
        {rows.map(r => {
          const ent = ENTITY[r.kind];
          const on = resting[r.id] ?? false;
          const n = r.hitDice ? parseDice(dice[r.id] ?? '', r.hitDice.available) : 0;
          return (
            <li key={r.id} data-actor={r.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Отдыхает: ${r.name}`}
                checked={on}
                onChange={e => setResting(s => ({ ...s, [r.id]: e.target.checked }))}
                className="appearance-none size-4 flex-none bg-wl shadow-bevel-in cursor-pointer checked:bg-gd focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
              />
              <Icon name={ent.icon} size={16} color={ent.color} title={ent.label} className="flex-none" />
              <span className={`flex-1 min-w-0 truncate type-body ${on ? 'text-tx' : 'text-t2'}`} title={r.name}>{r.name}</span>
              <span className="type-num-12 text-t2 flex-none" title="Хиты">{hpText(r.hp)}</span>
              {kind === 'short' && r.hitDice ? (
                <>
                  <span className="type-key text-t2 flex-none" title={`Кости хитов: d${r.hitDice.die}, осталось ${r.hitDice.available} из ${r.hitDice.total}`}>d{r.hitDice.die} · {r.hitDice.available}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Кости хитов: ${r.name}`}
                    title="Сколько костей тратит"
                    disabled={!on}
                    value={dice[r.id] ?? ''}
                    onChange={e => setDice(d => ({ ...d, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                    onKeyDown={onKeyDown}
                    className={`${INPUT} w-8`}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Хиты: ${r.name}`}
                    title="Сколько хитов вернулось: сумма бросков с CON"
                    disabled={!on || !n}
                    value={healed[r.id] ?? ''}
                    onChange={e => setHealed(h => ({ ...h, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                    onKeyDown={onKeyDown}
                    className={`${INPUT} w-12`}
                  />
                  <button type="button" aria-label={`Бросить: ${r.name}`} title={n ? `Бросить ${diceFormula(n, r.hitDice.die, r.conMod)}: ${r.name}` : 'Сначала число костей'} disabled={!on || !n} onClick={() => rollFor(r)} className={BTN}>
                    <Icon name="dice" size={16} color="currentColor" title="Бросить" />
                  </button>
                </>
              ) : null}
              {kind === 'short' && r.shortRestores && r.shortRestores.length > 0 ? (
                <span className="type-body-xs text-t2 flex-none" data-part="short-note" title="Вернёт короткий отдых (SRD)">{r.shortRestores.join(', ').toLowerCase()}</span>
              ) : kind === 'long' ? (
                <span className="type-body-xs text-t2 flex-none" data-part="long-note">{longNote(r)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center">
        <button
          type="button"
          title={kind === 'short' ? 'Короткий отдых: час времени, кости хитов — как введено · Enter' : 'Долгий отдых: восемь часов времени, хиты полны · Enter'}
          disabled={!ready}
          onClick={submit}
          className={`ml-auto ${BTN_MAIN}`}
        >
          Отдохнуть
        </button>
      </div>
    </div>
  );
}

export default RestForm;
