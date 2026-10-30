// Повышение уровня во вкладке «Путь» (Q10, Д8): хиты — среднее SRD или бросок кости (вводом или системой), подкласс —
// там, где класс его даёт, увеличение характеристик — +2 к одной или +1 к двум на уровнях SRD. Что даст уровень —
// строкой над формой. Тупой: план и колбэки — пропсами; черновик — состояние формы, не событие. Черты вместо
// увеличения и новые заклинания здесь не выбираются — подпись так и говорит.
import { useState } from 'react';
import type { LevelUpChoice, LevelUpPlan } from '../campaign/levelUp';
import { ABILITIES, ABILITY_IDS, type AbilityId } from '../rules/srd/abilities';

export interface LevelUpFormProps {
  plan: LevelUpPlan;
  abilities: Readonly<Record<AbilityId, number>>;
  onLevelUp: (choice: LevelUpChoice) => void;
  /** Бросок кости хитов системой (DICE_ROLLED); вернуть выпавшее. */
  onRoll?: (formula: string, label: string) => number;
  /** Почему не вышло (от расчёта) — строкой под формой. */
  error?: string | null;
}

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const FIELD = 'h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

export function LevelUpForm({ plan, abilities, onLevelUp, onRoll, error }: LevelUpFormProps) {
  const [method, setMethod] = useState<'average' | 'roll'>('average');
  const [roll, setRoll] = useState('');
  const [subclassId, setSubclassId] = useState(plan.subclasses?.[0]?.id ?? '');
  const [split, setSplit] = useState<'two' | 'one'>('one');
  const [first, setFirst] = useState<AbilityId>('str');
  const [second, setSecond] = useState<AbilityId>('dex');
  const r = Number(roll);
  const rollOk = method === 'average' || (Number.isInteger(r) && r >= 1 && r <= plan.die);
  const asi: Partial<Record<AbilityId, number>> | undefined = !plan.asi ? undefined
    : split === 'one' ? { [first]: 2 } : first === second ? undefined : { [first]: 1, [second]: 1 };
  const ready = rollOk && (!plan.asi || asi !== undefined);
  const submit = () => {
    if (!ready) return;
    onLevelUp({ hp: method === 'average' ? { method } : { method, roll: r }, ...(plan.subclasses ? { subclassId } : {}), ...(asi ? { asi } : {}) });
  };
  const abOpt = (ab: AbilityId) => <option key={ab} value={ab}>{ABILITIES[ab].code} {abilities[ab]}</option>;
  return (
    <form aria-label={`Повышение до ${plan.level}-го уровня`} className="flex flex-col gap-2 bg-pn shadow-bevel p-2" data-part="level-up" onSubmit={e => { e.preventDefault(); submit(); }}>
      <span className="type-h-15 text-tx">Повышение до {plan.level}-го уровня</span>
      <fieldset className="flex flex-wrap items-center gap-2 type-body-sm">
        <legend className="type-key text-t2">Хиты: d{plan.die} {plan.conMod >= 0 ? '+' : '−'} {Math.abs(plan.conMod)} CON</legend>
        <label className="flex items-center gap-1"><input type="radio" name="hp" checked={method === 'average'} onChange={() => setMethod('average')} /> среднее {plan.average}</label>
        <label className="flex items-center gap-1"><input type="radio" name="hp" checked={method === 'roll'} onChange={() => setMethod('roll')} /> бросок</label>
        {method === 'roll' ? (
          <>
            <input aria-label="Выпало" inputMode="numeric" value={roll} onChange={e => setRoll(e.target.value.replace(/\D/g, ''))} className={`${FIELD} w-12`} />
            {onRoll ? <button type="button" className={BTN} onClick={() => setRoll(String(onRoll(`1d${plan.die}`, `Хиты, ${plan.level}-й уровень`)))}>d{plan.die}</button> : null}
          </>
        ) : null}
      </fieldset>
      {plan.subclasses ? (
        <label className="flex items-center gap-2 type-body-sm">
          <span className="text-t2">Подкласс</span>
          <select aria-label="Подкласс" value={subclassId} onChange={e => setSubclassId(e.target.value)} className={FIELD}>
            {plan.subclasses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      ) : null}
      {plan.asi ? (
        <fieldset className="flex flex-wrap items-center gap-2 type-body-sm">
          <legend className="type-key text-t2">Увеличение характеристик (SRD)</legend>
          <select aria-label="Как увеличить" value={split} onChange={e => setSplit(e.target.value as 'one' | 'two')} className={FIELD}>
            <option value="one">+2 к одной</option>
            <option value="two">+1 к двум</option>
          </select>
          <select aria-label="Характеристика" value={first} onChange={e => setFirst(e.target.value as AbilityId)} className={FIELD}>{ABILITY_IDS.map(abOpt)}</select>
          {split === 'two' ? <select aria-label="Вторая характеристика" value={second} onChange={e => setSecond(e.target.value as AbilityId)} className={FIELD}>{ABILITY_IDS.map(abOpt)}</select> : null}
        </fieldset>
      ) : null}
      {plan.features.length ? <p className="type-body-sm text-t2">Умения уровня: <span className="text-tx">{plan.features.join(', ')}</span></p> : null}
      {error ? <p role="status" className="type-body-sm text-hp-low">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={BTN_MAIN} disabled={!ready}>Повысить</button>
        <span className="type-body-xs text-t3">черта вместо увеличения и новые заклинания — через редактор, здесь не выбираются</span>
      </div>
    </form>
  );
}

export default LevelUpForm;
