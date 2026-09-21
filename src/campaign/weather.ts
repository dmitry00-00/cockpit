// Погода в полосе часов (HANDOFF §4, §13: «Облачно, +14 °C, лёгкий ветер») — проекция календаря, не состояние
// и не событие: тот же день даёт ту же погоду на любом столе, отменять и хранить нечего. Температура — по
// месяцу Харптоса для Sword Coast North, разброс и небо — детерминированным хешем дня. Мастер не правит её
// руками — погода, которую предлагает симуляция, придёт предложением с патчем места, когда появится карта.
import { harptos, MONTHS, type MonthName } from './calendar';
import { SECONDS_PER_DAY } from '../engine/state';

export type Sky = 'clear' | 'cloudy' | 'rain' | 'storm';
export type Wind = 'calm' | 'light' | 'strong';

export interface Weather {
  sky: Sky;
  /** Градусы Цельсия, целое. */
  tempC: number;
  wind: Wind;
}

export const SKY_LABELS: Readonly<Record<Sky, string>> = { clear: 'Ясно', cloudy: 'Облачно', rain: 'Дождь', storm: 'Гроза' };
export const WIND_LABELS: Readonly<Record<Wind, string>> = { calm: 'штиль', light: 'лёгкий ветер', strong: 'сильный ветер' };

/** Средняя температура месяца, Sword Coast North: от Hammer к Nightal. Праздник — как месяц перед ним. */
const MONTH_TEMP: Readonly<Record<MonthName, number>> = {
  Hammer: -5, Alturiak: -3, Ches: 3, Tarsakh: 8, Mirtul: 13, Kythorn: 18,
  Flamerule: 23, Eleasis: 24, Eleint: 18, Marpenoth: 12, Uktar: 5, Nightal: -2,
};

/** Семя погоды кампании: выбрано так, чтобы 15 Mirtul 1492 DR дал погоду §13 — «Облачно, +14 °C, лёгкий ветер». */
export const WEATHER_SEED = 4;

/** Целочисленный хеш дня — xorshift; один и тот же день → одно число, соседние дни — разные. */
function hashDay(day: number, salt: number): number {
  let x = (day + WEATHER_SEED + salt * 0x85eb) | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
}

/** Месяц дня; вставной праздник — как месяц перед ним (Midwinter — Hammer, Greengrass — Tarsakh…). */
function monthOf(sec: number): MonthName {
  const d = harptos(sec);
  if (d.month) return d.month;
  const before = harptos(sec - SECONDS_PER_DAY);
  return before.month ?? MONTHS[0];
}

export function weatherOf(sec: number): Weather {
  const day = Math.floor(sec / SECONDS_PER_DAY);
  const base = MONTH_TEMP[monthOf(sec)];
  const h1 = hashDay(day, 1) % 9; // −4…+4
  const h2 = hashDay(day, 2) % 100;
  const h3 = hashDay(day, 3) % 10;
  const sky: Sky = h2 < 40 ? 'clear' : h2 < 75 ? 'cloudy' : h2 < 95 ? 'rain' : 'storm';
  const wind: Wind = sky === 'storm' ? 'strong' : h3 < 3 ? 'calm' : h3 < 8 ? 'light' : 'strong';
  return { sky, tempC: base + h1 - 4, wind };
}

/** «Облачно, +14 °C, лёгкий ветер»; минус — U+2212, как везде в числах. */
export function weatherLabel(w: Weather): string {
  const t = w.tempC < 0 ? `−${-w.tempC}` : `+${w.tempC}`;
  return `${SKY_LABELS[w.sky]}, ${t} °C, ${WIND_LABELS[w.wind]}`;
}
