import { useState, type FormEvent } from 'react';
import { frontDangerProgress, frontDelta, fulfillPortentDelta, resolveDangerDelta } from '../campaign/fronts';
import type { State, Thread, WorldDelta } from '../engine/state';
import { ProgressMeter } from './ProgressMeter';

interface DangerDraft { name: string; impulse: string; doom: string; portents: string }
const blankDanger = (): DangerDraft => ({ name: '', impulse: '', doom: '', portents: '' });
const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);
const idPart = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'front';
const uniqueId = (kind: string, key: string) => `${kind}-${key}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;

export interface ThreadFrontEditorProps {
  state: State;
  thread: Thread;
  pending: boolean;
  onPropose: (delta: WorldDelta) => void;
}

/** GM-only preparation and manual advancement for a Dungeon World front attached to a campaign thread. */
export function ThreadFrontEditor({ state, thread, pending, onPropose }: ThreadFrontEditorProps) {
  const existing = thread.front;
  const [type, setType] = useState<'adventure' | 'campaign'>(existing?.type ?? 'adventure');
  const [stakes, setStakes] = useState(existing?.stakes.join('\n') ?? '');
  const [cast, setCast] = useState(existing?.cast?.join('\n') ?? '');
  const [dangers, setDangers] = useState<DangerDraft[]>(existing?.dangers.map(danger => ({
    name: danger.name, impulse: danger.impulse, doom: danger.impendingDoom, portents: danger.portents.map(sign => sign.text).join('\n'),
  })) ?? [blankDanger(), blankDanger()]);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const key = idPart(thread.id);
  const portentLimit = type === 'adventure' ? '1–3' : '3–5';
  const editingLocked = !!existing?.dangers.some(danger => danger.resolution);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stakeList = lines(stakes);
    const dangerList = dangers.map((danger, dangerIndex) => {
      const old = existing?.dangers[dangerIndex];
      const signLines = lines(danger.portents);
      return {
        id: old?.id ?? `${key}-danger-${dangerIndex + 1}`,
        name: danger.name.trim(), impulse: danger.impulse.trim(), impendingDoom: danger.doom.trim(),
        ...(old?.resolution ? { resolution: old.resolution } : {}),
        portents: signLines.map((text, signIndex) => {
          const oldSign = old?.portents[signIndex];
          return { id: oldSign?.id ?? `${key}-danger-${dangerIndex + 1}-portent-${signIndex + 1}`, text, fulfilled: oldSign && oldSign.text === text ? oldSign.fulfilled : false };
        }),
      };
    });
    const count = dangerList.reduce((sum, danger) => sum + danger.portents.length, 0);
    if (stakeList.length < 1 || stakeList.length > 3) return setError('Добавьте от 1 до 3 вопросов о ставках, по одному на строку.');
    if (dangerList.some(danger => !danger.name || !danger.impulse || !danger.impendingDoom)) return setError('Заполните имя, стремление и неотвратимую беду у каждой опасности.');
    if (count < (type === 'adventure' ? 1 : 3) || count > (type === 'adventure' ? 3 : 5)) return setError(`Для этого фронта нужно ${portentLimit} мрачных знака всего, по одному на строку.`);
    setError('');
    onPropose(frontDelta(state, thread.id, { source: 'dungeon-world-srd:fronts', type, stakes: stakeList, dangers: dangerList, ...(lines(cast).length ? { cast: lines(cast) } : {}) }, uniqueId('thread-front', key)));
  }

  return (
    <details className="px-2 py-1 bg-pl shadow-plate type-body-xs text-t2">
      <summary className="cursor-pointer">{existing ? 'Фронт и мрачные знаки' : 'Подготовить фронт Dungeon World'}</summary>
      <p className="mt-1">Структура: Dungeon World SRD · Fronts (CC BY)</p>
      {existing ? (
        <div className="mt-2 flex flex-col gap-2" aria-label={`Фронт: ${thread.name}`}>
          <p className="text-tx">{existing.type === 'adventure' ? 'Фронт приключения' : 'Фронт кампании'} · вопросы о ставках</p>
          <ul className="list-disc pl-5">{existing.stakes.map((question, index) => <li key={`stake-${index}`}>{question}</li>)}</ul>
          {existing.dangers.map(danger => {
            const progress = frontDangerProgress(danger);
            return (
            <section key={danger.id} className="flex flex-col gap-1 border-l-2 border-gd pl-2" aria-label={`Опасность: ${danger.name}`}>
              <strong className="text-tx">{danger.name}</strong>
              <span>Стремление: {danger.impulse}</span>
              <span>Неотвратимая беда: {danger.impendingDoom}</span>
              {progress ? <ProgressMeter value={progress} label={`Мрачные знаки: ${danger.name}`} className="max-w-sm" /> : null}
              <ol className="list-decimal pl-5">
                {danger.portents.map(portent => (
                  <li key={portent.id} className={portent.fulfilled ? 'text-gd' : 'text-tx'}>
                    <span>{portent.text}</span>
                    {!portent.fulfilled ? (
                      <button type="button" disabled={pending} className="ml-2 border border-solid border-gd px-1 py-0.5 text-tx focus-visible:shadow-[var(--glow-gold)] disabled:opacity-50"
                        title="Отметить после события в игре или жёсткого хода мастера"
                        onClick={() => onPropose(fulfillPortentDelta(state, thread.id, danger.id, portent.id, uniqueId(`front-portent-${portent.id}`, key)))}>
                        Предложить отметку
                      </button>
                    ) : <span className="ml-2">Наступил</span>}
                  </li>
                ))}
              </ol>
              {danger.resolution ? (
                <p className="text-gd">Беда наступила: {danger.resolution.text}</p>
              ) : danger.portents.length > 0 && danger.portents.every(portent => portent.fulfilled) ? (
                <div className="flex flex-col gap-1">
                  <label className="flex flex-col gap-1"><span>Что изменилось в мире после беды «{danger.impendingDoom}»?</span>
                    <textarea aria-label={`Запись исхода опасности ${danger.name}`} value={resolutions[danger.id] ?? ''} rows={2} disabled={pending}
                      onChange={event => setResolutions(values => ({ ...values, [danger.id]: event.target.value }))} className="w-full bg-cd p-1 text-tx" />
                  </label>
                  <button type="button" disabled={pending || !(resolutions[danger.id] ?? '').trim()}
                    onClick={() => onPropose(resolveDangerDelta(state, thread.id, danger.id, resolutions[danger.id] ?? '', uniqueId(`front-doom-${danger.id}`, key)))}
                    className="self-start border border-solid border-gd px-1 py-0.5 text-tx focus-visible:shadow-[var(--glow-gold)] disabled:opacity-50">
                    Предложить запись исхода
                  </button>
                  <p>Это запись фронта. Изменения мест, фракций и фактов оформляются отдельными предложениями.</p>
                </div>
              ) : null}
            </section>
            );
          })}
          {existing.cast?.length ? <p>Действующие лица: {existing.cast.join(', ')}</p> : null}
        </div>
      ) : null}
      <form className="mt-2 flex flex-col gap-2" onSubmit={submit}>
        <label className="flex flex-wrap items-center gap-2">
          <span>Масштаб</span>
          <select value={type} onChange={event => setType(event.target.value as 'adventure' | 'campaign')} disabled={pending || editingLocked} className="bg-cd px-1 py-0.5 text-tx">
            <option value="adventure">Приключение</option><option value="campaign">Кампания</option>
          </select>
        </label>
        <label className="flex flex-col gap-1"><span>Вопросы о ставках · 1–3 строки</span>
          <textarea value={stakes} onChange={event => setStakes(event.target.value)} rows={2} disabled={pending || editingLocked} className="w-full bg-cd p-1 text-tx" />
        </label>
        {dangers.map((danger, index) => (
          <fieldset key={index} className="flex flex-col gap-1 border border-solid border-gd p-2">
            <legend>Опасность {index + 1}</legend>
            <label className="flex flex-col gap-1"><span>Имя</span><input value={danger.name} disabled={pending || editingLocked} onChange={event => setDangers(values => values.map((x, i) => i === index ? { ...x, name: event.target.value } : x))} className="bg-cd px-1 py-0.5 text-tx" /></label>
            <label className="flex flex-col gap-1"><span>Стремление</span><input value={danger.impulse} disabled={pending || editingLocked} onChange={event => setDangers(values => values.map((x, i) => i === index ? { ...x, impulse: event.target.value } : x))} className="bg-cd px-1 py-0.5 text-tx" /></label>
            <label className="flex flex-col gap-1"><span>Неотвратимая беда</span><input value={danger.doom} disabled={pending || editingLocked} onChange={event => setDangers(values => values.map((x, i) => i === index ? { ...x, doom: event.target.value } : x))} className="bg-cd px-1 py-0.5 text-tx" /></label>
            <label className="flex flex-col gap-1"><span>Мрачные знаки · {portentLimit} всего во фронте, по одному на строку</span>
              <textarea value={danger.portents} disabled={pending || editingLocked} rows={2} onChange={event => setDangers(values => values.map((x, i) => i === index ? { ...x, portents: event.target.value } : x))} className="w-full bg-cd p-1 text-tx" />
            </label>
            {dangers.length > 2 && index === dangers.length - 1 ? <button type="button" disabled={pending || editingLocked} onClick={() => setDangers(values => values.slice(0, -1))} className="self-start border border-solid border-gd px-1 py-0.5 text-tx">Убрать последнюю опасность</button> : null}
          </fieldset>
        ))}
        {dangers.length < 3 ? <button type="button" disabled={pending || editingLocked} onClick={() => setDangers(values => [...values, blankDanger()])} className="self-start border border-solid border-gd px-2 py-1 text-tx">Добавить опасность</button> : null}
        <label className="flex flex-col gap-1"><span>Действующие лица · необязательно, по одному на строку</span>
          <textarea value={cast} onChange={event => setCast(event.target.value)} rows={2} disabled={pending || editingLocked} className="w-full bg-cd p-1 text-tx" />
        </label>
        {error ? <p role="alert" className="text-src-sim">{error}</p> : null}
        <button type="submit" disabled={pending || editingLocked} className="self-start border border-solid border-gd bg-cd px-2 py-1 text-tx focus-visible:shadow-[var(--glow-gold)] disabled:opacity-50">
          {pending ? 'Сначала решите входящее' : editingLocked ? 'Сначала создайте отдельную нить для новой опасности' : existing ? 'Предложить изменения фронта' : 'Предложить фронт'}
        </button>
        {existing ? <button type="button" disabled={pending} onClick={() => onPropose(frontDelta(state, thread.id, null, uniqueId('thread-front-remove', key)))} className="self-start border border-solid border-gd px-2 py-1 text-tx">Предложить снять фронт</button> : null}
      </form>
      <p className="mt-1">Мрачные знаки отмечаются вручную после события в игре или жёсткого хода. После всех знаков мастер записывает исход отдельным предложением; реальные изменения мира требуют собственных событий.</p>
    </details>
  );
}
