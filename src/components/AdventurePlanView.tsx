import { useMemo, useState, type KeyboardEvent } from 'react';
import type { AdventureBundle, AdventureNode } from '../packages/adventure';
import { getRuntimePlanGeometry, type PlanPoint, type RuntimePlanArea, type RuntimePlanFeature } from '../packages/phandelverRuntimePlans';

export interface AdventurePlanViewProps {
  node: AdventureNode;
  bundle: AdventureBundle;
  onOpenNode: (nodeId: string) => void;
}

const pointsString = (points: readonly PlanPoint[]) => points.map(([x, y]) => `${x},${y}`).join(' ');
const featureLabel = (feature: RuntimePlanFeature) => ({
  wall: 'Каменная стена',
  'cavern-edge': 'Контур пещеры',
  door: 'Дверной проём',
  'secret-door': 'Скрытая дверь',
  'broken-door': 'Проломленная дверь',
}[feature.kind]);
function areaCenter(area: RuntimePlanArea): PlanPoint {
  if (area.shape.kind === 'marker') return area.shape.at;
  const sum = area.shape.points.reduce(([x, y], [nextX, nextY]) => [x + nextX, y + nextY] as [number, number], [0, 0]);
  return [sum[0] / area.shape.points.length, sum[1] / area.shape.points.length];
}
function areaName(area: RuntimePlanArea, bundle: AdventureBundle): string {
  return area.targetNodeId ? bundle.nodes.find(node => node.id === area.targetNodeId)?.name ?? area.label : area.label;
}

/** Interactive, source-linked area navigation. It intentionally has no raster or combat collision mesh. */
export function AdventurePlanView({ node, bundle, onOpenNode }: AdventurePlanViewProps) {
  const geometry = useMemo(() => getRuntimePlanGeometry(node, bundle), [node, bundle]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>();
  if (!geometry) return null;
  const selected = geometry.areas.find(area => area.id === selectedAreaId) ?? geometry.areas[0];
  const target = selected?.targetNodeId ? bundle.nodes.find(item => item.id === selected.targetNodeId) : undefined;
  const gridPatternId = `plan-grid-${node.id}`;
  const handleAreaKey = (event: KeyboardEvent<SVGGElement>, areaId: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAreaId(areaId); }
  };
  const isGrid = geometry.coordinateUnit === 'grid-cell';
  const labelSize = isGrid ? Math.max(.65, Math.min(1.15, geometry.width / 32)) : 16;
  const scaleLabel = isGrid && geometry.feetPerCell
    ? `Сетка · ${geometry.feetPerCell} футов на клетку`
    : geometry.scaleBar ? `Графическая шкала · ${geometry.scaleBar.feet} футов` : 'Масштаб не задан';

  return <section className="flex flex-col gap-2 border border-br p-2" aria-label={`Интерактивный план: ${geometry.title}`}>
    <div className="flex items-baseline justify-between gap-2 flex-wrap">
      <h5 className="type-h-17">План · {geometry.title}</h5>
      <div className="flex items-center gap-3 type-body-xs text-t2">
        <span>{scaleLabel}</span>
        <a href={geometry.sourceReference.url} target="_blank" rel="noreferrer noopener"
          aria-label={`Сверить ориентиры с источником: ${geometry.sourceReference.label}`}
          className="text-gd underline underline-offset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gd">
          Сверить с 5e.tools ↗
        </a>
      </div>
    </div>
    <div className="max-h-[62vh] min-h-[230px] overflow-auto bg-pn">
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="group" aria-label={`${geometry.title}, выбор области`} className="block w-full h-auto max-h-[62vh]">
        <defs>
          {isGrid ? <pattern id={gridPatternId} width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#8c8070" strokeWidth=".035" opacity=".45" />
          </pattern> : null}
        </defs>
        <rect x="0" y="0" width={geometry.width} height={geometry.height} fill="#201c20" />
        {isGrid ? <rect x="0" y="0" width={geometry.width} height={geometry.height} fill={`url(#${gridPatternId})`} /> : null}
        {geometry.paths.map(route => <polyline key={route.id} points={pointsString(route.points)} fill="none"
          stroke={route.kind === 'water' ? '#5b94a4' : '#b69b73'} strokeWidth={route.kind === 'water' ? (isGrid ? .8 : 17) : (isGrid ? .3 : 9)}
          strokeLinecap="round" strokeLinejoin="round" opacity={route.kind === 'water' ? .76 : .54} />)}
        {geometry.areas.map(area => {
          const center = area.shape.kind === 'marker' ? area.shape.at : areaCenter(area);
          const active = selected?.id === area.id;
          const linkedName = area.targetNodeId ? areaName(area, bundle) : undefined;
          const activate = () => setSelectedAreaId(area.id);
          return <g key={area.id} role="button" tabIndex={0} aria-label={`${area.label}${linkedName ? ` · ${linkedName}` : ''}`}
            aria-pressed={active} onClick={activate} onKeyDown={event => handleAreaKey(event, area.id)} className="cursor-pointer">
            <title>{area.label}{linkedName ? ` · ${linkedName}` : ''}</title>
            {area.shape.kind === 'polygon'
              ? <polygon points={pointsString(area.shape.points)} fill={active ? '#d5a84c66' : '#a9895b35'} stroke={active ? '#f0c15b' : '#c2a778'} strokeWidth={isGrid ? .16 : 2} />
              : <circle cx={center[0]} cy={center[1]} r={area.shape.radius} fill={active ? '#d5a84c' : '#332a25'} stroke={active ? '#ffe09a' : '#d5aa63'} strokeWidth={active ? 4 : 2} />}
            <circle cx={center[0]} cy={center[1]} r={isGrid ? 1.1 : 10} fill={active ? '#f5cb69' : '#221c1b'} stroke="#f2d695" strokeWidth={isGrid ? .12 : 1.5} />
            <text x={center[0]} y={center[1]} textAnchor="middle" dominantBaseline="central" fill="#191518" fontSize={labelSize} fontWeight="700" pointerEvents="none">
              {area.number ?? '•'}
            </text>
          </g>;
        })}
        {(geometry.barriers ?? []).map(barrier => {
          const color = barrier.kind === 'wall' ? '#e7dfd0'
            : barrier.kind === 'cavern-edge' ? '#b29a77'
              : barrier.kind === 'secret-door' ? '#e7b84f'
                : barrier.kind === 'broken-door' ? '#d88965' : '#9fc6ce';
          return <g key={barrier.id} role="img" aria-label={`${featureLabel(barrier)}${barrier.sourceLabel ? ` · ${barrier.sourceLabel}` : ''}`}>
            <title>{featureLabel(barrier)}{barrier.kind === 'secret-door' ? ' · мастерская разметка' : ''}</title>
            <polyline points={pointsString(barrier.points)} fill="none" stroke="#161416" strokeWidth={isGrid ? .48 : 5} strokeLinecap="square" strokeLinejoin="round" />
            <polyline points={pointsString(barrier.points)} fill="none" stroke={color}
              strokeWidth={barrier.kind === 'wall' || barrier.kind === 'cavern-edge' ? (isGrid ? .24 : 2.5) : (isGrid ? .34 : 3.5)}
              strokeDasharray={barrier.kind === 'secret-door' ? (isGrid ? '.16 .11' : '4 3') : barrier.kind === 'broken-door' ? (isGrid ? '.22 .1' : '5 3') : undefined}
              strokeLinecap="square" strokeLinejoin="round" />
          </g>;
        })}
        {geometry.scaleBar ? <g aria-hidden="true" transform={`translate(22 ${geometry.height - 22})`}>
          <path d={`M0 0 H${geometry.scaleBar.mapUnits}`} stroke="#f1d79b" strokeWidth="4" />
          <path d={`M0 -5 V5 M${geometry.scaleBar.mapUnits} -5 V5`} stroke="#f1d79b" strokeWidth="2" />
          <text x={geometry.scaleBar.mapUnits / 2} y="-7" textAnchor="middle" fill="#f1d79b" fontSize="14">{geometry.scaleBar.feet} футов</text>
        </g> : null}
      </svg>
    </div>
    <p className="type-body-xs text-t2">Редакторские области и ручная трассировка по сетке PDF {geometry.trace?.sourcePdfPage ?? '—'} со ссылкой на визуальный образец {geometry.sourceReference.label} (карта: {geometry.sourceReference.artCredit}). {geometry.trace?.note ?? 'Стены, двери и поле видимости не трассированы.'} Поле видимости и перемещение токенов не реализованы; исходный растр не встроен.</p>
    {geometry.trace?.visibility === 'dm-only' ? <p className="type-body-xs text-gd">Мастерская разметка · только ведущему</p> : null}
    {(geometry.barriers?.length ?? 0) > 0 ? <div className="flex flex-wrap gap-x-3 gap-y-1 type-body-xs text-t2" aria-label="Легенда стен и дверей">
      {(['wall', 'door', 'secret-door', 'broken-door', 'cavern-edge'] as const).filter(kind => geometry.barriers?.some(barrier => barrier.kind === kind)).map(kind => <span key={kind}>
        <i aria-hidden="true" className={`mr-1 inline-block w-3 border-t-2 ${kind === 'secret-door' ? 'border-gd border-dashed' : kind === 'broken-door' ? 'border-orange-400 border-dashed' : kind === 'door' ? 'border-cyan-300' : 'border-stone-300'}`} />
        {featureLabel({ id: kind, kind, points: [[0, 0], [0, 1]] })}
      </span>)}
    </div> : null}
    <div className="flex flex-wrap gap-1" role="group" aria-label="Области плана">
      {geometry.areas.map(area => <button key={area.id} type="button" className="type-body-xs border border-br px-2 py-1 text-tx"
        aria-pressed={selected?.id === area.id} onClick={() => setSelectedAreaId(area.id)}>
        {area.number ? `${area.number}. ` : ''}{areaName(area, bundle)}
      </button>)}
    </div>
    {selected ? <div className="bg-pl p-2 type-body-sm" aria-live="polite">
      <strong>{selected.number ? `${isGrid ? 'Область' : 'Ориентир'} ${selected.number}` : selected.label}</strong>
      {target ? <>
        <span> · {target.name}</span>
        <button type="button" className="ml-2 text-gd underline underline-offset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gd" onClick={() => onOpenNode(target.id)}>
          Открыть запись
        </button>
      </> : <span> · отдельной записи в графе пока нет</span>}
    </div> : null}
  </section>;
}
