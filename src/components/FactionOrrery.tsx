import type { KeyboardEvent } from 'react';
import type { PulseEdge, PulseFaction, PulseGod } from '../campaign/pulse';
import { RELATION_LABEL, signed } from './labels';
import { edgeStyle } from './FactionGraph';
import './FactionOrrery.css';

const W = 560;
const H = 360;
const CENTER = { x: W / 2, y: H / 2 };
const FACTION_ORBIT = { rx: 146, ry: 92 };
const GOD_ORBIT = { rx: 235, ry: 156 };

/** Display radius uses only the campaign's influence percent; an absent value stays explicitly unknown. */
export function influenceRadius(percent: number | undefined): number {
  if (percent === undefined || !Number.isFinite(percent)) return 10;
  return 10 + Math.max(0, Math.min(100, percent)) * 0.24;
}

const point = (orbit: typeof FACTION_ORBIT, index: number, count: number) => {
  const angle = -Math.PI / 2 + Math.PI * 2 * index / Math.max(1, count);
  return { x: CENTER.x + orbit.rx * Math.cos(angle), y: CENTER.y + orbit.ry * Math.sin(angle) };
};

function onActivate(event: KeyboardEvent<SVGGElement>, activate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate();
  }
}

export interface FactionOrreryProps {
  factions: readonly PulseFaction[];
  edges: readonly PulseEdge[];
  gods: readonly PulseGod[];
  onOpenFaction?: (id: string) => void;
  onOpenDeity?: (id: string) => void;
}

/** Campaign projection: faction influence is body radius; relationship data supplies the connecting lines. */
export function FactionOrrery({ factions, edges, gods, onOpenFaction, onOpenDeity }: FactionOrreryProps) {
  const factionPoints = new Map(factions.map((faction, index) => [faction.id, point(FACTION_ORBIT, index, factions.length)]));
  const godNodes = new Map<string, { id: string; name: string; members: string[] }>();
  gods.forEach(god => godNodes.set(god.id, { id: god.id, name: god.name, members: [...god.worshippers] }));
  gods.forEach(god => god.relations.forEach(relation => {
    if (!godNodes.has(relation.id)) godNodes.set(relation.id, { id: relation.id, name: relation.name, members: [] });
  }));
  const allGods = [...godNodes.values()];
  const godPoints = new Map(allGods.map((god, index) => [god.id, point(GOD_ORBIT, index, allGods.length)]));
  const factionName = (id: string) => factions.find(faction => faction.id === id)?.name ?? id;
  const edgeSummary = edges.map(edge => `${factionName(edge.a)} — ${factionName(edge.b)}: ${signed(edge.value)}${edge.pending === undefined ? '' : ` → ${signed(edge.pending)}`}`);
  const ariaSummary = [
    `Орбиты фракций и богов: ${factions.map(f => `${f.name}, влияние ${f.influencePercent === undefined ? 'не указано' : `${f.influencePercent}%`}`).join('; ') || 'фракций нет'}`,
    edgeSummary.length ? `отношения ${edgeSummary.join('; ')}` : 'отношений фракций нет',
    allGods.length ? `боги ${allGods.map(g => g.name).join(', ')}` : 'богов партии нет',
  ].join('. ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={ariaSummary} className="block mx-auto w-full max-w-[560px]">
      <ellipse cx={CENTER.x} cy={CENTER.y} rx={GOD_ORBIT.rx} ry={GOD_ORBIT.ry} fill="none" stroke="var(--ent-deity)" strokeOpacity=".45" strokeDasharray="3 5" />
      <ellipse cx={CENTER.x} cy={CENTER.y} rx={FACTION_ORBIT.rx} ry={FACTION_ORBIT.ry} fill="none" stroke="var(--ent-faction)" strokeOpacity=".6" />
      <circle cx={CENTER.x} cy={CENTER.y} r="28" fill="var(--pn)" stroke="var(--gd)" strokeWidth="2" />
      <text x={CENTER.x} y={CENTER.y - 2} textAnchor="middle" fill="var(--gd-hi)" className="type-key">МИР</text>
      <text x={CENTER.x} y={CENTER.y + 12} textAnchor="middle" fill="var(--t2)" className="type-key">КАМПАНИЯ</text>

      {edges.map(edge => {
        const from = factionPoints.get(edge.a), to = factionPoints.get(edge.b);
        if (!from || !to) return null;
        const style = edgeStyle(edge.value);
        const title = `${factionName(edge.a)} и ${factionName(edge.b)}: ${signed(edge.value)} ${RELATION_LABEL[edge.value] ?? ''}${edge.pending === undefined ? '' : `; ждёт решения ${signed(edge.pending)}`}`;
        return <g key={`${edge.a}|${edge.b}`} data-edge={`${edge.a}|${edge.b}`} data-value={edge.value}>
          <title>{title}</title>
          {style.double
            ? [-1, 1].map(offset => {
                const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
                const ox = -dy / length * offset * 2, oy = dx / length * offset * 2;
                return <line key={offset} x1={from.x + ox} y1={from.y + oy} x2={to.x + ox} y2={to.y + oy} stroke={style.stroke} strokeWidth={style.width} />;
              })
            : <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} />}
          {edge.pending !== undefined ? <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="5" fill="none" stroke="var(--src-sim)" strokeWidth="2" /> : null}
        </g>;
      })}

      {gods.flatMap(god => god.relations.map((relation, index) => {
        const from = godPoints.get(god.id), to = godPoints.get(relation.id);
        if (!from || !to) return null;
        return <line key={`${god.id}:${relation.id}:${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={relation.kind === 'aspect' ? 'var(--ent-deity)' : 'var(--gd-hi)'} strokeWidth={relation.kind === 'aspect' ? 1 : 1.5}
          strokeDasharray={relation.kind === 'aspect' ? '2 4' : undefined}>
          <title>{`${god.name} ${relation.kind === 'serves' ? 'служит' : relation.kind === 'served-by' ? 'ему служит' : 'аспект'} ${relation.name}`}</title>
        </line>;
      }))}

      {factions.map(faction => {
        const p = factionPoints.get(faction.id)!;
        const radius = influenceRadius(faction.influencePercent);
        const trend = faction.trend ? `; тренд ${signed(faction.trend)}` : '';
        const title = `${faction.name}; влияние ${faction.influencePercent === undefined ? 'не указано' : `${faction.influencePercent}%`}${trend}; известность партии ${faction.renown}`;
        const activate = () => onOpenFaction?.(faction.id);
        return <g key={faction.id} data-faction={faction.id} data-influence-radius={radius}
          {...(onOpenFaction ? { role: 'button', tabIndex: 0, 'aria-label': `Открыть фракцию: ${faction.name}`, onClick: activate, onKeyDown: (event: KeyboardEvent<SVGGElement>) => onActivate(event, activate) } : {})}
          className={onOpenFaction ? 'faction-orrery-node cursor-pointer' : undefined}>
          <title>{title}</title>
          <circle cx={p.x} cy={p.y} r={radius} fill="var(--ent-faction)" fillOpacity=".8" stroke="var(--gd-hi)" strokeWidth="1.5" />
          <text x={p.x} y={p.y + radius + 15} textAnchor="middle" fill="var(--tx)" className="type-body-xs">{faction.name.length > 20 ? `${faction.name.slice(0, 19)}…` : faction.name}</text>
          <text x={p.x} y={p.y + radius + 28} textAnchor="middle" fill="var(--t2)" className="type-key">{faction.influencePercent === undefined ? '—' : `${faction.influencePercent}%`} · изв. {faction.renown}</text>
        </g>;
      })}

      {allGods.map((god, index) => {
        const p = godPoints.get(god.id)!;
        const isPartyDeity = gods.some(candidate => candidate.id === god.id);
        const activate = () => onOpenDeity?.(god.id);
        return <g key={god.id} data-deity={god.id}
          {...(onOpenDeity ? { role: 'button', tabIndex: 0, 'aria-label': `Открыть бога: ${god.name}`, onClick: activate, onKeyDown: (event: KeyboardEvent<SVGGElement>) => onActivate(event, activate) } : {})}
          className={onOpenDeity ? 'faction-orrery-node cursor-pointer' : undefined}>
          <title>{`${god.name}${god.members.length ? `; партия: ${god.members.join(', ')}` : '; связь бога партии'}`}</title>
          <circle cx={p.x} cy={p.y} r={isPartyDeity ? 8 : 6} fill={isPartyDeity ? 'var(--ent-deity)' : 'var(--cd)'} stroke="var(--gd-hi)" strokeWidth="1.5" />
          {index % 2 === 0 ? <text x={p.x} y={p.y - 12} textAnchor="middle" fill="var(--tx)" className="type-body-xs">{god.name}</text> : <text x={p.x} y={p.y + 20} textAnchor="middle" fill="var(--tx)" className="type-body-xs">{god.name}</text>}
        </g>;
      })}
    </svg>
  );
}

export default FactionOrrery;
