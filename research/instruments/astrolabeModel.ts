// И5, прототип ПР1 «астролябия-часы»: чистая геометрия прибора над календарём кокпита. Песочница исследования —
// в сборку приложения не входит (tsconfig.app.json берёт только src/), код src/ не меняет, только читает.
//
// Устройство (решение кокпита, не механика):
// - лимб (неподвижное кольцо) — сутки, полдень сверху, полночь снизу, утро слева, вечер справа, как у HarptosDial;
// - решётка (rete) — кольцо года: двенадцать месяцев и праздники по числу дней; солнце сидит на сегодняшнем дне
//   кольца, а сама решётка повёрнута так, что солнце показывает на лимбе час. Оборот решётки — сутки, как у
//   настоящей астролябии; за день солнце сдвигается по кольцу почти на градус;
// - линейка (rule) — указатель дня на кольце: её поворот вперёд выбирает день, к которому шагнуть.
// Время только вперёд (редьюсер: «назад — через отмену»), поэтому у жеста нет отрицательного шага.
import { EPOCH_YEAR, MOON_CYCLE_DAYS, daysInYear, harptos, moonState, yearSlots, yearStartSec, SEASON_LABELS, type MoonPhase, type Season } from '../../src/campaign/calendar';
import { holyDaysOn, isAnnual, type HolyDay } from '../../src/campaign/holyDays';
import { eraOf } from '../../src/campaign/era';
import { SECONDS_PER_DAY } from '../../src/engine/state';
import type { Tempo } from '../../src/engine/events';

const DAY = SECONDS_PER_DAY;
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Угол часа на лимбе, градусы по часовой от верха: полдень — 0, полночь — 180 (как dialPoint у HarptosDial). */
export const hourDeg = (sec: number): number => mod((mod(sec, DAY) / DAY) * 360 + 180, 360);

/** Точка на окружности: угол по часовой от верха. */
export function polar(deg: number, r: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

/** День года с долей суток (0 — начало 1 Hammer) и длина года. */
export function yearPos(sec: number): { year: number; doy: number; diy: number } {
  const { year } = harptos(sec);
  return { year, doy: (sec - yearStartSec(year)) / DAY, diy: daysInYear(year) };
}

/** Место дня на кольце решётки, градусы от нуля решётки по часовой. */
export const ringDeg = (doy: number, diy: number): number => (doy / diy) * 360;

/**
 * Поворот решётки, градусы — без свёртки по 360: оборот за сутки минус ход солнца по кольцу за год. Непрерывен и
 * через полночь, и через новый год, поэтому переход вида анимируется в ту же сторону, куда шло время, а отмена — обратно.
 */
export function reteDeg(sec: number): number {
  const { year, doy, diy } = yearPos(sec);
  return (sec / DAY) * 360 + 180 - 360 * (year - EPOCH_YEAR + doy / diy);
}

export interface RingSlot {
  key: string;
  /** Имя месяца или праздника — латиницей, как в книгах. */
  label: string;
  festival: boolean;
  startDeg: number;
  endDeg: number;
  season: Season;
}

/** Кольцо года: месяцы и праздники в порядке календаря, длина дуги — по числу дней. */
export function ringSlots(year: number): RingSlot[] {
  const diy = daysInYear(year);
  const start = yearStartSec(year);
  return yearSlots(year).map(s => {
    const d0 = (s.startSec - start) / DAY;
    return {
      key: s.month ?? s.festival!,
      label: s.month ?? s.festival!,
      festival: s.month === null,
      startDeg: ringDeg(d0, diy),
      endDeg: ringDeg(d0 + s.days, diy),
      season: s.season,
    };
  });
}

/** Границы и середины сезонов на кольце — подписи «зима», «весна»… */
export function seasonArcs(year: number): { season: Season; label: string; startDeg: number; endDeg: number }[] {
  const out: { season: Season; label: string; startDeg: number; endDeg: number }[] = [];
  for (const s of ringSlots(year)) {
    const last = out[out.length - 1];
    if (last && last.season === s.season) last.endDeg = s.endDeg;
    else out.push({ season: s.season, label: SEASON_LABELS[s.season], startDeg: s.startDeg, endDeg: s.endDeg });
  }
  return out;
}

export interface HolyMark {
  deg: number;
  day: number;
  holy: HolyDay[];
  /** Среди богов дня есть бог партии. */
  party: boolean;
}

/** Годовые святые дни на кольце (праздник или дата; ежемесячные и лунные — нет, иначе меток было бы три сотни). */
export function holyMarks(year: number, partyDeities: ReadonlySet<string>): HolyMark[] {
  const diy = daysInYear(year);
  const start = yearStartSec(year);
  const era = eraOf(year);
  const out: HolyMark[] = [];
  for (let d = 0; d < diy; d++) {
    const holy = holyDaysOn(start + d * DAY, era, 'faerun').filter(h => isAnnual(h.rule));
    if (holy.length) out.push({ deg: ringDeg(d + 0.5, diy), day: d, holy, party: holy.some(h => partyDeities.has(h.deity)) });
  }
  return out;
}

export interface MoonDisc {
  phase: MoonPhase;
  /** Освещённая доля диска 0…1 по дню цикла (косинус) — геометрия решением кокпита; фазу словом даёт moonState. */
  lit: number;
  /** Растёт — освещён правый край (северное полушарие). */
  waxing: boolean;
  daysToFull: number;
}

export function moonDisc(sec: number): MoonDisc {
  const m = moonState(sec);
  const sinceFull = (MOON_CYCLE_DAYS - m.daysToFull) % MOON_CYCLE_DAYS;
  return { phase: m.phase, lit: (1 + Math.cos((2 * Math.PI * sinceFull) / MOON_CYCLE_DAYS)) / 2, waxing: sinceFull > MOON_CYCLE_DAYS / 2, daysToFull: m.daysToFull };
}

/** Путь освещённой части диска радиуса r: внешняя полуокружность и терминатор-эллипс. */
export function moonPath(m: MoonDisc, r: number): string {
  if (m.lit <= 0.002) return '';
  const side = m.waxing ? 1 : 0; // 1 — правая полуокружность освещена
  const rx = Math.abs(1 - 2 * m.lit) * r;
  const outer = `M0 ${-r} A${r} ${r} 0 0 ${side} 0 ${r}`;
  // Серп (lit < ½): терминатор выгибается к освещённому краю; горб — к тёмному.
  // Обход в SVG (y вниз): от низа против часовой — через правую сторону, по часовой — через левую.
  const sweep = m.lit < 0.5 ? 1 - side : side;
  return `${outer} A${rx.toFixed(2)} ${r} 0 0 ${sweep} 0 ${-r} Z`;
}

/* ---------- Жест → шаг времени ---------- */

/** 360° решётки — сутки, 1440 минут. */
export const MINUTES_PER_DEG = 1440 / 360;

/** Шаг щелчка решётки в минутах: темп, если он внутри суток, иначе час. В бою (раунды) решётка заперта. */
export function reteUnitMin(tempo: Tempo): number {
  return tempo === '10min' ? 10 : tempo === 'day' ? 1440 : 60;
}

/** Минуты — в событие: самый крупный темп, которым шаг делится нацело. Сутки ровно — тот же шаг, что кнопка «день». */
export function normalizeStep(minutes: number): { tempo: Tempo; steps: number } | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 1440 === 0) return { tempo: 'day', steps: minutes / 1440 };
  if (minutes % 60 === 0) return { tempo: 'hour', steps: minutes / 60 };
  if (minutes % 10 === 0) return { tempo: '10min', steps: minutes / 10 };
  return null;
}

/** Поворот решётки на deltaDeg (с учётом полных оборотов) → прищёлкнутые минуты; назад — 0. */
export function snapReteMinutes(deltaDeg: number, tempo: Tempo): number {
  const unit = reteUnitMin(tempo);
  return Math.max(0, Math.round((deltaDeg * MINUTES_PER_DEG) / unit) * unit);
}

/** Поворот линейки на deltaDeg вперёд от солнца → целых дней (не больше года). */
export function ruleDays(deltaDeg: number, diy: number): number {
  return Math.min(diy, Math.max(0, Math.round((deltaDeg / 360) * diy)));
}

/** Разница углов в (-180, 180] — для накопления поворота под указателем без скачка на 360. */
export function angleDelta(from: number, to: number): number {
  const d = mod(to - from + 180, 360) - 180;
  return d === -180 ? 180 : d;
}

/** Угол точки (x, y) относительно центра, по часовой от верха. */
export const pointDeg = (x: number, y: number): number => mod((Math.atan2(x, -y) * 180) / Math.PI, 360);
