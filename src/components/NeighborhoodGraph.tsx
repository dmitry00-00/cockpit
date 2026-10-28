// Схема окрестности сущности (E2): сама сущность в середине, группы связей над ней и под ней — служение бога: кому
// служит, кто служит ему, аспекты. Узлы — кнопки (щелчок, Enter, пробел открывают карточку связи), рёбра — от
// середины к узлам ближайших групп, пунктир — связь слабее прямой. Схема лежит в провале wl, подписи — Forum.
// Тупой: схема, имя и колбэк — пропсами.
import type { KeyboardEvent } from 'react';
import type { EntityDiagram, EntityGroup, EntityRef } from '../entities';
import { Label, lines } from '../cosmos/svg';

const W = 360;
/** Кегль в единицах схемы: карточка шириной ~340 px сжимает схему до ~0,95 — на экране не меньше 13 px. */
const FS = 14;
const NW = 112;
const NH = 38;
const GAP = 10;
const COLS = 3;
const TITLE_H = 20;
const CENTER_W = 170;
const CENTER_H = 40;
/** Знаков в строке узла; длиннее двух строк — с многоточием, полное имя в подсказке. */
const WRAP = 15;

interface Node { label: string; ref: EntityRef; x: number; y: number; dashed?: boolean }
interface Laid { title: { y: number; text: string }; nodes: Node[]; bottom: number }

/** Группа сеткой по три в ряд от y вниз: подпись, потом ряды; неполный ряд — по центру. */
function layGroup(g: EntityGroup, y: number): Laid {
  const nodes: Node[] = [];
  const top = y + TITLE_H;
  g.links.forEach((l, i) => {
    const row = Math.floor(i / COLS);
    const inRow = Math.min(COLS, g.links.length - row * COLS);
    const col = i % COLS;
    nodes.push({ label: l.label, ref: l.ref, dashed: g.dashed, x: W / 2 + (col - (inRow - 1) / 2) * (NW + GAP), y: top + row * (NH + GAP) + NH / 2 });
  });
  const rows = Math.ceil(g.links.length / COLS);
  return { title: { y: y + FS, text: g.title }, nodes, bottom: top + rows * (NH + GAP) - GAP };
}

function nodeLines(label: string): string[] {
  const rows = lines(label, WRAP);
  if (rows.length <= 2) return rows;
  return [rows[0], `${rows.slice(1).join(' ').slice(0, WRAP - 1)}…`];
}

export interface NeighborhoodGraphProps {
  name: string;
  diagram: EntityDiagram;
  onOpen?: (ref: EntityRef) => void;
  className?: string;
}

export function NeighborhoodGraph({ name, diagram, onOpen, className = '' }: NeighborhoodGraphProps) {
  // Над серединой группы идут снизу вверх: первая — ближайшая к середине.
  let y = 0;
  const aboveTopDown = [...diagram.above].reverse().map(g => {
    const laid = layGroup(g, y);
    y = laid.bottom + 18;
    return laid;
  });
  const cy = y + 8 + CENTER_H / 2;
  y = cy + CENTER_H / 2 + 22;
  const below = diagram.below.map(g => {
    const laid = layGroup(g, y);
    y = laid.bottom + 18;
    return laid;
  });
  const height = y - 10;
  const nearestAbove = aboveTopDown[aboveTopDown.length - 1];
  const edges = [
    ...(nearestAbove?.nodes ?? []).map(n => ({ n, x1: W / 2, y1: cy - CENTER_H / 2, x2: n.x, y2: n.y + NH / 2 })),
    ...below.flatMap(g => g.nodes.map(n => ({ n, x1: W / 2, y1: cy + CENTER_H / 2, x2: n.x, y2: n.y - NH / 2 }))),
  ];
  const all = [...aboveTopDown, ...below];
  const key = (e: KeyboardEvent, r: EntityRef) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.(r);
    }
  };
  return (
    <div className={`bg-wl shadow-bevel-in p-2 ${className}`} data-part="diagram">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Схема связей: ${name}`} className="w-full max-w-[480px] mx-auto block" style={{ fontFamily: 'var(--font-display)', fontSize: FS }}>
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--t3)" strokeWidth={1.5} strokeDasharray={e.n.dashed ? '4 4' : undefined} />
        ))}
        {all.map(g => <Label key={g.title.text} x={4} y={g.title.y} text={g.title.text} fs={FS} anchor="start" dim />)}
        <g data-part="center">
          <rect x={W / 2 - CENTER_W / 2} y={cy - CENTER_H / 2} width={CENTER_W} height={CENTER_H} fill="var(--pl)" stroke="var(--gd)" strokeWidth={2} />
          {nodeLines(name).map((r, i, rows) => (
            <text key={i} x={W / 2} y={cy + 5 + (i - (rows.length - 1) / 2) * (FS + 2)} textAnchor="middle" fill="var(--tx)">{r}</text>
          ))}
        </g>
        {all.flatMap(g => g.nodes).map(n => (
          <g
            key={`${n.ref}@${n.y}`}
            data-node={n.ref}
            {...(onOpen ? {
              role: 'button', tabIndex: 0, 'aria-label': `Открыть: ${n.label}`, onClick: () => onOpen(n.ref), onKeyDown: (e: KeyboardEvent) => key(e, n.ref),
              className: 'cursor-pointer outline-none [&:hover>rect]:stroke-[var(--tx)] [&:focus-visible>rect]:stroke-[var(--gd)]',
            } : {})}
          >
            <title>{n.label}</title>
            <rect x={n.x - NW / 2} y={n.y - NH / 2} width={NW} height={NH} fill="var(--cd)" stroke="var(--t3)" strokeWidth={1.5} strokeDasharray={n.dashed ? '4 3' : undefined} />
            {nodeLines(n.label).map((r, i, rows) => (
              <text key={i} x={n.x} y={n.y + 5 + (i - (rows.length - 1) / 2) * (FS + 2)} textAnchor="middle" fill="var(--t2)">{r}</text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default NeighborhoodGraph;
