// Подписи и темп рекомендуемых часов загружаются из лестницы активного пакета сеттинга.
import { SCALE_LEVELS, type ScaleLevel, type Tempo } from '../engine';
import { DEFAULT_SETTING_PACKAGE, settingDataFor } from '../packages/registry';
import { parseScaleLadderProfile, type ScaleLadderProfile } from '../packages/settingData';

const TEMPO_LABEL: Readonly<Record<Tempo, string>> = {
  round: 'раунды', '10min': '10 минут', hour: 'часы', day: 'дни', tenday: 'десятидневки', season: 'сезоны', year: 'годы',
};
const profileCache = new Map<string, ScaleLadderProfile>();
export function scaleLadderForSetting(settingPackageId: string): ScaleLadderProfile {
  const cached = profileCache.get(settingPackageId);
  if (cached) return cached;
  const profile = parseScaleLadderProfile(settingDataFor(settingPackageId, 'ladder'), settingPackageId);
  profileCache.set(settingPackageId, profile);
  return profile;
}

const DEFAULT_LADDER = scaleLadderForSetting(DEFAULT_SETTING_PACKAGE);
export const SCALE_LABELS: Readonly<Record<ScaleLevel, string>> = Object.freeze(Object.fromEntries(DEFAULT_LADDER.ranks.map(rank => [rank.id, rank.labelRu])) as Record<ScaleLevel, string>);
/** Ранги ядра — стабильная структура. Пакет предоставляет параметры и подписи к этим рангам. */
export const SCALE_ORDER: readonly ScaleLevel[] = SCALE_LEVELS;
export const SCALE_TEMPO_LABELS: Readonly<Record<ScaleLevel, string>> = Object.freeze(Object.fromEntries(DEFAULT_LADDER.ranks.map(rank => [rank.id, TEMPO_LABEL[rank.tempo]])) as Record<ScaleLevel, string>);
