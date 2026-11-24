import { describe, expect, it } from 'vitest';
import { combineRollModes, mentalStressRollMode, strifeDisadvantage, strifeRollMode } from './strife';
import { activeA5eStressEffect, A5E_LONG_STRESS_EFFECTS, A5E_SHORT_STRESS_EFFECTS } from '../rules/a5e/strife';

describe('A5E Strife roll effects', () => {
  it('uses the A5E short- and long-term tables and expires short effects by world time', () => {
    expect(A5E_SHORT_STRESS_EFFECTS).toHaveLength(10);
    expect(A5E_LONG_STRESS_EFFECTS).toHaveLength(10);
    const shortEffect = { kind: 'short' as const, id: 'sleepless' as const, untilSec: 86_400 };
    expect(activeA5eStressEffect(shortEffect, 86_399)).toEqual(shortEffect);
    expect(activeA5eStressEffect(shortEffect, 86_400)).toBeUndefined();
    expect(activeA5eStressEffect({ kind: 'long', id: 'covetous' }, 99_999_999)).toEqual({ kind: 'long', id: 'covetous' });
  });

  it('level 1 affects only Intelligence, Wisdom, and Charisma checks', () => {
    expect(strifeDisadvantage(1, { kind: 'check', ability: 'int' })).toBe(true);
    expect(strifeDisadvantage(1, { kind: 'check', ability: 'wis' })).toBe(true);
    expect(strifeDisadvantage(1, { kind: 'check', ability: 'cha' })).toBe(true);
    expect(strifeDisadvantage(1, { kind: 'check', ability: 'con' })).toBe(false);
    expect(strifeDisadvantage(1, { kind: 'save', ability: 'wis' })).toBe(false);
  });

  it('level 2 affects concentration checks; level 4 affects mental attacks and saves', () => {
    expect(strifeDisadvantage(2, { kind: 'concentration' })).toBe(true);
    expect(strifeDisadvantage(1, { kind: 'concentration' })).toBe(false);
    expect(strifeDisadvantage(4, { kind: 'attack', ability: 'cha' })).toBe(true);
    expect(strifeDisadvantage(4, { kind: 'save', ability: 'int' })).toBe(true);
    expect(strifeDisadvantage(4, { kind: 'attack', ability: 'dex' })).toBe(false);
    expect(strifeDisadvantage(4, { kind: 'save', ability: 'con' })).toBe(false);
  });

  it('requires explicit campaign opt-in', () => {
    expect(strifeRollMode(false, 7, { kind: 'check', ability: 'int' })).toBe('normal');
    expect(strifeRollMode(true, 1, { kind: 'check', ability: 'int' })).toBe('disadvantage');
  });

  it('combines A5E disadvantage with an existing advantage without stacking dice modes', () => {
    expect(combineRollModes('advantage', 'disadvantage')).toBe('normal');
    expect(combineRollModes('disadvantage', 'disadvantage')).toBe('disadvantage');
    expect(combineRollModes('normal', 'disadvantage')).toBe('disadvantage');
  });

  it('applies direct short- and long-term mental stress modifiers to supported checks and initiative', () => {
    expect(mentalStressRollMode({ kind: 'short', id: 'musical', untilSec: 100 }, { kind: 'check', ability: 'cha', skill: 'performance' })).toBe('advantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'musical', untilSec: 100 }, { kind: 'check', ability: 'dex', skill: 'stealth' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'enraged', untilSec: 100 }, { kind: 'check', ability: 'str' })).toBe('advantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'enraged', untilSec: 100 }, { kind: 'check', ability: 'int' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'flippant', untilSec: 100 }, { kind: 'save', ability: 'str' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'flippant', untilSec: 100 }, { kind: 'save', ability: 'wis' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'flippant', untilSec: 100 }, { kind: 'check', ability: 'dex' })).toBe('advantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'flippant', untilSec: 100 }, { kind: 'check', ability: 'wis' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'short', id: 'on-edge', untilSec: 100 }, { kind: 'initiative' })).toBe('advantage');
    expect(mentalStressRollMode({ kind: 'long', id: 'memory-wipe' }, { kind: 'check', ability: 'int', skill: 'history' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'long', id: 'covetous' }, { kind: 'save', ability: 'wis' })).toBe('disadvantage');
    expect(mentalStressRollMode({ kind: 'long', id: 'phobia' }, { kind: 'check', ability: 'wis', skill: 'perception' })).toBe('normal');
  });

  it('limits Suspicious Perception advantage to checks that detect hidden foes', () => {
    const effect = { kind: 'long' as const, id: 'suspicious' as const };
    expect(mentalStressRollMode(effect, { kind: 'check', ability: 'wis', skill: 'perception' })).toBe('normal');
    expect(mentalStressRollMode(effect, { kind: 'check', ability: 'wis', skill: 'perception', purpose: 'detect-hidden-foe' })).toBe('advantage');
    expect(mentalStressRollMode(effect, { kind: 'check', ability: 'dex', skill: 'sleight-of-hand' })).toBe('advantage');
    expect(mentalStressRollMode(effect, { kind: 'check', ability: 'wis', skill: 'insight' })).toBe('disadvantage');
  });

  it('grants Terrorized advantage on Strength, Dexterity, and Constitution checks only when escaping danger', () => {
    const effect = { kind: 'short' as const, id: 'terrorized' as const, untilSec: 100 };
    for (const ability of ['str', 'dex', 'con'] as const) {
      expect(mentalStressRollMode(effect, { kind: 'check', ability, purpose: 'escape-combat-or-danger' })).toBe('advantage');
      expect(mentalStressRollMode(effect, { kind: 'check', ability })).toBe('normal');
    }
    expect(mentalStressRollMode(effect, { kind: 'check', ability: 'wis', purpose: 'escape-combat-or-danger' })).toBe('normal');
  });
});
