// Иконка набора: inline-SVG 16×16 в четыре тона из сгенерированного источника.
// Один <path> на тон, клетки склеены в горизонтальные отрезки — 183 иконок × 256 клеток
// не должны превращаться в 256 <rect> каждая. Никаких Tailwind-классов: только пропсы и inline size.

import type { CSSProperties } from 'react';
import { ICONS, IPAL, type IconName } from './iconSet';
import { paletteFor, type Palette } from './palette';

export type { IconName };

/** 16, 32 и 48 — точные кратности сетки; 24 допустимо для декоративной иконки в строке. */
export type IconSize = 16 | 24 | 32 | 48;

export interface IconProps {
  /** Имя из генератора. */
  name: IconName;
  /** Сторона в пикселях, по умолчанию 16. */
  size?: IconSize;
  /**
   * Перекрасить от базового цвета токена: все четыре тона считаются по формуле pal()
   * генератора. Для hex — точно; для `var(--t2)` и подобных — через color-mix с теми же долями.
   * Без color берётся собственная палитра иконки (IPAL).
   */
  color?: string;
  /** Тултип и aria-label. Обязателен: у каждой иконки есть title. */
  title: string;
  className?: string;
  style?: CSSProperties;
}

/** Четыре пути по тонам 1–4; пустой тон — пустая строка. */
export type TonePaths = readonly [string, string, string, string];

const CELL = 16;
const cache = new Map<string, TonePaths>();

/**
 * Собирает по одному SVG-пути на тон: в каждом ряду соседние клетки одного тона
 * склеиваются в отрезок `M x y h n v1 h-n z`. Результат кэшируется по сетке.
 */
export function tonePaths(grid: string): TonePaths {
  const hit = cache.get(grid);
  if (hit) return hit;
  const out = ['', '', '', ''];
  const rows = grid.split('/');
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < CELL) {
      const t = row.charCodeAt(x) - 48;
      if (t < 1 || t > 4) {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < CELL && row.charCodeAt(x + n) - 48 === t) n++;
      out[t - 1] += `M${x} ${y}h${n}v1h-${n}z`;
      x += n;
    }
  }
  const result = out as unknown as TonePaths;
  cache.set(grid, result);
  return result;
}

/** Палитра иконки с учётом перекраски. */
export function iconPalette(name: IconName, color?: string): Palette {
  return color ? paletteFor(color) : IPAL[name];
}

export function Icon({ name, size = 16, color, title, className, style }: IconProps) {
  const paths = tonePaths(ICONS[name]);
  const tones = iconPalette(name, color);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${CELL} ${CELL}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
      className={className}
      style={{ display: 'block', flex: 'none', imageRendering: 'pixelated', ...style }}
    >
      <title>{title}</title>
      {paths.map((d, i) => (d ? <path key={i} d={d} fill={tones[i]} /> : null))}
    </svg>
  );
}

export default Icon;
