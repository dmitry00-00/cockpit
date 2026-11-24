import { describe, expect, it } from 'vitest';
import { emptyState, type Actor, type CharacterSheet, type State } from '../engine/state';
import { projectPlayer } from './projection';
import { EventLog } from '../engine/log';

function fixture(): State {
  const state = emptyState();
  const sheet: CharacterSheet = {
    level: 5, raceId: 'celovek', classId: 'voin', subclassId: 'voin-master-boevyh-isskustv',
    abilities: { str: 15, dex: 16, con: 14, int: 10, wis: 12, cha: 8 }, proficiencyBonus: 3,
    skills: ['perception', 'survival'], expertise: [], features: [{ id: 'style', name: 'Боевой стиль: стрельба', level: 1 }],
    traits: [{ id: 'brave', name: 'Храбрый' }], feats: [{ id: 'alert', name: 'Наблюдательный', at: 4 }],
    attacks: [{ id: 'longbow', name: 'Длинный лук', toHit: 7, damage: '1d8+3', damageType: 'piercing', proficient: true, range: '150/600 футов' }],
    equipment: [{ id: 'longbow', qty: 1 }, { id: 'arrow', qty: 20 }],
    spellcasting: { ability: 'wis', saveDc: 14, attack: 6, kind: 'prepared' as const, maxLevel: 1, cantrips: ['druidcraft'], spells: ['hunters-mark'], always: [] },
  };
  const bo: Actor = {
    id: 'bo', name: 'Bo Tambernack', kind: 'pc', hp: { current: 41, max: 49, temp: 0 }, ac: 16, passivePerception: 14,
    conditions: {}, sheet,
  };
  const korrin: Actor = {
    id: 'korrin', name: 'Korrin Battlehammer', kind: 'pc', hp: { current: 49, max: 49, temp: 0 }, ac: 18, passivePerception: 14,
    conditions: {}, sheet: { ...sheet, features: [], attacks: [{ ...sheet.attacks![0]!, name: 'OTHER_HERO_ATTACK_SENTINEL' }] },
  };
  const monster: Actor = {
    id: 'captain', name: 'Bandit Captain', kind: 'monster', hp: { current: 45, max: 65, temp: 0 }, ac: 15, passivePerception: 12,
    conditions: {}, monsterId: 'bandit-captain',
  };
  state.actors = { bo, korrin, captain: monster };
  state.party = ['bo', 'korrin'];
  state.time = { sec: 100_000, tempo: 'hour' };
  return state;
}

describe('projectPlayer', () => {
  it('returns the assigned PC as an explicit allowlist and never serializes DM metadata or another PC sheet', () => {
    const state = fixture();
    const own = state.actors.bo!;
    const other = state.actors.korrin!;
    own.sheet!.homeland = 'place:secret-hidden-link';
    Object.assign(own, { dmMemo: 'DM_ONLY_ACTOR_SENTINEL', secretRelations: { target: 'Zhentarim' } });
    Object.assign(own.sheet!, { dmNote: 'DM_ONLY_SHEET_SENTINEL', privatePortraitUrl: '/private/secret.png' });
    own.sheet!.attacks = own.sheet!.attacks!.map((attack, index) => index === 0
      ? { ...attack, internal: 'DM_ONLY_ATTACK_SENTINEL' } as typeof attack : attack);
    other.sheet!.features = [{ id: 'private', name: 'OTHER_HERO_SHEET_SENTINEL', level: 1 }];
    state.facts['dm-sentinel'] = { id: 'dm-sentinel', text: 'DM_ONLY_FACT_SENTINEL', visibility: 'dm', subjectId: 'bo', threadIds: ['hidden-thread'] };
    Object.assign(state, { hiddenAudit: { cause: 'DM_ONLY_STATE_SENTINEL', href: '/hidden/secret-link' } });
    Object.assign(state.world, { privateThread: { label: 'DM_ONLY_WORLD_SENTINEL', href: '/private/hidden' } });
    state.world.kingdomOrder = { cormyr: { value: 2, source: 'DM_ONLY_KINGDOM_ORDER_SENTINEL' } };
    state.world.territoryControl = { 'front-town': { kingdomId: 'cormyr', kingdomName: 'DM_ONLY_TERRITORY_CONTROL_SENTINEL' } };
    state.world.processes = { 'war-l8-private': {
      id: 'war-l8-private', kind: 'war', name: 'DM_ONLY_WAR_NAME', scale: 'continent', stage: 'mobilization',
      parties: ['kingdom:luskan', 'kingdom:cormyr'], startedSec: 0, nextSec: 864_000, vars: {},
      data: {
        kind: 'war', version: 1, strengthEvidenceA: {
          kind: 'l8-candidate', factAccepted: false, usage: 'gm-selected-for-war',
          candidateId: 'DM_ONLY_L8_CANDIDATE_SENTINEL', sourceUrl: 'https://example.test/DM_ONLY_L8_LINK_SENTINEL',
          sourceWikitextSha256: 'DM_ONLY_L8_HASH_SENTINEL', sourceCitations: ['DM_ONLY_L8_CITATION_SENTINEL'],
        },
      },
    } };
    state.world.threads['private-front'] = {
      id: 'private-front', name: 'DM_ONLY_FRONT_SENTINEL', status: 'open', openedSec: 0, lastTouchedSec: 0,
      front: { source: 'dungeon-world-srd:fronts', type: 'campaign', stakes: ['DM_ONLY_STAKES_SENTINEL'], dangers: [{ id: 'danger', name: 'DM_ONLY_DANGER_SENTINEL', impulse: 'grow', impendingDoom: 'DM_ONLY_DOOM_SENTINEL', portents: [{ id: 'portent', text: 'DM_ONLY_PORTENT_SENTINEL', fulfilled: false }] }] },
    };
    state.actors['private-monster-marker'] = {
      ...state.actors.captain!, id: 'private-monster-marker', name: 'MONSTER_BLOCK_SENTINEL',
    };
    Object.assign(state.actors.captain!, { social: { attitude: 'hostile', giftAtSec: 86_400, giftMemo: 'DM_ONLY_GIFT_SENTINEL' } });

    const result = projectPlayer(state, 'bo', 27, Date.UTC(2026, 10, 3));
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ schemaVersion: 1, revision: 27, updatedAt: '2026-11-03T00:00:00.000Z' });
    expect(result!.hero.name).toBe('Bo Tambernack');
    expect(result!.hero.className).toBeTruthy();
    expect(result!.hero.level).toBe(5);
    expect(result!.hero.hp).toEqual({ current: 41, maximum: 49, temporary: 0 });
    expect(result!.hero.armorClass).toBe(16);
    expect(result!.hero.abilities).toHaveLength(6);
    expect(result!.hero.skills.length).toBeGreaterThan(0);
    expect(result!.hero.attacks.length).toBeGreaterThan(0);
    expect(result!.hero.resources).toBeDefined();
    expect(result!.party.map(member => member.name)).toContain('Korrin Battlehammer');
    expect(result!.worldTime.date).toBeTruthy();
    expect(result!.worldTime.time).toMatch(/^\d{2}:\d{2}$/);

    expect(Object.keys(result!)).toEqual(['schemaVersion', 'revision', 'updatedAt', 'hero', 'party', 'worldTime', 'encounter', 'updates']);
    expect(Object.keys(result!.hero)).toEqual([
      'name', 'ancestry', 'className', 'subclassName', 'level', 'hp', 'armorClass', 'abilities', 'skills', 'attacks',
      'resources', 'conditions', 'equipment', 'features', 'spells',
    ]);
    expect(Object.keys(result!.hero.hp)).toEqual(['current', 'maximum', 'temporary']);
    expect(Object.keys(result!.party[0]!)).toEqual(['name', 'hp', 'conditions', 'currentTurn']);

    const serialized = JSON.stringify(result);
    for (const sentinel of [
      'DM_ONLY_ACTOR_SENTINEL', 'DM_ONLY_SHEET_SENTINEL', 'DM_ONLY_ATTACK_SENTINEL', 'OTHER_HERO_SHEET_SENTINEL', 'OTHER_HERO_ATTACK_SENTINEL',
      'DM_ONLY_FACT_SENTINEL', 'DM_ONLY_STATE_SENTINEL', 'DM_ONLY_WORLD_SENTINEL', 'MONSTER_BLOCK_SENTINEL',
      'DM_ONLY_GIFT_SENTINEL',
      'DM_ONLY_KINGDOM_ORDER_SENTINEL', 'DM_ONLY_TERRITORY_CONTROL_SENTINEL',
      'DM_ONLY_WAR_NAME', 'DM_ONLY_L8_CANDIDATE_SENTINEL', 'DM_ONLY_L8_LINK_SENTINEL', 'DM_ONLY_L8_HASH_SENTINEL', 'DM_ONLY_L8_CITATION_SENTINEL',
      'secret-hidden-link', 'secret.png', 'private/hidden', 'Zhentarim',
      'DM_ONLY_FRONT_SENTINEL', 'DM_ONLY_STAKES_SENTINEL', 'DM_ONLY_DANGER_SENTINEL', 'DM_ONLY_DOOM_SENTINEL', 'DM_ONLY_PORTENT_SENTINEL',
    ]) expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain('"id":"bo"');
    expect(serialized).not.toContain('"id":"korrin"');
    expect(other.sheet!.features[0]!.name).toBe('OTHER_HERO_SHEET_SENTINEL');
  });

  it('hides private inventory and its derived armor and attack projections, while explicit player-visible gear is shared', () => {
    const state = fixture();
    const bo = state.actors.bo!;
    bo.sheet!.armor = 'leather';
    bo.sheet!.equipment = [{ id: 'leather-armor', qty: 1 }];
    bo.ac = 16;
    const stack = { id: 'hidden-armor', itemId: 'leather-armor', qty: 1, owner: { kind: 'actor' as const, id: 'bo' }, storage: { kind: 'actor' as const, id: 'bo' }, wornAs: 'armor' as const, visibility: 'dm' as const };
    state.inventory = { [stack.id]: stack };
    const hidden = projectPlayer(state, 'bo')!;
    expect(JSON.stringify(hidden)).not.toContain('Leather Armor');
    expect(hidden.hero.equipment).toEqual([]);
    expect(hidden.hero.armorClass).toBe(13);

    state.inventory[stack.id] = { ...stack, visibility: 'players' };
    const visible = projectPlayer(state, 'bo')!;
    expect(visible.hero.equipment).toEqual([{ name: 'Leather Armor', quantity: 1 }]);
    // The canonical leather armor projection is 11 + DEX (3), regardless of the stale stored AC snapshot.
    expect(visible.hero.armorClass).toBe(14);
  });

  it('projects player-visible rumors only at the party location and omits fact IDs and route metadata', () => {
    const state = fixture();
    state.world.locations.city = { id: 'city', name: 'Neverwinter', scale: 'settlement' };
    state.world.locations.gate = { id: 'gate', name: 'Южные ворота', scale: 'building', parentId: 'city' };
    state.world.locations.other = { id: 'other', name: 'Luskan', scale: 'settlement' };
    state.actors.bo!.locationId = 'city';
    state.actors.korrin!.locationId = 'city';
    state.facts['rumor-local-secret-id'] = { id: 'rumor-local-secret-id', text: 'У южных ворот видели незнакомцев', visibility: 'players', category: 'rumor', subjectId: 'city' };
    state.facts['rumor-local-child'] = { id: 'rumor-local-child', text: 'У ворот звенят колокола', visibility: 'players', category: 'rumor', subjectId: 'gate' };
    state.facts['rumor-dm'] = { id: 'rumor-dm', text: 'DM_ONLY_RUMOR_SENTINEL', visibility: 'dm', category: 'rumor', subjectId: 'city' };
    state.facts['rumor-other'] = { id: 'rumor-other', text: 'Вдали слышали гром', visibility: 'players', category: 'rumor', subjectId: 'other' };

    const projected = projectPlayer(state, 'bo')!;
    expect(projected.rumors).toEqual([
      { text: 'У ворот звенят колокола', location: 'Южные ворота' },
      { text: 'У южных ворот видели незнакомцев', location: 'Neverwinter' },
    ]);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('rumor-local-secret-id');
    expect(serialized).not.toContain('DM_ONLY_RUMOR_SENTINEL');
    expect(serialized).not.toContain('Вдали слышали гром');
  });

  it('projects only the latest public journal summaries and strips event links and private transaction data', () => {
    const state = fixture();
    state.actors.merchant = { id: 'merchant', name: 'PRIVATE_MERCHANT_NAME', kind: 'npc', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    const log = new EventLog(state, [], { clock: { now: () => 100 }, ids: { next: (() => { let i = 0; return () => `public-${++i}`; })() } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'public-sword', itemId: 'longsword', qty: 1, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' }, visibility: 'players' } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'public-payment', itemId: 'coin:gp', qty: 1, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } } } });
    log.dispatch({ type: 'NOTE_ADDED', payload: { text: 'PRIVATE_MASTER_NOTE_SENTINEL', threadIds: [], scale: 'settlement' } });
    log.dispatch({ type: 'NOTE_ADDED', payload: { text: 'PUBLIC_NOTE_SENTINEL', threadIds: [], scale: 'settlement', visible: true } });
    log.dispatch({ type: 'TRADE_COMPLETED', payload: {
      seller: { kind: 'actor', id: 'merchant' }, buyer: { kind: 'actor', id: 'bo' }, itemStackId: 'public-sword', itemQty: 1,
      payments: [{ stackId: 'public-payment', qty: 1 }], priceCopper: 100,
      priceSource: { kind: 'house-rule', citation: 'PRIVATE_PRICE_CITATION' }, playerVisible: true,
    } }, { interactionId: 'PRIVATE_INTERACTION_LINK' });

    const projection = projectPlayer(log.state, 'bo', 1, Date.UTC(2026, 10, 7), log.entries)!;
    const updates = projection.updates ?? [];
    expect(updates.map(update => update.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('PUBLIC_NOTE_SENTINEL'),
      'Партия купила 1 × Longsword у торговца за 100 мм',
    ]));
    const json = JSON.stringify(projection);
    for (const sentinel of ['PRIVATE_MASTER_NOTE_SENTINEL', 'PRIVATE_MERCHANT_NAME', 'PRIVATE_PRICE_CITATION', 'PRIVATE_INTERACTION_LINK', 'public-sword']) {
      expect(json).not.toContain(sentinel);
    }
    expect(updates.every(update => Object.keys(update).join(',') === 'id,at,worldSec,text')).toBe(true);
  });

  it('does not project a monster, missing actor, or PC without a sheet', () => {
    const state = fixture();
    expect(projectPlayer(state, 'captain')).toBeNull();
    expect(projectPlayer(state, 'missing')).toBeNull();
    state.actors.bo!.sheet = undefined;
    expect(projectPlayer(state, 'bo')).toBeNull();
  });

  it('rejects an assigned PC after it is removed or leaves the party', () => {
    const removed = fixture();
    removed.actors.bo!.removed = true;
    expect(projectPlayer(removed, 'bo')).toBeNull();

    const notInParty = fixture();
    notInParty.party = ['korrin'];
    expect(projectPlayer(notInParty, 'bo')).toBeNull();
  });

  it('requires a non-negative safe integer revision', () => {
    const state = fixture();
    expect(() => projectPlayer(state, 'bo', -1)).toThrow('revision must be a non-negative safe integer');
    expect(() => projectPlayer(state, 'bo', 1.5)).toThrow('revision must be a non-negative safe integer');
  });
});
