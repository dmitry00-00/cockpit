// «Черта × эффект» — лист «Нерасовые черты»: требования, какие характеристики поднимает, и вектор эффектов по колонкам.
import { useMemo } from 'react';
import { FEATS, type Source } from '../../rules/compendium';
import { ABILITY_LABELS, FEAT_EFFECT_LABELS, effectKindOrder, featRows, usedEffectKinds } from '../../rules/compendium/views';
import { Empty, SourceBadge, type Detail } from './parts';

export function FeatTable({ sources, query, selectedId, onSelect }: {
  sources: readonly Source[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string, detail: Detail) => void;
}) {
  const rows = useMemo(() => featRows(FEATS, sources, query), [sources, query]);
  const order = useMemo(() => effectKindOrder(FEATS), []);
  const kinds = useMemo(() => usedEffectKinds(rows, order), [rows, order]);
  if (rows.length === 0) return <Empty text="Ни одной черты под фильтром." />;
  const line = { boxShadow: 'inset 0 -1px 0 var(--lo)' };
  const withEffects = rows.filter(r => r.effectKinds.length > 0).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span className="type-num-12 text-t2">{rows.length} черт · у {withEffects} размечены эффекты · {kinds.length} колонок</span>
        <span className="type-body-xs text-t3">колонки эффектов — как в таблице; пустая колонка не значит «эффекта нет», значит «не размечено»</span>
      </div>
      <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[280px]">Черта</th>
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[110px]">Требования</th>
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[90px]">+1 к</th>
              {kinds.map(k => (
                <th key={k} className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[140px]">{FEAT_EFFECT_LABELS[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ feat, effectKinds }) => {
              const selected = selectedId === feat.id;
              const open = () => onSelect(feat.id, { title: feat.nameRu, subtitle: feat.name !== feat.nameRu ? feat.name : undefined, source: feat.source, text: feat.text });
              const pre = [
                ...feat.prerequisites.abilities.map(a => `${ABILITY_LABELS[a]} 13+`),
                ...(feat.prerequisites.spellcasting ? ['заклинатель'] : []),
              ];
              return (
                <tr key={feat.id} className="align-top">
                  <td className={`sticky left-0 z-10 ${selected ? 'bg-pl' : 'bg-cd'} px-3 py-1.5`} style={line}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={open}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left w-full"
                    >
                      <span className={`type-body-bold ${selected ? 'text-gd' : 'text-tx'}`}>{feat.nameRu}</span>
                      {feat.name !== feat.nameRu && <span className="type-key text-t3">{feat.name}</span>}
                      <SourceBadge source={feat.source} />
                    </button>
                  </td>
                  <td className="bg-pn px-3 py-1.5" style={line}><span className="type-body-xs text-t2">{pre.join(', ') || '—'}</span></td>
                  <td className="bg-pn px-3 py-1.5" style={line}><span className="type-num-12 text-t2">{feat.asi.map(a => ABILITY_LABELS[a]).join(' / ') || '—'}</span></td>
                  {kinds.map(k => (
                    <td key={k} className="bg-pn px-3 py-1.5 cursor-pointer" style={line} title={feat.effects[k]} onClick={open}>
                      <span className={`type-body-xs block max-w-[260px] truncate ${effectKinds.includes(k) ? 'text-tx' : 'text-t4'}`}>{feat.effects[k] ?? '·'}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
