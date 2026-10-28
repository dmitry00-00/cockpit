// Общее для схем космологии: подпись на подложке (с переносом длинных имён) и узел-кнопка плана.
import type { KeyboardEvent } from 'react';

export interface LabelProps {
  x: number;
  y: number;
  text: string;
  /** Кегль в единицах схемы. */
  fs: number;
  anchor?: 'start' | 'middle' | 'end';
  strong?: boolean;
  dim?: boolean;
  /** Перенос по словам, не длиннее стольких знаков в строке. */
  wrap?: number;
}

/** Средняя ширина знака Forum — доля кегля, для подложек. */
const CHAR = 0.49;

export function lines(text: string, wrap?: number): string[] {
  if (!wrap || text.length <= wrap) return [text];
  const out: string[] = [];
  for (const w of text.split(' ')) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + 1 + w.length <= wrap) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}

/** Подпись на подложке цвета провала: рёбра проходят под ней, а не сквозь. y — базовая линия первой строки. */
export function Label({ x, y, text, fs, anchor = 'middle', strong, dim, wrap }: LabelProps) {
  const rows = lines(text, wrap);
  const w = Math.max(...rows.map(r => r.length)) * fs * CHAR + 6;
  const left = anchor === 'start' ? x - 3 : anchor === 'end' ? x - w + 3 : x - w / 2;
  const fill = strong ? 'var(--tx)' : dim ? 'var(--t3)' : 'var(--t2)';
  return (
    <>
      <rect x={left} y={y - fs + 3} width={w} height={rows.length * (fs + 2) + 1} fill="var(--wl)" />
      <text x={x} y={y} textAnchor={anchor} fill={fill}>
        {rows.map((r, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : fs + 2}>{r}</tspan>
        ))}
      </text>
    </>
  );
}

/** Узел плана — кнопка: щелчок и Enter/пробел выбирают план. */
export function nodeProps(id: string, name: string, selected: boolean, pick: (id: string) => void) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': name,
    'aria-pressed': selected,
    'data-plane': id,
    className: 'cursor-pointer outline-none',
    onClick: () => pick(id),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(id);
      }
    },
  };
}

/** Отрезок между центрами двух узлов, укороченный на радиусы. */
export function toward(a: { x: number; y: number }, b: { x: number; y: number }, from: number, to: number) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return { x1: a.x + (dx / len) * from, y1: a.y + (dy / len) * from, x2: b.x - (dx / len) * to, y2: b.y - (dy / len) * to };
}
