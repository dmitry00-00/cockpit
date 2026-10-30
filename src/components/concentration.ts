// Сроки концентрации SRD и их подписи — отдельно от формы (ConcentrationForm — ленивый кусок, lazyParts): их читает
// основной кусок (styles.ts — сроки состояний), а форма в основной кусок не идёт.
/** Сроки SRD в секундах; 0 — без срока. */
export const CONCENTRATION_DURATIONS = [
  { sec: 60, label: '1 мин' },
  { sec: 600, label: '10 мин' },
  { sec: 3600, label: '1 ч' },
  { sec: 8 * 3600, label: '8 ч' },
  { sec: 24 * 3600, label: '24 ч' },
  { sec: 0, label: 'без срока' },
] as const;

/** Заклинание листа с концентрацией: имя SRD, срок SRD в секундах и строкой (дословно). */
export interface ConcentrationOption {
  id: string;
  name: string;
  durationSec?: number;
  duration: string;
}

/** Подпись срока в секундах: «1 мин», «2 ч», «1 раунд». */
export function durationLabel(sec: number): string {
  const known = CONCENTRATION_DURATIONS.find(d => d.sec === sec);
  if (known) return known.label;
  if (sec < 60) return sec === 6 ? '1 раунд' : `${sec / 6} раунд.`;
  return sec % 3600 === 0 ? `${sec / 3600} ч` : `${Math.round(sec / 60)} мин`;
}

