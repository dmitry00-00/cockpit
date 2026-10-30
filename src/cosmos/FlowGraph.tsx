// Схема связей уровня «план» (HANDOFF §3, F4.2): сферы флогистона вокруг Realmspace и течения между ними. Рёбра
// различаются рисунком линии, а не цветом: сплошная — течение в обе стороны, со стрелкой — в одну, штрих со стрелкой —
// путь известен, обратный нет, точки — связь названа без подробностей. У ребра — дни пути, у узла — пути из него и
// в него с книгой. Тупой компонент: какую сферу подсветить и что открывать ниже по лестнице, даёт страница.
import { useState, type ReactNode } from 'react';
import { useOpenEntity } from '../components/openEntity';
import { ref } from '../entities/ref';
import { LAYOUT, PHLOGISTON, WAY_LABEL, daysLabel, flowsOf, type Flow, type Phlogiston, type Sphere } from './phlogiston';

export interface FlowGraphProps {
  data?: Phlogiston;
  /** Сфера партии — золотой обводкой, выбрана на старте. */
  current?: string;
  canOpen?: (sphere: Sphere) => boolean;
  onOpen?: (sphere: Sphere) => void;
  /** Карточка самого плана (PlaneInfo) — над схемой течений. */
  plane?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const NODE_R = 18;
/**
 * Кегль в единицах схемы: зона уровня рядом с корешками — около 580 точек на 1000 единиц, и 22 единицы выходят
 * в 13 точек на экране. Ширина знака — для подложек: Forum ~0,5 кегля, Plex Mono — 0,6.
 */
const FS = 22;
const DAY_FS = 20;
const CW = FS * 0.5;
const DW = DAY_FS * 0.6;

function dash(f: Flow): string | undefined {
  if (f.way === '' && f.days === null) return '1 4';
  if (f.way === '') return '6 4';
  return undefined;
}

export function FlowGraph({ data = PHLOGISTON, current = 'realmspace', canOpen, onOpen, plane, children, className = '' }: FlowGraphProps) {
  const [picked, setPicked] = useState(current);
  const openEntity = useOpenEntity();
  const name = (id: string) => data.spheres.find(s => s.id === id)?.name ?? id;
  const sphere = data.spheres.find(s => s.id === picked) ?? data.spheres[0];
  const { out, in: inn } = flowsOf(data, sphere.id);
  const rows = [...out.map(f => ({ f, dir: f.way === 'two' ? '↔' : '→', other: f.from === sphere.id ? f.to : f.from })),
    ...inn.filter(f => !out.includes(f)).map(f => ({ f, dir: '←', other: f.to === sphere.id ? f.from : f.to }))];

  return (
    <div className={`relative flex min-h-0 bg-wl ${className}`} data-part="flow-graph">
      {children ? <div className="flex-none p-4 flex items-start gap-4 min-h-0 max-h-full">{children}</div> : null}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-4">
        {plane}
        <svg viewBox="0 0 1000 600" role="img" aria-label="Флогистон: сферы и течения между ними" className="flex-1 min-h-0 w-full" style={{ fontFamily: 'var(--font-display)', fontSize: FS }}>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--t2)" />
            </marker>
          </defs>
          {data.groups.map(g => {
            const pts = g.members.map(m => LAYOUT[m]).filter(Boolean);
            const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
            const flat = pts.every(p => p.y === pts[0].y);
            // Цепочка в ряд — полоса вдоль неё, подпись под ней; иначе — контур вокруг вершин, отодвинутый наружу, подпись в центре.
            const outline = flat
              ? (() => { const xs = pts.map(p => p.x); return `${Math.min(...xs) - 40},${cy - 40} ${Math.max(...xs) + 40},${cy - 40} ${Math.max(...xs) + 40},${cy + 52} ${Math.min(...xs) - 40},${cy + 52}`; })()
              : pts.map(p => { const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1; return `${p.x + (dx / d) * 48},${p.y + (dy / d) * 48}`; }).join(' ');
            return (
              <g key={g.id} data-group={g.id}>
                <polygon points={outline} fill="none" stroke="var(--t4)" strokeDasharray="2 6" />
                <text x={flat ? Math.min(...pts.map(p => p.x)) - 34 : cx} y={flat ? cy + 66 : cy + 28} textAnchor={flat ? 'start' : 'middle'} fill="var(--t3)">{g.name}</text>
                <title>{`${g.quote} — ${g.ref ?? 'вики'}`}</title>
              </g>
            );
          })}
          {data.flows.map(f => {
            const a = LAYOUT[f.from], b = LAYOUT[f.to];
            if (!a || !b) return null;
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            const x1 = a.x + ux * (NODE_R + 2), y1 = a.y + uy * (NODE_R + 2), x2 = b.x - ux * (NODE_R + 4), y2 = b.y - uy * (NODE_R + 4);
            const directed = f.way === 'one' || (f.way === '' && f.days !== null);
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const label = daysLabel(f.days);
            const hot = f.from === sphere.id || f.to === sphere.id;
            return (
              <g key={`${f.from}-${f.to}`} data-flow={`${f.from}-${f.to}`} data-way={f.way || 'route'}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? 'var(--tx)' : 'var(--t2)'} strokeWidth={f.way === 'two' ? 3 : 1.5}
                  strokeDasharray={dash(f)} markerEnd={directed ? 'url(#flow-arrow)' : undefined} />
                {f.days !== null ? (
                  <>
                    <rect x={mx - (label.length * DW) / 2 - 4} y={my - DAY_FS / 2 - 3} width={label.length * DW + 8} height={DAY_FS + 4} fill="var(--wl)" />
                    <text x={mx} y={my + DAY_FS / 2 - 3} textAnchor="middle" fill="var(--tx)" style={{ fontFamily: 'var(--font-mono)', fontSize: DAY_FS }}>{label}</text>
                  </>
                ) : null}
                <title>{`${name(f.from)} → ${name(f.to)}: ${WAY_LABEL[f.way]}${f.days !== null ? `, ${label}` : ''}. ${f.quote} — ${f.ref ?? 'вики'}`}</title>
              </g>
            );
          })}
          {data.spheres.map(s => {
            const p = LAYOUT[s.id];
            if (!p) return null;
            const cur = s.id === current, sel = s.id === sphere.id;
            const ly = p.y < LAYOUT.realmspace.y ? p.y - NODE_R - 8 : p.y + NODE_R + FS;
            return (
              <g key={s.id} data-sphere={s.id} onClick={() => setPicked(s.id)} className="cursor-pointer">
                {s.kind === 'empire'
                  ? <rect x={p.x - NODE_R} y={p.y - NODE_R} width={NODE_R * 2} height={NODE_R * 2} transform={`rotate(45 ${p.x} ${p.y})`} fill="var(--pn)" stroke={sel ? 'var(--tx)' : 'var(--t3)'} />
                  : <circle cx={p.x} cy={p.y} r={NODE_R} fill="var(--pn)" stroke={cur ? 'var(--gd)' : sel ? 'var(--tx)' : 'var(--t3)'} strokeWidth={cur ? 3 : 1.5} />}
                {/* Имя — от центра схемы наружу и на подложке: рёбра проходят под ним, а не сквозь. */}
                <rect x={p.x - (s.name.length * CW) / 2 - 3} y={ly - FS + 3} width={s.name.length * CW + 6} height={FS + 3} fill="var(--wl)" />
                <text x={p.x} y={ly} textAnchor="middle" fill={sel || cur ? 'var(--tx)' : 'var(--t2)'}>{s.name}</text>
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-pn shadow-bevel max-w-full type-body-sm text-t2" data-part="flow-legend">
          <span>━ в обе стороны</span>
          <span>─▶ в одну сторону</span>
          <span>╌▶ обратный путь неизвестен</span>
          <span>┈ связь без подробностей</span>
          <span className="text-t3" title={`${data.typicalQuote} — ${data.typicalRef ?? 'вики'}`}>{`до случайной соседней сферы — ${data.typicalDays[0]}–${data.typicalDays[1]} дней`}</span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2 bg-pn shadow-bevel max-w-full" data-part="sphere-info" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <span className="type-body text-tx">{sphere.name}</span>
            {sphere.url ? <a href={sphere.url} target="_blank" rel="noreferrer" className="type-body-sm text-t3 underline hover:text-tx">вики</a> : null}
            {openEntity ? (
              <button type="button" onClick={() => openEntity(ref('sphere', sphere.id))} title={`Общая карточка: ${sphere.name}`} className="type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]">
                Карточка
              </button>
            ) : null}
            {onOpen && canOpen?.(sphere) ? (
              <button type="button" onClick={() => onOpen(sphere)} className="type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]">
                {`Спуститься: ${sphere.name}`}
              </button>
            ) : null}
          </div>
          {rows.length === 0 ? <span className="type-body-sm text-t3">Путей в источниках нет</span> : rows.map(({ f, dir, other }) => (
            <span key={`${f.from}-${f.to}-${dir}`} data-route={other} className="type-body-sm text-t2" title={f.quote}>
              {`${dir} ${name(other)} · ${WAY_LABEL[f.way]} · ${daysLabel(f.days)} · `}
              <a href={f.url} target="_blank" rel="noreferrer" className="text-t3 underline hover:text-tx">{f.ref ?? 'вики'}</a>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FlowGraph;
