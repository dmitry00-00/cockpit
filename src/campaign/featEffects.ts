import { featById, type Feat } from '../rules/compendium';

export interface LevelUpFeatEffect {
  hp?: { onAcquisitionPerCharacterLevel: number; perFutureLevel: number };
}

const TOUGH_HP_TEXT = 'Максимум ваших хитов увеличивается на количество, равное удвоенному уровню, на котором берётся эта черта. Каждый раз, когда вы впоследствии будете получать уровень, максимум ваших хитов будет дополнительно увеличиваться на 2.';

/** Only adapt a feat when the imported source row still matches the fully understood rule. */
export function levelUpFeatEffectOf(feat: Feat): LevelUpFeatEffect | undefined {
  if (feat.id !== 'krepkiy' || feat.source !== 'book' || feat.text.trim() !== ''
    || feat.effects.hp !== TOUGH_HP_TEXT || Object.keys(feat.effects).some(kind => kind !== 'hp')) return undefined;
  return { hp: { onAcquisitionPerCharacterLevel: 2, perFutureLevel: 2 } };
}

/** HP gained at later levels from previously recorded feats with an exact adapter. */
export function ongoingFeatHpPerLevel(feats: readonly { id: string }[] | undefined): number {
  return (feats ?? []).reduce((sum, pick) => {
    const feat = featById(pick.id);
    return sum + (feat ? levelUpFeatEffectOf(feat)?.hp?.perFutureLevel ?? 0 : 0);
  }, 0);
}
