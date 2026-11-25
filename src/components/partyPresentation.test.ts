import { beforeEach, expect, it } from 'vitest';
import { SELECTED_PARTY_HERO_KEY, readSelectedPartyHero, writeSelectedPartyHero } from './partyPresentation';

beforeEach(() => { localStorage.clear(); });

it('restores the selected hero only while that actor belongs to the current party', () => {
  writeSelectedPartyHero('lyra', ['bo', 'lyra']);
  expect(localStorage.getItem(SELECTED_PARTY_HERO_KEY)).toBe('lyra');
  expect(readSelectedPartyHero(['bo', 'lyra'])).toBe('lyra');
  expect(readSelectedPartyHero(['bo'])).toBe('bo');
  writeSelectedPartyHero('outside-party', ['bo']);
  expect(localStorage.getItem(SELECTED_PARTY_HERO_KEY)).toBe('lyra');
});
