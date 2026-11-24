import { useState } from 'react';
import type { A5ePrestigeAward, A5ePrestigeProfile, Actor, Location, State } from '../engine/state';
import type { RegionTier } from '../rules/a5e/journey';
import { prestigeAreaLabel, prestigeCheck } from '../rules/a5e/prestige';
import { prestigeCoverage, prestigeProfileOf, prestigeRatingOf, type PrestigeCoverage } from '../campaign/prestige';

type RollMode = 'normal' | 'disadvantage';

export interface PrestigePanelProps {
  party: readonly Actor[];
  locations: Readonly<Record<string, Location>>;
  state: State;
  currentLocationId?: string;
  regionTier?: RegionTier;
  onProfileUpdate: (actorId: string, profile: A5ePrestigeProfile) => void;
  onRoll: (formula: string, label: string, actorId: string, mode: RollMode) => number;
}

const AWARD_SOURCE_LABEL: Readonly<Record<A5ePrestigeAward['source'], string>> = {
  stronghold: 'твердыня',
  'great-deed': 'великое деяние',
  'class-feature': 'умение класса',
  'table-rule': 'правило стола',
};

function AwardEditor({ actor, profile, onUpdate }: {
  actor: Actor;
  profile: A5ePrestigeProfile;
  onUpdate: (profile: A5ePrestigeProfile) => void;
}) {
  const [points, setPoints] = useState('1');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState<A5ePrestigeAward['source']>('great-deed');
  const parsedPoints = Number(points);
  const canAdd = Number.isSafeInteger(parsedPoints) && parsedPoints > 0 && !!reason.trim();
  const add = () => {
    if (!canAdd) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `prestige-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onUpdate({ ...profile, awards: [...profile.awards, { id, points: parsedPoints, reason: reason.trim(), source }] });
    setReason('');
    setPoints('1');
  };

  return (
    <details className="border-t border-t3/30 pt-2">
      <summary className="type-body-sm text-t2 cursor-pointer focus-visible:shadow-[var(--glow-gold)]">Дополнительные очки и основания</summary>
      <div className="flex flex-col gap-2 pt-2">
        {profile.awards.length ? (
          <ul className="flex flex-col gap-1" aria-label={`Награды Prestige: ${actor.name}`}>
            {profile.awards.map(award => (
              <li key={award.id} className="flex flex-wrap items-center gap-x-2 type-body-sm text-t2">
                <span className="text-tx">+{award.points}</span>
                <span>{AWARD_SOURCE_LABEL[award.source]}</span>
                <span>· {award.reason}</span>
                <button type="button" className="text-t2 underline underline-offset-2 hover:text-tx" aria-label={`Удалить награду Prestige: ${award.reason}`} onClick={() => onUpdate({ ...profile, awards: profile.awards.filter(row => row.id !== award.id) })}>убрать</button>
              </li>
            ))}
          </ul>
        ) : <p className="type-body-sm text-t2">Дополнительных наград нет.</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 type-body-sm text-t2">Очки
            <input aria-label={`Очки Prestige для ${actor.name}`} className="w-20 rounded border border-t3 bg-bg px-2 py-1 text-tx" type="number" min="1" step="1" value={points} onChange={event => setPoints(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 type-body-sm text-t2">Основание
            <select aria-label={`Основание награды Prestige для ${actor.name}`} className="rounded border border-t3 bg-bg px-2 py-1 text-tx" value={source} onChange={event => setSource(event.target.value as A5ePrestigeAward['source'])}>
              {Object.entries(AWARD_SOURCE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 type-body-sm text-t2">За что
            <input aria-label={`Причина награды Prestige для ${actor.name}`} className="rounded border border-t3 bg-bg px-2 py-1 text-tx" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} placeholder="Краткая запись для мастера" />
          </label>
          <button type="button" disabled={!canAdd} className="rounded border border-gd/50 px-2 py-1 type-body-sm text-tx disabled:opacity-40" onClick={add}>Добавить</button>
        </div>
        <p className="type-body-sm text-t2">Сумму задаёт ведущий по выбранному источнику; система её не начисляет автоматически.</p>
      </div>
    </details>
  );
}

function CharacterPrestige({ actor, locations, state, currentLocationId, regionTier, onProfileUpdate, onRoll }: PrestigePanelProps & { actor: Actor }) {
  const [coverageChoice, setCoverageChoice] = useState<'auto' | 'inside' | 'outside'>('auto');
  const [tierChoice, setTierChoice] = useState<RegionTier | undefined>();
  const [extremelyFar, setExtremelyFar] = useState(false);
  const [result, setResult] = useState<{ total: number; dc: number; success: boolean; mode: RollMode }>();
  const profile = prestigeProfileOf(actor);
  const rating = prestigeRatingOf(actor);
  if (rating === null) return null;
  const autoCoverage = prestigeCoverage(state, profile.centerLocationId, currentLocationId, rating);
  const coverage: PrestigeCoverage = coverageChoice === 'auto' ? autoCoverage : coverageChoice;
  const tier = tierChoice ?? regionTier;
  const locationsList = Object.values(locations).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const updateCenter = (centerLocationId: string) => {
    const next = { ...profile, ...(centerLocationId ? { centerLocationId } : {}) };
    if (!centerLocationId) delete next.centerLocationId;
    onProfileUpdate(actor.id, next);
  };
  const attemptRecognition = () => {
    if (coverage === 'unknown' || tier === undefined) return;
    const check = prestigeCheck(rating, tier, coverage === 'outside', extremelyFar);
    const label = `A5E Prestige · узнают ли ${actor.name} · регион ${tier} · Сл ${check.dc}${coverage === 'outside' ? ' · вне центра' : ''}${extremelyFar ? ' · очень далеко' : ''}`;
    const total = onRoll(`1d20+${rating}`, label, actor.id, check.mode);
    setResult({ total, dc: check.dc, success: total >= check.dc, mode: check.mode });
  };

  return (
    <article className="flex flex-col gap-2 rounded border border-t3/50 bg-cd p-3 shadow-plate" data-part="a5e-prestige" data-actor={actor.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="type-h-15 text-tx">{actor.name} · Prestige <span className="type-num-14">{rating}</span></h3>
        <span className="type-body-sm text-t2">область: {prestigeAreaLabel(rating)} · предел последователей: {rating}</span>
      </div>
      <label className="flex flex-wrap items-center gap-2 type-body-sm text-t2">Центр Prestige
        <select aria-label={`Центр Prestige: ${actor.name}`} className="min-w-52 max-w-full rounded border border-t3 bg-bg px-2 py-1 text-tx" value={profile.centerLocationId ?? ''} onChange={event => updateCenter(event.target.value)}>
          <option value="">Не выбран</option>
          {locationsList.map(location => <option key={location.id} value={location.id}>{location.name} · {location.scale}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 type-body-sm text-t2">
        <label>Область в текущем месте
          <select aria-label={`Область Prestige в этой сцене: ${actor.name}`} className="ml-2 rounded border border-t3 bg-bg px-2 py-1 text-tx" value={coverageChoice} onChange={event => { setCoverageChoice(event.target.value as 'auto' | 'inside' | 'outside'); setResult(undefined); }}>
            <option value="auto">Авто: {autoCoverage === 'inside' ? 'в центре' : autoCoverage === 'outside' ? 'вне центра' : 'не определено'}</option>
            <option value="inside">Внутри центра</option>
            <option value="outside">Вне центра (помеха)</option>
          </select>
        </label>
        <label>Ступень региона
          <select aria-label={`Ступень региона для Prestige: ${actor.name}`} className="ml-2 rounded border border-t3 bg-bg px-2 py-1 text-tx" value={tierChoice ?? regionTier ?? ''} onChange={event => { setTierChoice(event.target.value === '' ? undefined : Number(event.target.value) as RegionTier); setResult(undefined); }}>
            <option value="">Не задана</option>
            {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1"><input type="checkbox" checked={extremelyFar} onChange={event => { setExtremelyFar(event.target.checked); setResult(undefined); }} /> Очень далеко от центра</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!profile.centerLocationId || coverage === 'unknown' || tier === undefined} className="rounded border border-gd/60 px-2.5 py-1 type-body-sm text-tx disabled:opacity-40" onClick={attemptRecognition}>Проверить, узнают ли</button>
        {result ? <p role="status" className="type-body-sm text-t2">Итог {result.total} против Сл {result.dc}{result.mode === 'disadvantage' ? ' · помеха' : ''}: {result.success ? 'вас узнали — ведущий решает, кто и что слышал' : 'собеседник не узнал персонажа'}.</p> : null}
      </div>
      {coverage === 'unknown' ? <p className="type-body-sm text-t2">Модель мест не задаёт эту область однозначно. Перед проверкой выберите, внутри ли персонаж центра.</p> : null}
      {tier === undefined ? <p className="type-body-sm text-t2">Для Prestige не определена ступень A5E-региона; задайте её вручную.</p> : null}
      <AwardEditor actor={actor} profile={profile} onUpdate={next => onProfileUpdate(actor.id, next)} />
    </article>
  );
}

export function PrestigePanel(props: PrestigePanelProps) {
  const characters = props.party.filter(actor => actor.kind === 'pc' && !actor.removed && actor.sheet);
  if (!characters.length) return null;
  return (
    <section className="flex flex-col gap-2 border-t border-t3/40 pt-3" aria-label="A5E Prestige" data-part="prestige-panel">
      <div>
        <h2 className="type-h-15 uppercase text-t2">A5E Prestige</h2>
        <p className="type-body-sm text-t2">Личный рейтинг персонажа. Не связан с известностью партии у фракций.</p>
      </div>
      {characters.map(actor => {
        const profile = prestigeProfileOf(actor);
        const awards = profile.awards.reduce((sum, award) => sum + award.points, 0);
        return <CharacterPrestige key={`${actor.id}:${props.currentLocationId ?? ''}:${props.regionTier ?? ''}:${profile.centerLocationId ?? ''}:${actor.sheet?.level ?? ''}:${awards}`} actor={actor} {...props} />;
      })}
    </section>
  );
}
