// «Уровень × подкласс» — лист класса из таблицы: слева бонус мастерства, ресурсы и умения класса,
// справа по колонке на подкласс; в клетке — умения, которые подкласс даёт на этом уровне.
import { useMemo } from 'react';
import { CLASSES, type CharacterClass, type Source } from '../../rules/compendium';
import { asiLevels, classLevelGrid, isSlotKey } from '../../rules/compendium/views';
import { Chip, Empty, Segmented, SourceBadge, type Detail } from './parts';

const PROF_LABELS: Readonly<Record<string, string>> = {
  skills: 'Навыки', armor: 'Доспехи', weapons: 'Оружие', tools: 'Инструменты', equipment: 'Снаряжение', asiRule: 'Правило ASI',
};

function Proficiencies({ cls }: { cls: CharacterClass }) {
  const entries = Object.entries(cls.proficiencies).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 bg-cd shadow-bevel p-3">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="type-key text-t3">{PROF_LABELS[k] ?? k}</dt>
          <dd className="type-body-xs text-tx whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ClassGrid({ classId, onClassChange, sources, selectedId, onSelect }: {
  classId: string;
  onClassChange: (id: string) => void;
  sources: readonly Source[];
  selectedId: string | null;
  onSelect: (id: string, detail: Detail) => void;
}) {
  const classes = useMemo(() => CLASSES.filter(c => sources.includes(c.source)), [sources]);
  const cls = classes.find(c => c.id === classId) ?? classes[0];
  const grid = useMemo(() => (cls ? classLevelGrid(cls, sources) : null), [cls, sources]);

  if (!cls || !grid) return <Empty text="Ни одного класса под фильтром." />;

  const slotKeys = grid.resourceKeys.filter(isSlotKey);
  const otherKeys = grid.resourceKeys.filter(k => !isSlotKey(k));
  const featureCount = cls.levels.reduce((n, l) => n + l.features.length, 0);
  const subFeatureCount = grid.subclasses.reduce((n, s) => n + s.features.length, 0);
  const asiAt = asiLevels(cls.id);
  const cell = 'px-2 py-1.5 align-top';
  const line = { boxShadow: 'inset 0 -1px 0 var(--lo)' };

  return (
    <div className="flex flex-col gap-3">
      <Segmented label="Класс" items={classes.map(c => ({ id: c.id, label: c.nameRu, hint: c.name }))} value={cls.id} onChange={onClassChange} />
      <div className="flex items-baseline gap-3">
        <span className="type-h-17 text-tx">{cls.nameRu}</span>
        {cls.name !== cls.nameRu && <span className="type-key text-t3">{cls.name}</span>}
        <SourceBadge source={cls.source} />
        <span className="type-num-12 text-t2">{grid.subclasses.length} подклассов · {featureCount} умений класса · {subFeatureCount} умений подклассов</span>
        {slotKeys.length > 0 && <span className="type-body-xs text-t3">цифры в шапке — круги ячеек заклинаний, 0 — заговоры; золотой уровень — повышение характеристик</span>}
      </div>
      <Proficiencies cls={cls} />
      <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2">Ур.</th>
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2" title="бонус мастерства">БМ</th>
              {otherKeys.map(k => (
                <th key={k} className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2 max-w-[120px]"><span className="block truncate" title={k}>{k}</span></th>
              ))}
              {slotKeys.map(k => (
                <th key={k} className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2" title={k === '0' ? 'заговоры' : `ячейки ${k}-го круга`}>{k}</th>
              ))}
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[200px]">Умения класса</th>
              {grid.subclasses.map(s => (
                <th key={s.id} className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 min-w-[180px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="type-h-15 text-t2">{s.name}</span>
                    <span className="flex items-baseline gap-2 whitespace-nowrap">
                      <SourceBadge source={s.source} />
                      {s.gainedAt !== null && <span className="type-key text-t4">с {s.gainedAt} ур.</span>}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => {
              const asi = asiAt.has(row.level);
              return (
                <tr key={row.level}>
                  <td className={`sticky left-0 z-10 bg-cd ${cell} text-right`} style={line} title={asi ? 'повышение характеристик (SRD)' : undefined}><span className={`type-num-15 ${asi ? 'text-gd' : 'text-tx'}`}>{row.level}</span></td>
                  <td className={`bg-pn ${cell} text-right`} style={line}><span className="type-num-12 text-t2">{row.proficiencyBonus === null ? '—' : `+${row.proficiencyBonus}`}</span></td>
                  {otherKeys.map(k => (
                    <td key={k} className={`bg-pn ${cell} text-right`} style={line}><span className="type-num-12 text-tx">{row.resources[k] ?? ''}</span></td>
                  ))}
                  {slotKeys.map(k => (
                    <td key={k} className={`bg-pn ${cell} text-right`} style={line}><span className={`type-num-12 ${row.resources[k] ? 'text-tx' : 'text-t4'}`}>{row.resources[k] ?? '·'}</span></td>
                  ))}
                  <td className={`bg-pn ${cell}`} style={line}>
                    <div className="flex flex-col gap-1">
                      {row.features.map((f, i) => (
                        <Chip
                          key={`${f.id}-${i}`}
                          label={f.name}
                          text={f.text}
                          selected={selectedId === `${cls.id}#${row.level}#${f.id}`}
                          onSelect={() => onSelect(`${cls.id}#${row.level}#${f.id}`, { title: f.name, subtitle: `${cls.nameRu} · ${row.level} уровень`, source: cls.source, text: f.text })}
                        />
                      ))}
                    </div>
                  </td>
                  {grid.subclasses.map(s => (
                    <td key={s.id} className={`bg-pn ${cell}`} style={line}>
                      <div className="flex flex-col gap-1">
                        {row.bySubclass[s.id].map((f, i) => (
                          <Chip
                            key={`${f.id}-${i}`}
                            label={f.name}
                            text={f.text}
                            selected={selectedId === `${s.id}#${row.level}#${f.id}`}
                            onSelect={() => onSelect(`${s.id}#${row.level}#${f.id}`, { title: f.name, subtitle: `${cls.nameRu} · ${s.name} · ${row.level} уровень`, source: s.source, text: f.text })}
                          />
                        ))}
                      </div>
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
