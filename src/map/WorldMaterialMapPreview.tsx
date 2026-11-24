import type { GeneratedWorldMaterialData } from '../import/generatedWorldMaterial';

const compact = (value: string) => value.length > 14 ? `${value.slice(0, 13)}…` : value;

/** Schematic geometry for review; it is not georeferenced and carries no grid scale or tactical rules. */
export function WorldMaterialMapPreview({ data }: { data: GeneratedWorldMaterialData }) {
  const nodes = data.geometry.nodes;
  const descriptions = data.draft.kind === 'dungeon' ? data.draft.areas : data.draft.features;
  const names = new Map(descriptions.map(node => [node.id, node.name]));
  return (
    <div aria-label={data.kind === 'dungeon' ? 'Схематический план подземелья' : 'Схематическая карта локации'} className="my-2 flex flex-col gap-2 bg-cd p-2">
      <p className="type-body-xs text-t2">Схема · условная сетка · без масштаба и географической привязки · раскладка {data.geometry.layoutVersion}</p>
      <svg role="img" aria-label={data.draft.name} viewBox={`0 0 ${data.geometry.bounds.width} ${data.geometry.bounds.height}`} className="max-h-64 w-full border border-bd bg-wl" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="var(--br)" strokeWidth="0.45" strokeLinejoin="round" strokeLinecap="round">
          {data.geometry.edges.map(edge => <polyline key={edge.id} points={edge.points.map(point => `${point.x},${point.y}`).join(' ')} />)}
        </g>
        <g>
          {nodes.map(node => {
            const label = names.get(node.id) ?? node.id;
            return (
              <g key={node.id}>
                <title>{label}</title>
                <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.shape === 'site' ? 1.2 : 0.25} fill="var(--pl)" stroke="var(--gd)" strokeWidth="0.45" />
                <text x={node.x + node.width / 2} y={node.y + node.height / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--tx)" fontSize="0.8">{compact(label)}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <ol className="flex flex-col gap-1">
        {descriptions.map(node => <li key={node.id} className="text-t2"><strong className="text-tx">{node.name}</strong> · {node.description} <span className="text-t2">Связи: {node.links.map(id => names.get(id) ?? id).join(', ') || 'нет'}</span></li>)}
      </ol>
    </div>
  );
}
