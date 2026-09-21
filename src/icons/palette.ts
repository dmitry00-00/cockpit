// Четыре тона иконки из базового цвета токена.
// Формула повторяет pal() из design/icons-generator.js один в один — паритет держит palette.test.ts:
// для каждой иконки pal(IPAL[name][2]) равен IPAL[name].

/** Четыре тона: 1 самый тёмный … 4 самый светлый; тон 3 — базовый цвет. */
export type Palette = readonly [string, string, string, string];

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Цвет вида '#rrggbb' — только с ним считается точная палитра. */
export function isHex6(color: string): boolean {
  return HEX6.test(color);
}

const hx = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const to = (c: number[]): string =>
  '#' +
  c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** Линейное смешение a → b на долю t в sRGB, как в генераторе. */
export function mix(a: string, b: string, t: number): string {
  const bb = hx(b);
  return to(hx(a).map((v, i) => v + (bb[i] - v) * t));
}

/** Палитра иконки от базового цвета: тень, полутень, база, блик. */
export function pal(base: string): Palette {
  return [mix(base, '#000000', 0.62), mix(base, '#000000', 0.3), base, mix(base, '#ffffff', 0.42)];
}

/**
 * Те же четыре тона, но для цвета, который нельзя посчитать заранее — `var(--t2)`,
 * `currentColor`. Доли совпадают с pal(): 38 % базы к чёрному, 70 % к чёрному, 58 % к белому.
 */
export function palCss(color: string): Palette {
  return [
    `color-mix(in srgb, ${color} 38%, #000)`,
    `color-mix(in srgb, ${color} 70%, #000)`,
    color,
    `color-mix(in srgb, ${color} 58%, #fff)`,
  ];
}

/** Палитра для произвольного значения color: hex — точная, иначе через color-mix. */
export function paletteFor(color: string): Palette {
  return isHex6(color) ? pal(color) : palCss(color);
}
