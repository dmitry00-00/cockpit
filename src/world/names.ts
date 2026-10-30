// Имена NPC из округи партии: жители мест вики (импорт {{Person}}, CC BY-SA 3.0) в радиусе от партии дают имена и
// фамилии своей земли — калишитские у Calimshan, северные у Silver Marches. Новое имя — имя одного жителя и фамилия
// другого: звучит как здешнее, но не совпадает ни с кем из канона (иначе мастер случайно вызовет известного NPC).
// Чистые функции: данные (люди, места справочника, точка партии) приходят аргументами, случайность — тоже.

import type { Person } from './people';

export interface NamePoint { x: number; y: number }

/** Части имени жителя: «Khelben "Blackstaff" Arunsun» → Khelben + Arunsun; «Achem el Zalath» → Achem + el Zalath. */
export interface NameParts { given: string; family?: string }

const ROMAN = /^(?:[IVX]+)$/;
const WORD = /^\p{Lu}[\p{L}'’-]+$/u;

/** Имя жителя по частям; прозвище в кавычках, пометки в скобках, титулы после «the»/«of» и порядковые номера — прочь.
 *  Неразбираемое («"The Green Lady"», «Raoryndar or Rindlar») — null. */
export function nameParts(raw: string): NameParts | null {
  if (/\bor\b/.test(raw)) return null;
  const clean = raw.replace(/"[^"]*"/g, ' ').replace(/\([^)]*\)/g, ' ').trim();
  let words = clean.split(/\s+/).filter(Boolean);
  const cut = words.findIndex((w, i) => i > 0 && (w === 'the' || w === 'of' || w === 'and'));
  if (cut > 0) words = words.slice(0, cut);
  while (words.length > 1 && ROMAN.test(words[words.length - 1])) words = words.slice(0, -1);
  if (words.length === 0 || !WORD.test(words[0])) return null;
  const rest = words.slice(1);
  if (rest.length === 0) return { given: words[0] };
  // Фамилия кончается словом с заглавной: частицы (el, bint, yn, mac, von, o') — её часть.
  if (!WORD.test(rest[rest.length - 1])) return { given: words[0] };
  return { given: words[0], family: rest.join(' ') };
}

/** Раса блока SRD → ключ расы жителей вики: «humanoid (elf)» → elf; «any race» и не гуманоиды — без отбора. */
export function raceKey(monsterType: string): string | undefined {
  const m = /humanoid\s*\(([^)]*)\)/i.exec(monsterType);
  if (!m || /any/i.test(m[1])) return undefined;
  const sub = m[1].toLowerCase();
  if (sub.includes('goblinoid')) return 'goblin';
  return ['elf', 'dwarf', 'gnome', 'halfling', 'orc', 'kobold', 'gnoll', 'lizardfolk', 'human'].find(k => sub.includes(k));
}

/** Житель подходит расе: ключ elf — и Moon elf, и Drow elf; goblin — и hobgoblin, и bugbear. */
function raceFits(race: string | undefined, key: string | undefined): boolean {
  if (!key) return true;
  const r = (race ?? '').toLowerCase();
  if (key === 'goblin') return /goblin|bugbear/.test(r);
  if (key === 'orc') return /\borc\b/.test(r) && !r.includes('half');
  if (key === 'elf') return /\belf\b|drow/.test(r) && !r.includes('half');
  return r.includes(key);
}

export interface NamePool {
  given: string[];
  family: string[];
  /** Сколько жителей дали имена и в каком радиусе (мили), — для подсказки мастеру. */
  people: number;
  miles: number;
  /** Отбор по расе снят: рядом жителей этой расы слишком мало. */
  anyRace: boolean;
}

export interface PoolOptions {
  /** Ключ расы — raceKey(тип блока). */
  race?: string;
  /** Мили на пиксель карты (паспорт карты). */
  milesPerPixel: number;
  /** С какого радиуса начинать, мили; радиус удваивается, пока имён мало. */
  startMiles?: number;
  /** Сколько разных имён нужно, чтобы выбор не повторялся. */
  minGiven?: number;
}

/** Имена и фамилии жителей мест в радиусе от точки; мало — радиус шире, потом без отбора по расе, потом весь мир. */
export function namePool(people: Iterable<Person>, placeXY: ReadonlyMap<string, NamePoint>, at: NamePoint, opts: PoolOptions): NamePool {
  const { race, milesPerPixel, startMiles = 150, minGiven = 30 } = opts;
  const located: { p: Person; parts: NameParts; miles: number }[] = [];
  for (const p of people) {
    const xy = p.place ? placeXY.get(p.place) : undefined;
    const parts = nameParts(p.name);
    if (!xy || !parts) continue;
    located.push({ p, parts, miles: Math.hypot(xy.x - at.x, xy.y - at.y) * milesPerPixel });
  }
  const collect = (miles: number, byRace: boolean): NamePool => {
    const given = new Set<string>(), family = new Set<string>();
    let n = 0;
    for (const { p, parts, miles: d } of located) {
      if (d > miles || (byRace && !raceFits(p.race, race))) continue;
      n++;
      given.add(parts.given);
      if (parts.family) family.add(parts.family);
    }
    return { given: [...given].sort(), family: [...family].sort(), people: n, miles: Math.round(miles), anyRace: !byRace && race !== undefined };
  };
  for (const byRace of race ? [true, false] : [false]) {
    for (let miles = startMiles; miles <= startMiles * 16; miles *= 2) {
      const pool = collect(miles, byRace);
      if (pool.given.length >= minGiven) return pool;
    }
  }
  return collect(Infinity, false);
}

/** Новое имя из пула: имя одного жителя + фамилия другого, не совпадающее ни с каноном, ни с занятыми. */
export function makeName(pool: NamePool, taken: ReadonlySet<string>, rand: () => number = Math.random): string | null {
  if (pool.given.length === 0) return null;
  const pick = (xs: readonly string[]) => xs[Math.floor(rand() * xs.length)];
  for (let i = 0; i < 40; i++) {
    const name = pool.family.length > 0 ? `${pick(pool.given)} ${pick(pool.family)}` : pick(pool.given);
    if (!taken.has(name.toLowerCase())) return name;
  }
  return null;
}
