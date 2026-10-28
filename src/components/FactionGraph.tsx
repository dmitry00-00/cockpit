// Граф фракций «Пульса мира» (F5, Q8): узлы — фракции (влияние с трендом, известность партии), рёбра — отношения
// −3…+3. Смысл ребра несёт форма линии и число, цвет только помогает: союз — сплошная, соперничество — пунктир,
// вражда — двойная (CLAUDE.md: цвет никогда не единственный носитель смысла). Ждущее решения значение — бирюзой
// симуляции рядом с нынешним. Тупой: данные и колбэк — пропсами.
import type { KeyboardEvent } from 'react';
import type { PulseEdge, PulseFaction } from '../campaign/pulse';
import { RELATION_LABEL, signed } from './labels';

const W = 560;
const H = 320;
const NW = 172;
const NH = 52;
/** Кегль в единицах схемы: схема идёт почти 1:1, имена — Forum 15, числа — Plex Mono 13. */
const FS = 15;
const FN = 13;

type Style = { stroke: string; dash?: string; double?: boolean; width: number };

/** Форма ребра по отношению: −1 — соперничество, ниже — вражда, выше нуля — союз; 0 бывает только у ждущего. */
export function edgeStyle(value: number): Style {
  if (value >= 2) return { stroke: 'var(--fx-heal-hi)', width: 2.5 };
  if (value === 1) return { stroke: 'var(--fx-heal-hi)', width: 1.5 };
  if (value === 0) return { stroke: 'var(--t3)', dash: '2 4', width: 1.5 };
  if (value === -1) return { stroke: 'var(--fx-debuff-hi)', dash: '7 5', width: 2 };
  return { stroke: 'var(--fx-damage-hi)', double: true, width: 1.5 };
}

export interface FactionGraphProps {
  factions: readonly PulseFaction[];
  edges: readonly PulseEdge[];
  onOpen?: (factionId: string) => void;
  className?: string;
}

export function FactionGraph({ factions, edges, onOpen, className = '' }: FactionGraphProps) {
  // Узлы — по эллипсу, первый сверху: пять фракций сида не пересекаются, рёбра проходят между узлами.
  const rx = W / 2 - NW / 2 - 6, ry = H / 2 - NH / 2 - 6;
  const at = new Map(factions.map((f, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / factions.length;
    return [f.id, { x: W / 2 + rx * Math.cos(a), y: H / 2 + ry * Math.sin(a) }];
  }));
  const key = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.(id);
    }
  };
  const name = (id: string) => factions.find(f => f.id === id)?.name ?? id;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Отношения фракций: ${edges.map(e => `${name(e.a)} и ${name(e.b)} ${signed(e.value)}`).join(', ') || 'нет'}`}
      className={`w-full max-w-[560px] block mx-auto ${className}`}
      style={{ fontFamily: 'var(--font-display)', fontSize: FS }}
    >
      {edges.map(e => {
        const p = at.get(e.a), q = at.get(e.b);
        if (!p || !q) return null;
        const s = edgeStyle(e.value);
        // Двойная линия — два отрезка, сдвинутые поперёк ребра.
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const nx = (-(q.y - p.y) / len) * 2.5, ny = ((q.x - p.x) / len) * 2.5;
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const text = e.pending !== undefined ? `${signed(e.value)} → ${signed(e.pending)}` : signed(e.value);
        const tw = text.length * 8 + 10;
        return (
          <g key={`${e.a}-${e.b}`} data-edge={`${e.a}|${e.b}`} data-value={e.value}>
            <title>{`${name(e.a)} и ${name(e.b)}: ${signed(e.value)} ${RELATION_LABEL[e.value] ?? ''}${e.pending !== undefined ? ` · ждёт решения: ${signed(e.pending)}` : ''}`}</title>
            {s.double
              ? [1, -1].map(k => <line key={k} x1={p.x + k * nx} y1={p.y + k * ny} x2={q.x + k * nx} y2={q.y + k * ny} stroke={s.stroke} strokeWidth={s.width} />)
              : <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />}
            <rect x={mx - tw / 2} y={my - 10} width={tw} height={20} fill="var(--wl)" stroke={e.pending !== undefined ? 'var(--src-sim)' : 'none'} />
            <text x={mx} y={my + 5} textAnchor="middle" fill={e.pending !== undefined ? 'var(--src-sim)' : 'var(--tx)'} style={{ fontFamily: 'var(--font-mono)', fontSize: FN }}>{text}</text>
          </g>
        );
      })}
      {factions.map(f => {
        const p = at.get(f.id)!;
        const numbers = [
          f.influencePercent !== undefined ? `${f.influencePercent}%${f.trend ? (f.trend > 0 ? ' ▲' : ' ▼') : ''}` : null,
          `изв. ${f.renown}`,
        ].filter(Boolean).join(' · ');
        return (
          <g
            key={f.id}
            data-faction={f.id}
            {...(onOpen ? {
              role: 'button', tabIndex: 0, 'aria-label': `Открыть: ${f.name}`, onClick: () => onOpen(f.id), onKeyDown: (e: KeyboardEvent) => key(e, f.id),
              className: 'cursor-pointer outline-none [&:hover>rect]:stroke-[var(--tx)] [&:focus-visible>rect]:stroke-[var(--gd)]',
            } : {})}
          >
            <title>{`${f.name}${f.influencePercent !== undefined ? ` · влияние ${f.influencePercent}%` : ''}${f.trend ? `, тренд ${signed(f.trend)}` : ''} · известность партии ${f.renown}`}</title>
            <rect x={p.x - NW / 2} y={p.y - NH / 2} width={NW} height={NH} fill="var(--cd)" stroke="var(--t3)" strokeWidth={1.5} />
            <text x={p.x} y={p.y - 4} textAnchor="middle" fill="var(--tx)">{f.name.length > 21 ? `${f.name.slice(0, 20)}…` : f.name}</text>
            <text x={p.x} y={p.y + 16} textAnchor="middle" fill="var(--t2)" style={{ fontFamily: 'var(--font-mono)', fontSize: FN }}>{numbers}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default FactionGraph;
