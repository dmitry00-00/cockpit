export type UiTheme = 'flat' | 'material';

export const UI_THEME_KEY = 'dm-cockpit:ui-theme:v1';
const LEGACY_PARTY_CARD_THEME_KEY = 'dm-cockpit:party-card-theme:v1';

/** Restores the app-wide appearance, migrating the earlier party-only setting once. */
export function readUiTheme(): UiTheme {
  try {
    const stored = localStorage.getItem(UI_THEME_KEY);
    if (stored === 'flat' || stored === 'material') return stored;
    const legacy = localStorage.getItem(LEGACY_PARTY_CARD_THEME_KEY);
    return legacy === 'flat' || legacy === 'material' ? legacy : 'material';
  } catch {
    return 'material';
  }
}

export function writeUiTheme(theme: UiTheme): void {
  try { localStorage.setItem(UI_THEME_KEY, theme); } catch { /* Storage can be unavailable in private contexts. */ }
}
