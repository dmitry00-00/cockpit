// Слои карты «Опасность» и «Погода» (ROADMAP 6.4, часть M7): линзы на карту, не события. Опасность — веса встреч мест
// кампании (с ждущими изменениями) и регион A5E с его таблицей; погода — d20 региона на этот день из лога: «Roll a d20
// for weather once for each region» (A5E) — бросок делает мастер кнопкой (DICE_ROLLED «Погода · регион»), слой его
// читает. Не брошено — так и показано: погоду дня никто не выдумывает. Чистые функции.
import { undoneIds } from '../engine/journal';
import type { DomainEvent, PayloadByType } from '../engine/events';
import { dayOf, type State } from '../engine/state';
import { JOURNEY_REGIONS, WARM_REGIONS, weatherAt, weatherRollLabel } from '../rules/a5e/journey';
import { seasonOf } from './calendar';
import { encounterRowsOf, type PulseEncounterRow } from './pulse';

export interface RegionWeather {
  roll: number;
  /** Зима и регион не тёплый — к броску +5. */
  winter: boolean;
  /** Строка таблицы региона дословно (clear, overcast, mist, foggy, rain, snow). */
  weather: string;
  /** Скрытый бросок мастера: игрокам его нет. */
  hidden: boolean;
}

/**
 * Погода регионов на день sec: последний неотменённый бросок «Погода · регион» за этот календарный день. Игрокам —
 * только открытые броски.
 */
export function regionWeatherOf(events: readonly DomainEvent[], sec: number, players = false): Map<string, RegionWeather> {
  const byLabel = new Map(Object.values(JOURNEY_REGIONS).map(r => [weatherRollLabel(r.name), r.id]));
  const undone = undoneIds(events);
  const day = dayOf(sec);
  const out = new Map<string, RegionWeather>();
  for (const e of events) {
    if (e.type !== 'DICE_ROLLED' || e.undoes || e.redoes || undone.has(e.id) || dayOf(e.worldSec) !== day) continue;
    const p = e.payload as PayloadByType['DICE_ROLLED'];
    const id = byLabel.get(p.label);
    if (!id || (players && p.hidden)) continue;
    const winter = seasonOf(e.worldSec) === 'winter' && !WARM_REGIONS.has(id);
    out.set(id, { roll: p.total, winter, weather: weatherAt(id, p.total, winter) ?? '—', hidden: p.hidden });
  }
  return out;
}

/** Опасность мест кампании: веса встреч по месту (id места). Встречи — секрет мастера: игрокам слоя нет. */
export function placeDangerOf(state: State): Map<string, PulseEncounterRow['entries']> {
  return new Map(encounterRowsOf(state).map(r => [r.id, r.entries]));
}
