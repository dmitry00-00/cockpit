import { useState } from 'react';
import { ABILITIES, ABILITY_IDS, type AbilityId } from '../../rules/srd/abilities';
import { MONSTER_BENCHMARKS } from '../../rules/convert/a5eMonsterBenchmark';
import { buildCrMonster, type CrMonsterInput } from '../../rules/generation/crMonster';
import { BTN } from './styles';

interface Props {
  busy: boolean;
  onGenerate: (input: CrMonsterInput, concept: string) => Promise<void>;
}

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing', 'acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'] as const;
const DAMAGE_LABEL: Readonly<Record<(typeof DAMAGE_TYPES)[number], string>> = {
  bludgeoning: 'дробящий', piercing: 'колющий', slashing: 'рубящий', acid: 'кислота', cold: 'холод', fire: 'огонь',
  force: 'силовой', lightning: 'электричество', necrotic: 'некротический', poison: 'яд', psychic: 'психический', radiant: 'излучение', thunder: 'звук',
};
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;
const SIZE_LABEL: Readonly<Record<(typeof SIZES)[number], string>> = { Tiny: 'Крошечный', Small: 'Маленький', Medium: 'Средний', Large: 'Большой', Huge: 'Огромный', Gargantuan: 'Колоссальный' };

const INITIAL: CrMonsterInput = {
  targetCr: '1', size: 'Medium', creatureType: 'Monstrosity', alignment: 'Unaligned', speed: 30,
  abilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, primaryAbility: 'str',
  attackName: 'Удар', damageType: 'bludgeoning', reach: 5, languages: '',
};

function distanceLabel(distance: number) { return `${distance} ${distance === 1 ? 'позиция' : 'позиции'} таблицы CR`; }

/** Creates a new, reduced CR-based stat block; the model supplies prose only. */
export function CrMonsterGenerationPanel({ busy, onGenerate }: Props) {
  const [input, setInput] = useState<CrMonsterInput>(INITIAL);
  const [concept, setConcept] = useState('');
  const [error, setError] = useState('');
  let preview: ReturnType<typeof buildCrMonster> | undefined;
  let previewError = '';
  try { preview = buildCrMonster(input, 'Новый монстр'); }
  catch (reason) { previewError = reason instanceof Error ? reason.message : String(reason); }

  const submit = async () => {
    if (!preview || !concept.trim() || busy) return;
    if (preview.estimate.status === 'rejected-over-two-steps') {
      setError(`Сборка отклонена: оценка ${preview.estimate.estimatedCr} расходится с целевым CR на ${distanceLabel(preview.estimate.distanceFromTargetInCrSteps)}.`);
      return;
    }
    setError('');
    try { await onGenerate(input, concept.trim()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const updateAbility = (ability: AbilityId, value: string) => setInput(current => ({ ...current, abilities: { ...current.abilities, [ability]: Number(value) } }));
  const previewAttack = preview?.block.actions[0]?.attack;

  return (
    <details className="mt-2 bg-cd p-2 shadow-bevel">
      <summary className="cursor-pointer type-body-sm text-tx">Создать нового монстра по CR</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="type-body-xs text-t2">Локальная модель пишет только имя и описание. Базовые AC, HP, бонус мастерства, число атак и DPR задаёт таблица A5E SRD 19.1 (CC BY 4.0); пользовательские характеристики и скорость сохраняются как ввод мастера. Это упрощённый черновой блок: особые способности, спасброски, сопротивления, полёт и заклинания не строятся.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 type-body-xs text-t2">Целевой CR
            <select aria-label="Целевой CR нового монстра" className={INPUT} value={input.targetCr} onChange={event => setInput(current => ({ ...current, targetCr: event.target.value }))}>
              {MONSTER_BENCHMARKS.map(row => <option key={row.cr} value={row.cr}>{row.cr}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">Размер
            <select aria-label="Размер нового монстра" className={INPUT} value={input.size} onChange={event => setInput(current => ({ ...current, size: event.target.value as CrMonsterInput['size'] }))}>
              {SIZES.map(size => <option key={size} value={size}>{SIZE_LABEL[size]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">Тип существа
            <input aria-label="Тип существа нового монстра" className={INPUT} maxLength={80} value={input.creatureType} onChange={event => setInput(current => ({ ...current, creatureType: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">Мировоззрение
            <input aria-label="Мировоззрение нового монстра" className={INPUT} maxLength={80} value={input.alignment} onChange={event => setInput(current => ({ ...current, alignment: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">Скорость ходьбы, футы
            <input aria-label="Скорость нового монстра" className={INPUT} type="number" min={0} max={300} step={5} value={input.speed} onChange={event => setInput(current => ({ ...current, speed: Number(event.target.value) }))} />
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">Досягаемость, футы
            <input aria-label="Досягаемость атаки" className={INPUT} type="number" min={5} max={30} step={5} value={input.reach} onChange={event => setInput(current => ({ ...current, reach: Number(event.target.value) }))} />
          </label>
        </div>

        <fieldset className="bg-wl p-2 shadow-bevel-in">
          <legend className="px-1 type-body-xs text-t2">Характеристики — авторский ввод</legend>
          <div className="grid grid-cols-3 gap-2">
            {ABILITY_IDS.map(ability => <label key={ability} className="flex flex-col gap-1 type-body-xs text-t2">{ABILITIES[ability].code}
              <input aria-label={`Характеристика ${ABILITIES[ability].code}`} className={INPUT} type="number" min={1} max={30} step={1} value={input.abilities[ability]} onChange={event => updateAbility(ability, event.target.value)} />
            </label>)}
          </div>
          <label className="mt-2 flex flex-col gap-1 type-body-xs text-t2">Основная характеристика атаки
            <select aria-label="Основная характеристика атаки" className={INPUT} value={input.primaryAbility} onChange={event => setInput(current => ({ ...current, primaryAbility: event.target.value as AbilityId }))}>
              {ABILITY_IDS.map(ability => <option key={ability} value={ability}>{ABILITIES[ability].name}</option>)}
            </select>
          </label>
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 type-body-xs text-t2">Название атаки
            <input aria-label="Название атаки монстра" className={INPUT} maxLength={80} value={input.attackName} onChange={event => setInput(current => ({ ...current, attackName: event.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">Тип урона
            <select aria-label="Тип урона атаки" className={INPUT} value={input.damageType} onChange={event => setInput(current => ({ ...current, damageType: event.target.value as CrMonsterInput['damageType'] }))}>
              {DAMAGE_TYPES.map(type => <option key={type} value={type}>{DAMAGE_LABEL[type]}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 type-body-xs text-t2">Языки
            <input aria-label="Языки монстра" className={INPUT} maxLength={160} value={input.languages} onChange={event => setInput(current => ({ ...current, languages: event.target.value }))} placeholder="Оставьте пустым, если языков нет" />
          </label>
        </div>
        <label className="flex flex-col gap-1 type-body-xs text-t2">Идея образа
          <textarea aria-label="Идея нового монстра" className={`${INPUT} min-h-16 resize-y`} maxLength={500} value={concept} onChange={event => setConcept(event.target.value)} placeholder="Например: болотный дозорный из корней и серого мха" />
        </label>

        {preview ? <div aria-label="Расчёт черновика монстра" className="flex flex-col gap-1 bg-wl p-2 shadow-bevel-in type-body-xs text-t2">
          <p>Профиль CR {preview.benchmark.cr}: AC {preview.block.ac.value} · HP {preview.block.hp.average} ({preview.block.hp.formula}) · PB +{preview.block.proficiencyBonus}</p>
          <p>{preview.benchmark.attacks} атаки · DPR {preview.benchmark.damagePerRound} · атака {previewAttack ? `${previewAttack.toHit >= 0 ? '+' : ''}${previewAttack.toHit}` : '—'} · средний урон за удар {previewAttack?.average ?? '—'}</p>
          <p>Локальная оценка двух осей: CR {preview.estimate.estimatedCr} (защита {preview.estimate.defensiveCr}, нападение {preview.estimate.offensiveCr}); расхождение — {distanceLabel(preview.estimate.distanceFromTargetInCrSteps)}.</p>
          {preview.estimate.status === 'warning-two-steps' ? <p role="status">Осторожно: оценка отличается от цели на две позиции таблицы. Черновик потребует проверки мастером.</p> : null}
          <p>Сборка упрощена; оценка — диагностическая эвристика кокпита, а не официальное правило A5E/WotC.</p>
        </div> : <p role="alert" className="type-body-xs text-fx-damage-hi">{previewError}</p>}

        <button type="button" className={BTN} disabled={busy || !preview || !concept.trim() || preview.estimate.status === 'rejected-over-two-steps'} onClick={() => void submit()}>
          {busy ? 'Локальная модель пишет описание…' : 'Создать предложение CR-монстра'}
        </button>
        {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">{error}</p> : null}
      </div>
    </details>
  );
}
