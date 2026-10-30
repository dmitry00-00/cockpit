// Сидированный бросок процессов мира (SIMULATION.md, решение пользователя 30.10.2026): d20 от ключей — процесс,
// секунда такта и смысл броска. Ключ — секунда такта, а не id шага времени: исход тот же при реплее лога, в ветке
// «что если» и при любом дроблении шага (год одним шагом или двенадцатью месяцами).

/** FNV-1a, 32 бита: строка → зерно. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: зерно → число в [0, 1). */
function unit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Бросок dN от ключей: те же ключи — тот же результат. */
export const rollOf = (sides: number, ...keys: readonly string[]): number => 1 + Math.floor(unit(hash32(keys.join('|'))) * sides);

export const d20 = (...keys: readonly string[]): number => rollOf(20, ...keys);
