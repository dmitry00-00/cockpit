// Отдых (REST_TAKEN): короткий — кто отдыхает и кто сколько костей хитов тратит; хиты за кости игроки бросают сами,
// мастер вводит сумму; NPC и отсутствующим бросает стол («Бросить» — d по классу с CON за кость, через onRoll
// как DICE_ROLLED). Долгий — только кто отдыхает: хиты полны, временные сгорают, половина костей
// назад — форма перечисляет строкой, чтобы мастер видел, что случится; последствия зависят от слоя отдыха.
// Компонент показывает данные и вызывает переданные колбэки.
// пропсами; галочки и черновики полей — состояние формы. Часы двигает страница (takeRest), не форма.
import { useState, type KeyboardEvent } from 'react';
import { ToggleGroup } from 'radix-ui';
import type { A5eTrack, ActorKind, RestContext, RestHitDice, RestKind, RestLayer } from '../engine';
import { A5E_HAVEN_RULE } from '../campaign/rest';
import { Icon } from '../icons/Icon';
import { ENTITY } from './EntityCard';
import { hpText } from './HpBar';
import { activeA5eStressEffect, a5eStressEffectName, type A5eStressEffect } from '../rules/a5e/strife';
import { A5E_LONG_REST_MIN_SLEEP_HOURS, a5eRestFailureReasons } from '../rules/a5e/rest';

export interface RestRow {
  id: string;
  name: string;
  kind: ActorKind;
  hp: { current: number; max: number; temp: number };
  /** Кости хитов по листу; без них тратить нечего (NPC без листа) — строка отдыхает без костей. */
  hitDice?: { die: number; available: number; total: number; reference?: string };
  /** CON к каждой кости. */
  conMod: number;
  /** Итоговый Wisdom save modifier from the character sheet; absent when no sourced sheet exists. */
  wisSave?: number;
  /** Wisdom (Perception) modifier for a Sleepless danger check after a failed rest save. */
  perception?: number;
  /** Уровень истощения — долгий отдых снимет один. */
  exhaustion?: number;
  a5eConditions?: { fatigue?: number; strife?: number; mentalStress?: A5eStressEffect };
  /** Время завершения предыдущего A5E long rest; отсутствует у старых сохранений до первого реплейнутого отдыха. */
  a5eLastLongRestAt?: number;
  /** Подписи ресурсов, которые вернёт короткий отдых (правило SRD, считает страница) — форма показывает, мастер видит. */
  shortRestores?: readonly string[];
  /** Что вернёт долгий: всё потраченное. */
  longRestores?: readonly string[];
}

export interface RestFormProps {
  rows: readonly RestRow[];
  /** Бросок костей хитов по формуле с подписью; итог — числом (страница пишет DICE_ROLLED). */
  onRoll: (formula: string, label: string, actorId?: string, intent?: { kind: 'save'; ability: 'wis' } | { kind: 'check'; ability: 'wis'; skill: 'perception'; purpose: 'detect-danger-during-rest' }) => number;
  /** Установить уровень отдельного трека A5E; запись мастера попадает в журнал и undo. */
  onA5eTrackSet?: (actorId: string, track: A5eTrack, level: number) => void;
  /** Общий запас Supply до отдыха; распределение при нехватке выбирает мастер. */
  supplyAvailable?: number;
  /** Настройка кампании (отсутствующая в старом save — SRD). */
  restLayer?: RestLayer;
  onRestLayerChange?: (layer: RestLayer) => void;
  /** Текущее место партии; его сохранённый Haven — значение по умолчанию для долгого отдыха. */
  restPlace?: { id: string; name: string; haven?: boolean };
  /** Текущее мировое время; используется для доступности A5E long rest. */
  nowSec?: number;
  stressEnabled?: boolean;
  onRest: (kind: RestKind, actorIds: string[], hitDice: RestHitDice[], context: RestContext) => void;
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

export function RestForm({ rows, onRoll, onRest, onA5eTrackSet, supplyAvailable = 0, restLayer = 'srd', onRestLayerChange, restPlace, nowSec = 0, stressEnabled = false, className = '' }: RestFormProps) {
  const [kind, setKind] = useState<RestKind>('short');
  const [a5eDurationHours, setA5eDurationHours] = useState('8');
  const [a5eSleepHours, setA5eSleepHours] = useState('6');
  const [a5eStrenuousMinutes, setA5eStrenuousMinutes] = useState('0');
  const layer = restLayer;
  const [havenOverride, setHavenOverride] = useState<boolean | undefined>(undefined);
  const [roughingConditions, setRoughingConditions] = useState<string[]>([]);
  const roughingIt = roughingConditions.length > 0;
  const [suppliedActorIds, setSuppliedActorIds] = useState<string[]>(() =>
    restLayer === 'a5e' && supplyAvailable >= rows.length ? rows.map(r => r.id) : []);
  const [resting, setResting] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map(r => [r.id, true])));
  const [dice, setDice] = useState<Record<string, string>>({});
  const [healed, setHealed] = useState<Record<string, string>>({});
  const [wisSaveOverrides, setWisSaveOverrides] = useState<Record<string, string>>({});
  const [sleeplessSaveResults, setSleeplessSaveResults] = useState<{ signature: string; failedActorIds: readonly string[] } | null>(null);

  const actorIds = rows.filter(r => resting[r.id]).map(r => r.id);
  const placeHaven = Boolean(restPlace?.haven);
  const haven = havenOverride ?? placeHaven;
  const durationHours = Number(a5eDurationHours);
  const sleepHours = Number(a5eSleepHours);
  const strenuousMinutes = Number(a5eStrenuousMinutes);
  const a5eTimingActive = layer === 'a5e' && kind === 'long';
  const a5eTimingValid = !a5eTimingActive || (
    /^\d+$/.test(a5eDurationHours) && durationHours >= 8 && Number.isSafeInteger(durationHours) && Number.isSafeInteger(durationHours * 3600) &&
    /^\d+$/.test(a5eSleepHours) && Number.isSafeInteger(sleepHours) && sleepHours >= 0 && sleepHours <= durationHours &&
    /^\d+$/.test(a5eStrenuousMinutes) && Number.isSafeInteger(strenuousMinutes) && strenuousMinutes >= 0 && strenuousMinutes <= durationHours * 60
  );
  const a5eFailureReasons = a5eTimingValid
    ? a5eRestFailureReasons({ a5eTiming: 'period-v2', a5eSleepHours: sleepHours, a5eStrenuousMinutes: strenuousMinutes })
    : [];
  const a5eAttemptFailed = a5eTimingActive && a5eTimingValid && a5eFailureReasons.length > 0;
  /** Строки короткого отдыха с костями: сколько тратит и сколько вернулось; null — форма не готова. */
  const activeStressByActor = new Map(rows.map(r => [r.id, activeA5eStressEffect(r.a5eConditions?.mentalStress, nowSec)]));
  const sleeplessRows = layer === 'a5e' && kind === 'long' && stressEnabled && !a5eAttemptFailed
    ? rows.filter(r => activeStressByActor.get(r.id)?.id === 'sleepless')
    : [];
  const wisSaveModifier = (r: RestRow): number | undefined => {
    if (r.wisSave !== undefined) return r.wisSave;
    const raw = wisSaveOverrides[r.id]?.trim();
    if (raw === undefined || !/^[+-]?\d+$/.test(raw)) return undefined;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : undefined;
  };
  const savesReady = sleeplessRows.filter(r => actorIds.includes(r.id)).every(r => wisSaveModifier(r) !== undefined);
  const sleeperIds = sleeplessRows.filter(r => actorIds.includes(r.id)).map(r => r.id);
  const sleeplessSaveSignature = JSON.stringify({
    kind, layer, actorIds: sleeperIds.map(id => [id, wisSaveModifier(sleeplessRows.find(r => r.id === id)!)]), durationHours, sleepHours, strenuousMinutes,
  });
  const sleeplessSavesResolved = sleeperIds.length === 0 || sleeplessSaveResults?.signature === sleeplessSaveSignature;
  const spends = (allowed?: ReadonlySet<string>): RestHitDice[] | null => {
    const out: RestHitDice[] = [];
    for (const r of rows) {
      if (allowed && !allowed.has(r.id)) continue;
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
  const fallbackDiceIds = new Set(sleeplessRows.map(r => r.id));
  const hitDice = kind === 'short' ? spends() : sleeplessRows.length ? spends(fallbackDiceIds) : [];
  const a5eBlockedRows = layer === 'a5e' && kind === 'long'
    ? rows.filter(r => !a5eAttemptFailed && !sleeplessRows.some(sleepless => sleepless.id === r.id) && resting[r.id] && (r.hp.current < 1 || (r.a5eLastLongRestAt !== undefined && nowSec + durationHours * 3600 < r.a5eLastLongRestAt + 86_400)))
    : [];
  const ready = actorIds.length > 0 && hitDice !== null && savesReady && a5eTimingValid && a5eBlockedRows.length === 0;

  const rollFor = (r: RestRow) => {
    if (!r.hitDice) return;
    const n = parseDice(dice[r.id] ?? '', r.hitDice.available);
    if (!n) return;
    const total = onRoll(diceFormula(n, r.hitDice.die, r.conMod), `Кости хитов · ${r.name}`);
    setHealed(h => ({ ...h, [r.id]: String(Math.max(0, total)) }));
  };
  const submit = () => {
    if (!ready || !hitDice) return;
    if (!sleeplessSavesResolved) {
      const failedActorIds = sleeplessRows.filter(r => {
        if (!actorIds.includes(r.id)) return false;
        const modifier = wisSaveModifier(r)!;
        return onRoll(`1d20${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ''}`, `Sleepless · Wisdom DC 15 · ${r.name} · в конце отдыха`, r.id, { kind: 'save', ability: 'wis' }) < 15;
      }).map(r => r.id);
      setSleeplessSaveResults({ signature: sleeplessSaveSignature, failedActorIds });
      return;
    }
    const failedSleepless = sleeplessSaveResults?.failedActorIds.filter(id => actorIds.includes(id)) ?? [];
    const restHitDice = kind === 'long' ? hitDice.filter(h => failedSleepless.includes(h.actorId)) : hitDice;
    onRest(kind, actorIds, restHitDice, {
      layer, haven,
      ...(layer === 'a5e' && kind === 'long' ? {
        roughingIt,
        suppliedActorIds: suppliedActorIds.filter(id => actorIds.includes(id)),
        a5eCadence: '24h-v1' as const,
        a5eStartHp: 'min-1-v1' as const,
        a5eTiming: 'period-v2' as const,
        a5eDurationHours: durationHours,
        a5eSleepHours: sleepHours,
        a5eStrenuousMinutes: strenuousMinutes,
        ...(failedSleepless.length ? { a5eSleeplessFailedActorIds: failedSleepless } : {}),
      } : {}),
    });
  };
  const toggleSupply = (actorId: string) => setSuppliedActorIds(current => {
    if (current.includes(actorId)) return current.filter(id => id !== actorId);
    if (current.length >= Math.max(0, supplyAvailable)) return current;
    return [...current, actorId];
  });
  const setTrack = (actorId: string, track: A5eTrack, next: number) => {
    const level = Math.max(0, Math.floor(next));
    onA5eTrackSet?.(actorId, track, track === 'strife' ? Math.min(7, level) : level);
  };
  const selectLayer = (value: string) => {
    if (value !== 'srd' && value !== 'a5e') return;
    onRestLayerChange?.(value);
    if (value === 'a5e' && suppliedActorIds.length === 0 && supplyAvailable >= actorIds.length) setSuppliedActorIds(actorIds);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };
  /** Что даст долгий отдых этой строке — словами, чтобы мастер видел до нажатия. */
  const longNote = (r: RestRow, restLayer: RestLayer) => {
    if (restLayer === 'a5e' && kind === 'long' && a5eAttemptFailed) {
      return `Попытка не засчитывается: ${a5eFailureReasons.join('; ')}; длительность ${durationHours} ч пройдёт, восстановление не применяется и Supply не будет потрачен`;
    }
    const parts: string[] = [];
    if (r.hp.current < r.hp.max || r.hp.temp > 0) parts.push('хиты полны');
    if (r.hitDice && r.hitDice.available < r.hitDice.total) {
      const usual = Math.max(1, Math.floor(r.hitDice.total / 2));
      const regained = restLayer === 'a5e' && roughingIt ? Math.floor(usual / 2) : usual;
      parts.push(`+${Math.min(r.hitDice.total - r.hitDice.available, regained)} костей хитов`);
    }
    if (r.exhaustion) parts.push(restLayer === 'srd'
      ? `истощение ${r.exhaustion} → ${r.exhaustion - 1 || 'снято'}`
      : `истощение ${r.exhaustion} без изменений`);
    if (restLayer === 'a5e') {
      const fatigue = r.a5eConditions?.fatigue ?? 0;
      const strife = r.a5eConditions?.strife ?? 0;
      const fed = suppliedActorIds.includes(r.id);
      const recovers = fed && !roughingIt;
      const nextFatigue = !fed ? fatigue + 1 : recovers ? (haven ? Math.max(0, fatigue - 1) : fatigue === 1 ? 0 : fatigue) : fatigue;
      const nextStrife = recovers ? (haven ? Math.max(0, strife - 1) : strife === 1 ? 0 : strife) : strife;
      if (nextFatigue !== fatigue) parts.push(`Fatigue ${fatigue} → ${nextFatigue}`);
      if (nextStrife !== strife) parts.push(`Strife ${strife} → ${nextStrife}`);
      if (activeStressByActor.get(r.id)?.id === 'terrorized') parts.push('Ужас: спит только при разумных мерах безопасности');
    }
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
      <div className="flex items-center gap-2">
        <span className="type-num-12 uppercase text-t2">Слой отдыха</span>
        <ToggleGroup.Root type="single" value={layer} onValueChange={selectLayer} aria-label="Слой правил отдыха" className="ml-auto flex items-center gap-px p-px bg-lo">
          {(['srd', 'a5e'] as const).map(id => (
            <ToggleGroup.Item key={id} value={id} className={`${OPT} ${layer === id ? OPT_ON : OPT_OFF}`}>{id === 'srd' ? 'SRD' : 'A5E'}</ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>
      {layer === 'a5e' ? (
        <div className="flex flex-col gap-1 bg-wl p-2 shadow-bevel-in">
          {kind === 'long' ? (
            <div className="grid grid-cols-2 gap-2 type-body-sm text-t2">
              <label className="flex flex-col gap-1">Всего часов периода
                <input aria-label="Длительность отдыха, ч" type="number" min={8} step={1} value={a5eDurationHours} onChange={e => setA5eDurationHours(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">Сон, ч
                <input aria-label="Сон во время отдыха, ч" type="number" min={0} max={durationHours} step={1} value={a5eSleepHours} onChange={e => setA5eSleepHours(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1">Напряжённая активность, мин
                <input aria-label="Прерывание отдыха, мин" type="number" min={0} step={1} value={a5eStrenuousMinutes} onChange={e => setA5eStrenuousMinutes(e.target.value)} className={INPUT} />
              </label>
            </div>
          ) : null}
          <div className="flex items-center gap-2 type-body-sm text-tx">
            <span className="min-w-0 flex-1">Место: {restPlace?.name ?? 'не указано'} · {placeHaven ? 'укрытие' : 'не укрытие'}</span>
            <select aria-label="Укрытие для этого отдыха" value={havenOverride === undefined ? 'place' : havenOverride ? 'yes' : 'no'} onChange={e => setHavenOverride(e.target.value === 'place' ? undefined : e.target.value === 'yes')} className="type-num-12 text-tx bg-wl shadow-bevel-in">
              <option value="place">Как указано у места</option>
              <option value="yes">Временно: укрытие</option>
              <option value="no">Временно: без укрытия</option>
            </select>
          </div>
          <fieldset className="flex flex-col gap-1 type-body-sm text-tx">
            <legend>Roughing it · отметьте условия, которые применялись</legend>
            {[
              ['armor', 'Спал в среднем или тяжёлом доспехе (кроме hide)'],
              ['bed', 'Спал без постели на камнях, сырой или неровной земле'],
              ['weather', 'Спал под непогодой'],
              ['cold', 'Спал без тепла в сильный холод'],
              ['insects', 'Спал без защиты от насекомых в болотистой местности'],
            ].map(([id, label]) => (
              <label key={id} className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Roughing it: ${label}`} checked={roughingConditions.includes(id)} onChange={e => setRoughingConditions(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))} className="accent-[var(--gd)]" />
                {label}
              </label>
            ))}
          </fieldset>
          {roughingIt && kind === 'long' ? <p className="type-body-xs text-t2">По A5E возвращается половина обычного числа костей хитов; Fatigue и Strife не снижаются.</p> : null}
          <p className="type-body-sm text-t2">{A5E_HAVEN_RULE}</p>
          <p className="type-body-sm text-t2">Fatigue и Strife — отдельные A5E-шкалы. Без Supply каждый отдыхающий получает +1 Fatigue; при неполном запасе отметьте, кто именно получил Supply (остальным добавится Fatigue).</p>
          {kind === 'long' ? <p className="type-num-12 text-t2">Supply распределено: {suppliedActorIds.filter(id => actorIds.includes(id)).length} · запас партии: {supplyAvailable}</p> : null}
        </div>
      ) : null}
      {a5eBlockedRows.length > 0 ? (
        <p role="status" className="type-body-sm text-t2" data-part="a5e-rest-cooldown">
          {a5eBlockedRows.filter(r => r.hp.current < 1).length > 0 ? `Для начала долгого отдыха A5E нужно хотя бы 1 HP: ${a5eBlockedRows.filter(r => r.hp.current < 1).map(r => r.name).join(', ')}. ` : ''}{a5eBlockedRows.some(r => r.hp.current >= 1) ? `Долгий отдых A5E даёт пользу не чаще одного раза за 24 часа: ${a5eBlockedRows.filter(r => r.hp.current >= 1).map(r => r.name).join(', ')}. Этот отдых завершился бы раньше срока; часы не будут продвинуты.` : ''}
        </p>
      ) : null}
      {a5eTimingActive && !a5eTimingValid ? (
        <p role="status" className="type-body-sm text-t2">Долгий отдых A5E длится минимум 8 часов; время сна и напряжённой активности должны быть целыми числами в пределах периода.</p>
      ) : null}
      {a5eAttemptFailed ? (
        <p role="status" data-part="a5e-rest-reset" className="type-body-sm text-t2">
          {strenuousMinutes > 60 ? 'Свыше 60 минут напряжённой активности сбрасывают период. ' : ''}
          {sleepHours < A5E_LONG_REST_MIN_SLEEP_HOURS ? `Для отдыха нужно не меньше ${A5E_LONG_REST_MIN_SLEEP_HOURS} часов сна (указано ${sleepHours}). ` : ''}
          Время пройдёт, но отдых не восстановит состояние и Supply не будет потрачен.
        </p>
      ) : null}
      <ol aria-label="Кто отдыхает" className="flex flex-col gap-1 max-h-80 overflow-auto">
        {rows.map(r => {
          const ent = ENTITY[r.kind];
          const on = resting[r.id] ?? false;
          const stressEffect = activeA5eStressEffect(r.a5eConditions?.mentalStress, nowSec);
          const n = r.hitDice ? parseDice(dice[r.id] ?? '', r.hitDice.available) : 0;
          return (
            <li key={r.id} data-actor={r.id} className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Отдыхает: ${r.name}`}
                checked={on}
                onChange={e => {
                  const checked = e.target.checked;
                  setResting(s => ({ ...s, [r.id]: checked }));
                  setSleeplessSaveResults(null);
                  if (!checked) setSuppliedActorIds(s => s.filter(id => id !== r.id));
                }}
                className="appearance-none size-4 flex-none bg-wl shadow-bevel-in cursor-pointer checked:bg-gd focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
              />
              <Icon name={ent.icon} size={16} color={ent.color} title={ent.label} className="flex-none" />
              <span className={`flex-1 min-w-0 truncate type-body ${on ? 'text-tx' : 'text-t2'}`} title={r.name}>{r.name}</span>
              <span className="type-num-12 text-t2 flex-none" title="Хиты">{hpText(r.hp)}</span>
              {(kind === 'short' || sleeplessRows.some(sleepless => sleepless.id === r.id)) && r.hitDice ? (
                <>
                  <span className="type-key text-t2 flex-none" title={`Кости хитов: d${r.hitDice.die}, осталось ${r.hitDice.available} из ${r.hitDice.total}${r.hitDice.reference ? ` · Источник: ${r.hitDice.reference}` : ''}`}>d{r.hitDice.die} · {r.hitDice.available}</span>
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
              {layer === 'a5e' && kind === 'long' ? (
                <div className="basis-full ml-6 flex items-center gap-2 type-body-xs text-t2">
                  <span className="w-14">Fatigue</span>
                  <button type="button" aria-label={`Уменьшить Fatigue: ${r.name}`} disabled={!onA5eTrackSet || !(r.a5eConditions?.fatigue)} onClick={() => setTrack(r.id, 'fatigue', (r.a5eConditions?.fatigue ?? 0) - 1)} className={BTN}>−</button>
                  <span className="type-num-12 text-tx" aria-label={`Fatigue: ${r.name}`}>{r.a5eConditions?.fatigue ?? 0}</span>
                  <button type="button" aria-label={`Увеличить Fatigue: ${r.name}`} disabled={!onA5eTrackSet} onClick={() => setTrack(r.id, 'fatigue', (r.a5eConditions?.fatigue ?? 0) + 1)} className={BTN}>+</button>
                  <span className="w-12">Strife</span>
                  <button type="button" aria-label={`Уменьшить Strife: ${r.name}`} disabled={!onA5eTrackSet || !(r.a5eConditions?.strife)} onClick={() => setTrack(r.id, 'strife', (r.a5eConditions?.strife ?? 0) - 1)} className={BTN}>−</button>
                  <span className="type-num-12 text-tx" aria-label={`Strife: ${r.name}`}>{r.a5eConditions?.strife ?? 0}/7</span>
                  <button type="button" aria-label={`Увеличить Strife: ${r.name}`} disabled={!onA5eTrackSet || (r.a5eConditions?.strife ?? 0) >= 7} onClick={() => setTrack(r.id, 'strife', (r.a5eConditions?.strife ?? 0) + 1)} className={BTN}>+</button>
                  {stressEffect ? <span className="type-body-xs text-gd" data-part="mental-stress" title="A5E SRD · Mental Stress Effects">{a5eStressEffectName(stressEffect.id)}{stressEffect.kind === 'short' ? ` · до ${Math.ceil((stressEffect.untilSec - nowSec) / 86400)} дн.` : ''}</span> : null}
                  <label className="ml-auto flex items-center gap-1" title="Этот отдыхающий получает Supply; выберите не больше запаса партии">
                    <input type="checkbox" aria-label={`Supply: ${r.name}`} checked={suppliedActorIds.includes(r.id)} disabled={!on || suppliedActorIds.length >= supplyAvailable && !suppliedActorIds.includes(r.id)} onChange={() => toggleSupply(r.id)} className="accent-[var(--gd)]" />
                    Supply
                  </label>
                </div>
              ) : null}
              {sleeplessRows.some(sleepless => sleepless.id === r.id) ? (
                <span className="basis-full ml-6 flex items-center gap-2 type-body-xs text-t2" data-part="sleepless-save">
                  {r.wisSave === undefined ? (
                    <label className="flex items-center gap-1">Модификатор спасброска Мудрости
                      <input aria-label={`Модификатор спасброска Мудрости: ${r.name}`} type="number" step={1} value={wisSaveOverrides[r.id] ?? ''} onChange={e => { setWisSaveOverrides(current => ({ ...current, [r.id]: e.target.value })); setSleeplessSaveResults(null); }} className={`${INPUT} w-12`} />
                    </label>
                  ) : <span>Спасбросок Мудрости {r.wisSave >= 0 ? '+' : ''}{r.wisSave} против Сл 15</span>}
                  {sleeplessSaveResults?.signature === sleeplessSaveSignature ? (
                    sleeplessSaveResults.failedActorIds.includes(r.id) ? (
                      <>
                        <span>Провал — только короткий отдых; Supply не расходуется</span>
                        <button type="button" disabled={!on || r.perception === undefined} title={r.perception === undefined ? 'В листе нет модификатора Восприятия' : 'Проверка Восприятия на обнаружение опасности во время отдыха · преимущество Sleepless'} onClick={() => onRoll(`1d20${r.perception! > 0 ? `+${r.perception}` : r.perception! < 0 ? r.perception : ''}`, `Восприятие · опасность во время отдыха · ${r.name}`, r.id, { kind: 'check', ability: 'wis', skill: 'perception', purpose: 'detect-danger-during-rest' })} className={BTN}>Проверить опасность</button>
                      </>
                    ) : <span>Успех — долгий отдых доступен</span>
                  ) : <span>Сначала бросьте спасбросок, чтобы продолжить</span>}
                  {stressEnabled && (r.a5eConditions?.strife ?? 0) >= 4 ? <span>· помеха спасброску от Strife</span> : null}
                </span>
              ) : null}
              {kind === 'short' && r.shortRestores && r.shortRestores.length > 0 ? (
                <span className="type-body-xs text-t2 flex-none" data-part="short-note" title="Вернёт короткий отдых (SRD)">{r.shortRestores.join(', ').toLowerCase()}</span>
              ) : kind === 'long' ? (
                <span className="type-body-xs text-t2 flex-none" data-part="long-note">{longNote(r, layer)}</span>
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
          {sleeperIds.length > 0 && !sleeplessSavesResolved ? 'Бросить спасбросок Sleepless' : 'Отдохнуть'}
        </button>
      </div>
    </div>
  );
}

export default RestForm;
