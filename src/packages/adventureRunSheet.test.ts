import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAdventureBundle } from './adventure';
import { adventureSceneRunSheet } from './adventureRunSheet';

const bundle = parseAdventureBundle(JSON.parse(readFileSync(`${process.cwd()}/research/content-phandelver/first-vertical.json`, 'utf8')));

describe('adventure scene run sheet', () => {
  it('connects the prisoner scene through its hideout plan, participants and disclosed clues', () => {
    const sheet = adventureSceneRunSheet(bundle, 'prisoner')!;
    expect(sheet.places.map(node => node.id)).toContain('cragmaw-hideout');
    expect(sheet.plans.map(node => node.id)).toContain('hideout-plan');
    expect(sheet.participants.map(node => node.id)).toEqual(['yeemik', 'sildar']);
    expect(sheet.facts.map(node => node.id)).toEqual(['sildar-prison', 'gundren-map', 'mine']);
    expect(sheet.proposals.map(node => node.id)).toContain('rescue-resolution');
  });

  it('joins Klarg’s source-linked treasure with the later shop return and outcome marker', () => {
    const klarg = adventureSceneRunSheet(bundle, 'klarg-cave')!;
    expect(klarg.items.map(node => node.id)).toEqual(['klarg-treasure-cache', 'lionshield-stolen-goods']);
    expect(klarg.facts.map(node => node.id)).toContain('stolen-goods');

    const returnScene = adventureSceneRunSheet(bundle, 'lionshield-return')!;
    expect(returnScene.plans.map(node => node.id)).toContain('town-plan');
    expect(returnScene.items.map(node => node.id)).toContain('lionshield-stolen-goods');
    expect(returnScene.proposals.map(node => node.id)).toEqual(['lionshield-return-resolution']);
  });

  it('returns no gameplay sheet for a non-scene or an unknown node', () => {
    expect(adventureSceneRunSheet(bundle, 'neverwinter')).toBeUndefined();
    expect(adventureSceneRunSheet(bundle, 'missing-scene')).toBeUndefined();
  });
});
