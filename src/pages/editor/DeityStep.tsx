// Шаг «Божество» редактора персонажа (E8, ROADMAP 2.4): жрецу бог обязателен и должен давать домен подкласса (домены
// 5e из вики — к подклассам жреца компендиума), остальным — по желанию. Подсказка расы — пантеон, которому она
// по традиции молится (Seldarine у эльфов). Справочник богов грузится отдельным куском, когда шаг открыт.
import { useMemo, useState } from 'react';
import type { Era } from '../../campaign/era';
import { useDeities } from '../../cosmos/useDeities';
import { CLERIC_CLASS, type Draft } from './draft';
import { INPUT, Left, Option, Section } from './parts';

export interface DeityStepProps {
  draft: Draft;
  /** Имя подкласса жреца по-русски: «Жизни». */
  domainName?: string;
  /** Эпоха кампании — для подписей силы и мировоззрения; домены — всегда по 5e. */
  era: Era;
  onPick: (deity: Draft['deity']) => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function DeityStep({ draft, domainName, era, onPick }: DeityStepProps) {
  const mod = useDeities();
  const cleric = draft.classId === CLERIC_CLASS;
  const racePantheon = mod?.RACE_PANTHEON[draft.raceId];
  const [pantheon, setPantheon] = useState('');
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    if (!mod) return [];
    const q = fold(query.trim());
    return mod.DEITIES.map(d => ({ d, domains: mod.domains5e(d) }))
      // Жрецу — только боги с доменом подкласса; без подкласса — с любым доменом 5e.
      .filter(({ domains }) => !cleric || (draft.subclassId ? domains.includes(draft.subclassId) : domains.length > 0))
      .filter(({ d }) => !pantheon || d.pantheons?.includes(pantheon))
      .filter(({ d }) => !q || fold(d.name).includes(q) || (d.titles ?? []).some(t => fold(t).includes(q)))
      .sort((a, b) => a.d.name.localeCompare(b.d.name));
  }, [mod, cleric, draft.subclassId, pantheon, query]);

  if (!mod) return <p className="type-body-sm text-t2">Справочник богов загружается…</p>;
  const pantheonName = (id: string) => mod.pantheonById(id)?.name ?? id;
  const line = (f: 'power' | 'alignment') => (d: (typeof list)[number]['d']) => {
    const v = mod.fieldAt(d, f, era);
    return v ? (f === 'power' ? mod.powerLabel(v.cell.t) : mod.alignmentRu(v.cell.t)) : undefined;
  };
  /** Домены 5e так, как их пишет вики: «Life, Light». */
  const domainText = (d: (typeof list)[number]['d']) => (d.fields.domains?.['5eR'] ?? d.fields.domains?.['5e'])?.t;
  return (
    <Section
      title="Божество"
      right={cleric ? <Left n={draft.deity ? 0 : 1} /> : <span className="type-key text-t2">по желанию</span>}
      hint="Поля карточек {{Deity}} Forgotten Realms Wiki, CC BY-SA 3.0"
    >
      <p className="type-body-sm text-t2">
        {cleric
          ? draft.subclassId
            ? `Жрецу — бог с доменом ${domainName ?? draft.subclassId}: домены 5e по вики.`
            : 'Жрецу бог обязателен. Домен ещё не выбран (шаг «Класс») — пока все боги с доменами 5e.'
          : 'Не обязательно: бог на листе даёт его карточку и святые дни в календаре.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {racePantheon ? (
          <Option on={pantheon === racePantheon} title="Пантеон, которому по традиции молится раса" onClick={() => setPantheon(p => (p === racePantheon ? '' : racePantheon))}>
            Почитатели расы: {pantheonName(racePantheon)}
          </Option>
        ) : null}
        <label className="flex items-center gap-1">
          <span className="type-key uppercase text-t2">пантеон</span>
          <select value={pantheon} onChange={e => setPantheon(e.target.value)} className={`${INPUT} max-w-[220px]`}>
            <option value="">все</option>
            {mod.PANTHEONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <input type="text" autoComplete="off" aria-label="Поиск бога" placeholder="имя или титул" value={query} onChange={e => setQuery(e.target.value)} className={`${INPUT} w-[180px]`} />
        <span className="type-num-12 text-t2">{list.length}</span>
      </div>
      <div role="group" aria-label="Боги" className="flex flex-col gap-px max-h-[50vh] overflow-auto">
        {!cleric ? <Option on={!draft.deity} onClick={() => onPick(undefined)}>без бога</Option> : null}
        {list.map(({ d, domains }) => (
          <Option
            key={d.id}
            on={draft.deity?.id === d.id}
            title={[d.titles?.[0], d.pantheons?.map(pantheonName).join(', ')].filter(Boolean).join(' · ')}
            onClick={() => onPick({ id: d.id, name: d.name, domains })}
            className="flex items-baseline gap-2"
          >
            <span className="flex-none text-tx">{d.name}</span>
            <span className="flex-1 min-w-0 truncate text-t2">{[line('power')(d), line('alignment')(d)].filter(Boolean).join(' · ')}</span>
            {domains.length ? <span className="type-key text-t2 truncate max-w-[200px]" title="Домены жреца 5e">{domainText(d)}</span> : null}
          </Option>
        ))}
      </div>
    </Section>
  );
}

export default DeityStep;
