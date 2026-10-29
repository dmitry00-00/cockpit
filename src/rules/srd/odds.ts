// Математика d20 по 5e SRD 5.1 (ROADMAP 5.1, DESIGN Д1): шанс попадания, крита и провала спасброска, средний урон
// строки костей, ожидаемый урон атаки с критом, сопротивлением и уязвимостью, шанс удержать концентрацию. Чистые
// функции, без React. Правила — дословно ниже (CC-BY-4.0, см. LICENSE.md); снято с https://api.open5e.com/v1/sections/
// (attacking, damage-and-healing, abilities) 2026-10-28. Своего здесь нет: числа только складываются из правил.
import { concentrationSaveDc } from './checks';

export const ODDS_SOURCE = 'SRD 5.1: Attacking, Damage and Healing, Advantage and Disadvantage (CC-BY-4.0)';

/** Правила, по которым считается всё ниже, — дословно. */
export const ODDS_RULES = {
  rolling1or20: [
    "If the d20 roll for an attack is a 20, the attack hits regardless of any modifiers or the target's AC. This is called a critical hit.",
    "If the d20 roll for an attack is a 1, the attack misses regardless of any modifiers or the target's AC.",
  ],
  advantage: 'When that happens, you roll a second d20 when you make the roll. Use the higher of the two rolls if you have advantage, and use the lower roll if you have disadvantage.',
  criticalHits: "When you score a critical hit, you get to roll extra dice for the attack's damage against the target. Roll all of the attack's damage dice twice and add them together. Then add any relevant modifiers as normal.",
  resistance: 'If a creature or an object has resistance to a damage type, damage of that type is halved against it. If a creature or an object has vulnerability to a damage type, damage of that type is doubled against it.',
  resistanceOrder: 'Resistance and then vulnerability are applied after all other modifiers to damage.',
  both: 'If circumstances cause a roll to have both advantage and disadvantage, you are considered to have neither of them, and you roll one d20.',
} as const;

/** Как бросается d20: обычно, с преимуществом (лучший из двух), с помехой (худший из двух). */
export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export const ROLL_MODES: readonly RollMode[] = ['normal', 'advantage', 'disadvantage'];

export const ROLL_MODE_LABEL: Readonly<Record<RollMode, string>> = { normal: 'обычно', advantage: 'преимущество', disadvantage: 'помеха' };

/** Режим с постоянной помехой (тяжёлое у Маленького): преимущество и помеха гасят друг друга (ODDS_RULES.both). */
export function withDisadvantage(mode: RollMode): RollMode {
  return mode === 'advantage' ? 'normal' : 'disadvantage';
}

/** Строка костей «2d10 + 6»: кости и постоянная прибавка. */
export interface Dice {
  dice: readonly { count: number; sides: number }[];
  bonus: number;
}

/** «1d6 + 2», «2d10+6», «1d8 - 1», «5» → кости; не разобрать — null. */
export function parseDice(raw: string): Dice | null {
  const s = raw.replace(/\s+/g, '').replace(/[−–]/g, '-');
  if (!/^[+-]?(\d+d\d+|\d+)([+-](\d+d\d+|\d+))*$/.test(s)) return null;
  const dice: { count: number; sides: number }[] = [];
  let bonus = 0;
  for (const m of s.matchAll(/([+-]?)(\d+)(?:d(\d+))?/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      if (sign < 0) return null;
      dice.push({ count: Number(m[2]), sides: Number(m[3]) });
    } else bonus += sign * Number(m[2]);
  }
  return { dice, bonus };
}

/** Распределение суммы костей: индекс — сумма, значение — вероятность. */
function diceDistribution(dice: Dice['dice']): number[] {
  let dist = [1];
  for (const { count, sides } of dice) {
    for (let k = 0; k < count; k++) {
      const next = new Array<number>(dist.length + sides).fill(0);
      dist.forEach((p, sum) => { for (let f = 1; f <= sides; f++) next[sum + f] += p / sides; });
      dist = next;
    }
  }
  return dist;
}

/** Среднее строки костей: «1d6 + 2» → 5,5. Блок SRD печатает его округлённым вниз (5). */
export function diceMean(d: Dice): number {
  return d.dice.reduce((s, x) => s + (x.count * (x.sides + 1)) / 2, 0) + d.bonus;
}

/**
 * Как защита цели меняет урон одного типа: 0 — иммунитет, ½ — сопротивление, 2 — уязвимость, 1 — ничего.
 * `unclear` — тип упомянут в строке с условием («from nonmagical attacks»): числа нет, смотреть блок.
 */
export type DamageFactor = 0 | 0.5 | 1 | 2 | 'unclear';

export interface Defenses {
  resistances: readonly string[];
  immunities: readonly string[];
  vulnerabilities: readonly string[];
}

/** Строки блока «cold», «bludgeoning, piercing, and slashing from nonmagical attacks» против типа урона. */
export function damageFactor(type: string, def: Defenses): DamageFactor {
  const t = type.trim().toLowerCase();
  if (!t) return 1;
  const exact = (list: readonly string[]) => list.some(s => s.trim().toLowerCase() === t);
  const mentioned = (list: readonly string[]) => list.some(s => new RegExp(`\\b${t}\\b`).test(s.toLowerCase()));
  if (exact(def.immunities)) return 0;
  if (exact(def.resistances)) return 0.5;
  if (exact(def.vulnerabilities)) return 2;
  if (mentioned(def.immunities) || mentioned(def.resistances) || mentioned(def.vulnerabilities)) return 'unclear';
  return 1;
}

/** Часть урона атаки: кости и тип. У атаки дракона две: «2d10 + 6 piercing plus 1d8 acid». */
export interface DamagePart {
  dice: Dice;
  type: string;
}

/** Атака числами: бонус к попаданию и части урона. */
export interface AttackProfile {
  toHit: number;
  parts: readonly DamagePart[];
}

/**
 * Профиль атаки блока: основной урон из полей импорта, добавочный — из текста SRD «plus 4 (1d8) acid damage».
 * Текст блока дословный, поэтому добавочная часть снимается регуляркой, а не придумывается.
 */
export function attackProfileOf(attack: { toHit: number; damage?: string; damageType?: string }, text = ''): AttackProfile {
  const parts: DamagePart[] = [];
  const main = attack.damage ? parseDice(attack.damage) : null;
  if (main) parts.push({ dice: main, type: attack.damageType ?? '' });
  const hit = text.split(/Hit:/)[1] ?? '';
  for (const m of hit.matchAll(/plus \d+ \((\d+d\d+(?:\s*[+−-]\s*\d+)?)\) (\w+) damage/g)) {
    const d = parseDice(m[1]);
    if (d) parts.push({ dice: d, type: m[2] });
  }
  return { toHit: attack.toHit, parts };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Одна кость → режим: лучший из двух (1 − (1 − p)²) или худший из двух (p²). */
function withMode(p: number, mode: RollMode): number {
  if (mode === 'advantage') return 1 - (1 - p) * (1 - p);
  if (mode === 'disadvantage') return p * p;
  return p;
}

/** Шанс попадания: d20 + бонус ≥ AC; 20 на кости попадает всегда, 1 — промах всегда (Rolling 1 or 20). */
export function hitChance(toHit: number, ac: number, mode: RollMode = 'normal'): number {
  // Грани 2…19 попадают, когда грань ≥ AC − бонус; грань 20 — всегда.
  const need = Math.max(2, ac - toHit);
  const faces = Math.max(0, 19 - need + 1);
  return withMode((faces + 1) / 20, mode);
}

/** Шанс крита: 20 на кости, с преимуществом — хотя бы на одной из двух. */
export function critChance(mode: RollMode = 'normal'): number {
  return withMode(1 / 20, mode);
}

/** Шанс провалить спасбросок: d20 + модификатор < DC. У спасброска 1 и 20 не автоматичны — это правило атак. */
export function saveFailChance(saveMod: number, dc: number, mode: RollMode = 'normal'): number {
  const success = clamp01((21 - (dc - saveMod)) / 20);
  return 1 - withMode(success, mode);
}

/** Средний урон части по цели: модификатор урона — к каждому значению суммы, округление вниз (Round Down), не ниже 0. */
function partMean(dice: Dice, factor: number, crit: boolean): number {
  const doubled = crit ? dice.dice.map(x => ({ count: x.count * 2, sides: x.sides })) : dice.dice;
  if (factor === 1) return Math.max(0, diceMean({ dice: doubled, bonus: dice.bonus }));
  return diceDistribution(doubled).reduce((s, p, sum) => s + p * Math.floor(Math.max(0, sum + dice.bonus) * factor), 0);
}

export interface AttackOdds {
  hit: number;
  crit: number;
  /** Средний урон за одну атаку с промахами и критами; undefined — у атаки нет урона. */
  damage?: number;
  /** Защита цели упомянута с условием — у такой части урон посчитан без неё. */
  unclear: boolean;
}

/** Шанс и средний урон одной атаки против цели. Крит — среднее с удвоенными костями. */
export function attackOdds(profile: AttackProfile, ac: number, mode: RollMode = 'normal', def?: Defenses): AttackOdds {
  const hit = hitChance(profile.toHit, ac, mode);
  const crit = critChance(mode);
  let unclear = false;
  let damage: number | undefined;
  if (profile.parts.length) {
    damage = 0;
    for (const part of profile.parts) {
      const f = def ? damageFactor(part.type, def) : 1;
      if (f === 'unclear') unclear = true;
      const factor = f === 'unclear' ? 1 : f;
      damage += (hit - crit) * partMean(part.dice, factor, false) + crit * partMean(part.dice, factor, true);
    }
  }
  return { hit, crit, ...(damage !== undefined ? { damage } : {}), unclear };
}

/** Шанс удержать концентрацию после урона: спасбросок Constitution против DC 10 или половины урона. */
export function concentrationHoldChance(conSave: number, damage: number, mode: RollMode = 'normal'): number {
  return 1 - saveFailChance(conSave, concentrationSaveDc(damage), mode);
}

/** Спасбросок из текста SRD: «DC 13 Dexterity saving throw» → DC и характеристика. */
export const SAVE_IN_TEXT = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i;

const ABILITY_OF: Readonly<Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>> = {
  strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

/** Первый спасбросок в тексте действия: DC и характеристика; нет — null. */
export function saveInText(text: string): { dc: number; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' } | null {
  const m = SAVE_IN_TEXT.exec(text);
  return m ? { dc: Number(m[1]), ability: ABILITY_OF[m[2].toLowerCase()] } : null;
}

/** Спасбросок заклинания из текста SRD: «must succeed on a dexterity saving throw», «must make a Wisdom saving throw». */
export function spellSaveAbility(text: string): 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | null {
  const m = /(?:succeed on|make) an? (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i.exec(text);
  return m ? ABILITY_OF[m[1].toLowerCase()] : null;
}

/** 0,35 → «35%»; меньше процента, но не ноль — «<1%», почти наверняка — «>99%». */
export function percent(p: number): string {
  if (p > 0 && p < 0.005) return '<1%';
  if (p < 1 && p > 0.995) return '>99%';
  return `${Math.round(p * 100)}%`;
}

/** Средний урон для стола: одна цифра после запятой, «2,4». */
export function meanText(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: n % 1 === 0 ? 0 : 1 });
}
