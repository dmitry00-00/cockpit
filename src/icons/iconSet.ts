// Набор иконок (сетки 16×16 и палитры из icons.generated.ts) — своим куском, как справочники (TASKS Q18): данные
// меняются только при пересборке генератора, код стола — каждый выпуск. await на верхнем уровне: модуль
// исполняется, когда набор уже пришёл, и потребители читают ICONS как прежде. Входит в старт — см. bundle-report.
const set = await import('./icons.generated');

export const ICONS = set.ICONS;
export const IPAL = set.IPAL;
export const ICON_NAMES = set.ICON_NAMES;
export type { IconName } from './icons.generated';
