export const SELECTED_PARTY_HERO_KEY = 'dm-cockpit:selected-party-hero:v1';

export function readSelectedPartyHero(partyIds: readonly string[]): string {
  try {
    const stored = localStorage.getItem(SELECTED_PARTY_HERO_KEY);
    if (stored && partyIds.includes(stored)) return stored;
  } catch { /* Use the first current party member when storage is unavailable. */ }
  return partyIds[0] ?? '';
}

export function writeSelectedPartyHero(heroId: string, partyIds: readonly string[]): void {
  if (!heroId || !partyIds.includes(heroId)) return;
  try { localStorage.setItem(SELECTED_PARTY_HERO_KEY, heroId); } catch { /* Storage can be unavailable in private contexts. */ }
}
