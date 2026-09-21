// Кости: разбор формулы и бросок. Случайность — снаружи (rng), чтобы тесты и реплей были точны.
import type { DiceRolled } from './events';
import { EngineError } from './reduce';

export interface Formula { count: number; sides: number; mod: number; text: string }

const FORMULA = /^\s*(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

/** «2d6+5», «d20», «4d8», «1d20-1». Кость и модификатор — целые; ноль костей не бросают. */
export function parseFormula(text: string): Formula {
  const m = FORMULA.exec(text);
  if (!m) throw new EngineError(`не формула броска: «${text}»`);
  const count = m[1] === '' ? 1 : Number(m[1]);
  const sides = Number(m[2]);
  const mod = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  if (count < 1 || count > 100) throw new EngineError(`костей от 1 до 100, получено ${count}`);
  if (![2, 3, 4, 6, 8, 10, 12, 20, 100].includes(sides)) throw new EngineError(`нет такой кости: d${sides}`);
  const norm = `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`;
  return { count, sides, mod, text: norm };
}

export type Rng = () => number;

export interface RollOptions { hidden?: boolean; label?: string; rng?: Rng }

/** Бросок по формуле — готовый payload DICE_ROLLED. */
export function roll(text: string, opts: RollOptions = {}): DiceRolled {
  const f = parseFormula(text);
  const rng = opts.rng ?? Math.random;
  const dice: number[] = [];
  for (let i = 0; i < f.count; i++) dice.push(1 + Math.floor(rng() * f.sides));
  const total = dice.reduce((s, d) => s + d, 0) + f.mod;
  return { formula: f.text, dice, mod: f.mod, total, hidden: opts.hidden ?? false, label: opts.label ?? '' };
}

/** Крит и провал — только у одиночного d20 (SRD: natural 20 / natural 1 на бросок атаки). */
export function d20Outcome(r: DiceRolled): 'crit' | 'fail' | null {
  if (!/^1d20/.test(r.formula) || r.dice.length !== 1) return null;
  if (r.dice[0] === 20) return 'crit';
  if (r.dice[0] === 1) return 'fail';
  return null;
}
