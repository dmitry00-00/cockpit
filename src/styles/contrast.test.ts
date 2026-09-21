import { describe, it, expect } from 'vitest';
import { COLORS } from './tokens.generated';

/** WCAG 2.1: относительная яркость и контраст. Токены обещают числа в usage — здесь они пересчитываются. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const value = (name: string) => COLORS.find(c => c.name === name)!.resolved;

describe('контраст токенов', () => {
  const claims = COLORS.flatMap(c =>
    [...c.usage.matchAll(/(\d+(?:\.\d+)?):1 к (bg|pn|cd|pl)\b/g)].map(m => ({ token: c.name, ratio: Number(m[1]), surface: m[2] })),
  );
  // usage бывает про соседа: «tx даёт 13.1:1» в описании bg. Такие проверяются по названному токену.
  const named = COLORS.flatMap(c =>
    [...c.usage.matchAll(/\b(tx|t2|t3|gd|bl|br)\b[^.;]*?(\d+(?:\.\d+)?):1/g)].map(m => ({ token: m[1], ratio: Number(m[2]), surface: c.name })),
  ).filter(x => ['bg', 'pn', 'cd', 'pl'].includes(x.surface));

  it('в usage есть заявленные контрасты, и их много', () => {
    expect(claims.length).toBeGreaterThan(20);
  });

  it.each([...claims, ...named])('$token к $surface ≈ $ratio:1', ({ token, ratio, surface }) => {
    expect(Math.abs(contrast(value(token), value(surface)) - ratio)).toBeLessThanOrEqual(0.15);
  });

  it('текст на своих поверхностях не ниже 4.5:1; t3 на плите ниже — и потому туда не ставится', () => {
    for (const t of ['tx', 't2', 't3']) for (const s of ['bg', 'pn', 'cd']) expect(contrast(value(t), value(s))).toBeGreaterThanOrEqual(4.5);
    for (const t of ['tx', 't2', 'gd']) expect(contrast(value(t), value('pl'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(value('t3'), value('pl'))).toBeLessThan(4.5);
  });

  it('кольцо фокуса gd — не ниже 3:1 на любой поверхности', () => {
    for (const s of ['wl', 'bg', 'pn', 'cd', 'pl']) expect(contrast(value('gd'), value(s))).toBeGreaterThanOrEqual(3);
  });

  it('осветлённые -hi характеристик годятся как текст на bg (≥ 4.5), базовые STR/INT/WIS — нет', () => {
    for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha']) expect(contrast(value(`ab-${ab}-hi`), value('bg'))).toBeGreaterThanOrEqual(4.5);
    for (const ab of ['str', 'int', 'wis']) expect(contrast(value(`ab-${ab}`), value('bg'))).toBeLessThan(4.5);
  });
});
