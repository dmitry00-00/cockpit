// «Раса × фасет» — лист «Кратко» из таблицы рас, только клетки заполняются из данных, а не руками.
import { useMemo } from 'react';
import { RACES, type Source } from '../../rules/compendium';
import { ABILITY_LABELS, TRAIT_KIND_LABELS, formatAsi, isFlatAsi, raceFacetRows, traitKindOrder, usedTraitKinds, type RaceFacetRow } from '../../rules/compendium/views';
import { Chip, Empty, SourceBadge, type Detail } from './parts';

const ABILITY_TEXT: Readonly<Record<string, string>> = {
  str: 'text-ab-str-hi', dex: 'text-ab-dex-hi', con: 'text-ab-con-hi', int: 'text-ab-int-hi', wis: 'text-ab-wis-hi', cha: 'text-ab-cha-hi',
};

function AsiCell({ row }: { row: RaceFacetRow }) {
  const parts = formatAsi(row.asi);
  if (parts.length === 0 && !row.asiChoice) return <span className="type-key text-t4">—</span>;
  if (isFlatAsi(row.asi) && !row.asiChoice) return <span className="type-num-12 text-tx">{parts[0].value > 0 ? `+${parts[0].value}` : parts[0].value} ко всем</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
        {parts.map(p => (
          <span key={p.ability} className={`type-num-12 ${ABILITY_TEXT[p.ability]}`}>{p.value > 0 ? `+${p.value}` : p.value} {ABILITY_LABELS[p.ability]}</span>
        ))}
      </span>
      {row.asiChoice ? <span className="type-body-xs text-t2">
        На выбор из {row.asiChoice.from.map(a => ABILITY_LABELS[a]).join(', ')}: +{row.asiChoice.amount} к {row.asiChoice.count === 1 ? 'одной характеристике' : `${row.asiChoice.count} характеристикам`}
      </span> : null}
    </span>
  );
}

/** Заклинания подрасы — по уровням, для панели подробностей; в клетке только счётчик, иначе строка растёт на десять строк. */
function spellText(spells: RaceFacetRow['spells']): string {
  const byLevel = new Map<number, string[]>();
  for (const s of spells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s.name]);
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, names]) => `${level} уровень: ${names.join(', ')}`).join('\n');
}

export function RaceMatrix({ sources, query, selectedId, onSelect }: {
  sources: readonly Source[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string, detail: Detail) => void;
}) {
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = raceFacetRows(RACES, sources);
    if (!q) return all;
    // Совпавшая раса тянет за собой подрасы, совпавшая подраса — родителя.
    const hit = (r: RaceFacetRow) => r.name.toLowerCase().includes(q) || r.nameRu.toLowerCase().includes(q);
    const keep = new Set<string>();
    for (const r of all) {
      if (!hit(r)) continue;
      keep.add(r.key);
      const parent = r.key.split('/')[0];
      keep.add(parent);
      if (r.level === 'race') for (const s of all) if (s.key.startsWith(`${parent}/`)) keep.add(s.key);
    }
    return all.filter(r => keep.has(r.key));
  }, [sources, query]);
  const order = useMemo(() => traitKindOrder(RACES), []);
  const kinds = useMemo(() => usedTraitKinds(rows, order), [rows, order]);

  if (rows.length === 0) return <Empty text="Ни одной расы под фильтром." />;

  const races = rows.filter(r => r.level === 'race').length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span className="type-num-12 text-t2">{races} рас · {rows.length - races} подрас · {kinds.length} фасетов</span>
        <span className="type-body-xs text-t3">фасет — эвристика импортёра по названию и началу текста; «Прочее» — то, что она не распознала</span>
      </div>
      <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[220px]">Раса · подраса</th>
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[150px]">ASI</th>
              {kinds.map(k => (
                <th key={k} className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[120px]">{TRAIT_KIND_LABELS[k]}</th>
              ))}
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[130px]">Заклинания</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isRace = r.level === 'race';
              const rowBg = isRace ? 'bg-cd' : 'bg-pn';
              return (
                <tr key={r.key} className="align-top">
                  <td className={`sticky left-0 z-10 ${rowBg} px-3 py-1.5 ${isRace ? '' : 'pl-7'}`} style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}>
                    <div className="flex items-baseline gap-2">
                      <span className={isRace ? 'type-h-15 text-tx' : 'type-body-sm text-tx'}>{r.nameRu}</span>
                      {r.name !== r.nameRu && <span className="type-key text-t3">{r.name}</span>}
                      <SourceBadge source={r.source} />
                    </div>
                  </td>
                  <td className={`${rowBg} px-3 py-1.5`} style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}><AsiCell row={r} /></td>
                  {kinds.map(k => (
                    <td key={k} className={`${rowBg} px-2 py-1.5`} style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}>
                      <div className="flex flex-col gap-1">
                        {r.marks[k] !== undefined && (
                          <span className="flex items-center gap-1.5 type-body-xs text-t2" title="серая отметка в листе «Кратко» таблицы">
                            <span className="inline-block w-2 h-2 bg-t3 shrink-0" aria-hidden />
                            {r.marks[k] === true ? 'отмечено' : r.marks[k]}
                          </span>
                        )}
                        {r.cells[k].map(t => (
                          <Chip
                            key={t.id}
                            label={t.name}
                            text={t.text}
                            selected={selectedId === `${r.key}#${t.id}`}
                            onSelect={() => onSelect(`${r.key}#${t.id}`, {
                              title: t.name,
                              subtitle: `${r.nameRu} · ${TRAIT_KIND_LABELS[t.kind]}${t.kind === 'other' ? '' : t.kindSource === 'keyword' ? ' (по названию)' : t.kindSource === 'text' ? ' (по тексту)' : ''}`,
                              source: r.source,
                              text: t.text,
                              cell: t.cell,
                            })}
                          />
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className={`${rowBg} px-3 py-1.5`} style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}>
                    {r.spells.length > 0 && (
                      <Chip
                        label={`заклинаний: ${r.spells.length}`}
                        text={spellText(r.spells)}
                        selected={selectedId === `${r.key}#spells`}
                        onSelect={() => onSelect(`${r.key}#spells`, { title: `Заклинания: ${r.nameRu}`, subtitle: 'по уровням персонажа', source: r.source, text: spellText(r.spells) })}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
