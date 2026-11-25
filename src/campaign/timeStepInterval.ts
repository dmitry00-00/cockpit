import { TEMPO_SECONDS, type Tempo } from '../engine/events';
import { calendarAdapterForSetting } from './calendar';
import { DEFAULT_SETTING_PACKAGE } from '../packages/registry';

export function timeStepEnd(fromSec: number, tempo: Tempo, steps: number, settingPackageId = DEFAULT_SETTING_PACKAGE): number {
  if (!Number.isSafeInteger(steps) || steps < 1) throw new Error('Число шагов должно быть целым и положительным');
  if (tempo !== 'year') return fromSec + TEMPO_SECONDS[tempo] * steps;
  const calendar = calendarAdapterForSetting(settingPackageId);
  if (!calendar.addYears) throw new Error(`Календарь ${calendar.id} не поддерживает шаг по годам`);
  return calendar.addYears(fromSec, steps);
}

export function needsTimePreview(fromSec: number, tempo: Tempo, steps: number, settingPackageId = DEFAULT_SETTING_PACKAGE): boolean {
  return timeStepEnd(fromSec, tempo, steps, settingPackageId) - fromSec >= TEMPO_SECONDS.day;
}
