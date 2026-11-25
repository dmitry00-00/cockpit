import { PACKAGE_INDEX } from './index.generated';

/** Default setting for new campaigns and logs created before package selection existed. */
export const DEFAULT_SETTING_PACKAGE = 'fr';

/** Only package ids declared with kind `setting` may be stored on a campaign. */
export function isSettingPackageId(packageId: string): boolean {
  return PACKAGE_INDEX.some(entry => entry.id === packageId && entry.kind === 'setting');
}
