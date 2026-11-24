import { describe, expect, it } from 'vitest';
import { emptyState, type Actor } from '../engine/state';
import type { Deity } from '../cosmos/deities';
import type { Organization } from '../world/organizations';
import type { Resident } from '../world/people';
import type { Kingdom, KingdomHistoryLine } from '../world/kingdoms';
import deitiesJson from '../../content/cosmos/deities.json';
import organizationsJson from '../../content/world/organizations.json';
import orgMembersJson from '../../content/world/org-members.json';
import kingdomsJson from '../../content/world/kingdoms.json';
import torilCardsJson from '../../content/maps/toril-cards.json';
import { characterSubjectEnvelope, citySubjectEnvelope, deitySubjectEnvelope, gazetteerPlaceSubjectEnvelope, kingdomSubjectEnvelope, organizationSubjectEnvelope, partySubjectEnvelope } from './subjectAdapters';
import type { GazetteerPlace } from '../map/gazetteer';
import { validateSubjectEnvelope } from './subjectContract';
import { seedLog, seedState } from '../campaign/seed';
import { EventLog } from '../engine/log';
import { parseLog, serializeLog } from '../engine/persist';
import type { EntityRef } from './ref';

function actor(id: string, locationId?: string): Actor {
  return {
    id, name: id, kind: 'pc', hp: { current: 8, max: 8, temp: 0 }, ac: 14, passivePerception: 12,
    conditions: {}, ...(locationId ? { locationId } : {}),
  };
}

describe('party subject adapter', () => {
  it('projects active members and shared supply without mutating campaign state', () => {
    const state = emptyState();
    state.actors.bo = actor('bo', 'waterdeep');
    state.actors.korrin = actor('korrin', 'waterdeep');
    state.actors.gone = { ...actor('gone'), removed: true };
    state.party = ['bo', 'korrin', 'gone'];
    state.supply = 3;
    state.world.locations.waterdeep = { id: 'waterdeep', name: 'Waterdeep', scale: 'settlement', revealed: true };
    const before = structuredClone(state);

    const envelope = partySubjectEnvelope(state, 'dm');
    expect(envelope.slots.core).toMatchObject({ status: 'present', values: { memberCount: { value: 2 } } });
    expect(envelope.slots.resources).toMatchObject({ status: 'present', values: [{ current: 3, unit: 'Supply' }] });
    expect(envelope.slots.composition.status).toBe('present');
    if (envelope.slots.composition.status === 'present') expect(envelope.slots.composition.values[0]).toMatchObject({ relation: 'party-member', target: { value: 'actor:bo' }, order: 0 });
    expect(envelope.slots.position).toMatchObject({ status: 'present', values: [{ place: { value: 'location:waterdeep' } }] });
    expect(validateSubjectEnvelope(envelope)).toEqual([]);
    expect(state).toEqual(before);
  });

  it('counts each active party actor once in core count and composition', () => {
    const state = emptyState();
    state.actors.bo = actor('bo');
    state.actors.korrin = actor('korrin');
    state.party = ['bo', 'bo', 'korrin', 'missing'];

    const envelope = partySubjectEnvelope(state, 'dm');

    expect(envelope.slots.core).toMatchObject({ status: 'present', values: { memberCount: { value: 2 } } });
    expect(envelope.slots.composition.status).toBe('present');
    if (envelope.slots.composition.status === 'present') {
      expect(envelope.slots.composition.values.map(member => member.target.value)).toEqual(['actor:bo', 'actor:korrin']);
    }
  });

  it('omits unrevealed shared location from player data before rendering', () => {
    const state = emptyState();
    state.actors.bo = actor('bo', 'hidden-place');
    state.party = ['bo'];
    state.world.locations['hidden-place'] = { id: 'hidden-place', name: 'Secret Camp', scale: 'settlement', revealed: false };

    const players = partySubjectEnvelope(state, 'players');
    expect(players.slots.position.status).toBe('empty');
    expect(JSON.stringify(players)).not.toContain('Secret Camp');
    expect('secrets' in players.slots).toBe(false);
    expect(validateSubjectEnvelope(players)).toEqual([]);
  });

  it('does not select one location when active members are split or lack location data', () => {
    const state = emptyState();
    state.actors.bo = actor('bo', 'waterdeep');
    state.actors.lyra = actor('lyra', 'neverwinter');
    state.party = ['bo', 'lyra'];
    state.world.locations.waterdeep = { id: 'waterdeep', name: 'Waterdeep', scale: 'settlement' };
    state.world.locations.neverwinter = { id: 'neverwinter', name: 'Neverwinter', scale: 'settlement' };

    const envelope = partySubjectEnvelope(state, 'dm');
    expect(envelope.slots.position.status).toBe('empty');
    expect(JSON.stringify(envelope)).not.toContain('Waterdeep');
    expect(JSON.stringify(envelope)).not.toContain('Neverwinter');
  });
});

describe('character and city subject adapters', () => {
  it('keeps monster numbers out of player data and refuses non-party player subjects', () => {
    const state = emptyState();
    state.actors.wolf = { ...actor('wolf'), kind: 'monster', ac: 13, hp: { current: 5, max: 11, temp: 0 } };
    const playerProjection = characterSubjectEnvelope(state, 'wolf', 'players');
    expect(playerProjection).toBeNull();

    const dmProjection = characterSubjectEnvelope(state, 'wolf', 'dm');
    expect(dmProjection?.slots.indicators).toMatchObject({ status: 'present', values: { hp: { current: 5 }, ac: { value: 13 } } });
    expect(validateSubjectEnvelope(dmProjection)).toEqual([]);
  });

  it('projects a PC without DM-only facts and validates both audiences', () => {
    const state = emptyState();
    state.actors.bo = actor('bo');
    state.party = ['bo'];
    state.facts.secret = { id: 'secret', text: 'secret note', visibility: 'dm', subjectId: 'actor:bo' };
    state.facts.public = { id: 'public', text: 'known note', visibility: 'players', subjectId: 'actor:bo' };

    const players = characterSubjectEnvelope(state, 'bo', 'players');
    const dm = characterSubjectEnvelope(state, 'bo', 'dm');
    expect(players).not.toBeNull();
    expect(JSON.stringify(players)).not.toContain('secret note');
    expect(JSON.stringify(players)).toContain('known note');
    expect(JSON.stringify(dm)).toContain('secret note');
    expect(dm?.slots.knowledge.status).toBe('present');
    if (dm?.slots.knowledge.status === 'present') {
      expect(dm.slots.knowledge.values.every(fact => fact.audience === 'players')).toBe(true);
    }
    expect(dm?.slots.secrets.status).toBe('present');
    if (dm?.slots.secrets.status === 'present') expect(dm.slots.secrets.values.map(fact => fact.value.value)).toContain('secret note');
    expect(validateSubjectEnvelope(players)).toEqual([]);
    expect(validateSubjectEnvelope(dm)).toEqual([]);
    expect(characterSubjectEnvelope(state, 'bo', 'players')?.subjectId).toBe('actor:bo');
  });

  it('projects current character resources from the shared sheet/state derivation with provenance', () => {
    const state = seedState();
    state.actors.bo = { ...state.actors.bo, resourcesSpent: { 'slot-1': 3 } };
    const players = characterSubjectEnvelope(state, 'bo', 'players');
    expect(players?.slots.resources.status).toBe('present');
    if (players?.slots.resources.status === 'present') {
      expect(players.slots.resources.values.find(resource => resource.id === 'slot-1')).toMatchObject({
        current: 1, maximum: 4, unit: 'ячейка', provenance: { layer: 'derived' },
      });
    }
    expect(validateSubjectEnvelope(players)).toEqual([]);
  });

  it('omits unrevealed locations before building a player envelope', () => {
    const state = emptyState();
    state.world.locations.hidden = { id: 'hidden', name: 'Secret Camp', scale: 'settlement', revealed: false };
    expect(citySubjectEnvelope(state, 'hidden', 'players')).toBeNull();
    expect(JSON.stringify(citySubjectEnvelope(state, 'hidden', 'dm'))).toContain('Secret Camp');
  });

  it('projects only recorded city fields with provenance', () => {
    const state = emptyState();
    state.world.locations.waterdeep = {
      id: 'waterdeep', name: 'Waterdeep', scale: 'settlement', revealed: true,
      population: 132, danger: 'low', pricePercent: 5, ref: 'place:waterdeep', geo: { map: 'toril', x: 12, y: 34, r: 2 },
    };
    state.world.locations.north = { id: 'north', name: 'North Ward', scale: 'settlement', parentId: 'waterdeep', revealed: true };
    const projection = citySubjectEnvelope(state, 'waterdeep', 'players');
    expect(projection?.slots.core).toMatchObject({ status: 'present', values: { name: 'Waterdeep', scale: 'settlement' } });
    expect(projection?.slots.indicators).toMatchObject({ status: 'present', values: { danger: { value: 'low' }, marketIndex: { value: 5, unit: '%' } } });
    expect(projection?.slots.characteristics).toMatchObject({ status: 'present', values: { population: { value: 132, unit: 'людей' } } });
    expect(projection?.slots.position.status).toBe('present');
    if (projection?.slots.position.status === 'present') {
      expect(projection.slots.position.values).toEqual(expect.arrayContaining([{ kind: 'map-point', mapId: 'toril', x: 12, y: 34, radius: 2, provenance: { layer: 'event-state', sourceId: 'state.world.locations.waterdeep.geo' }, visibility: 'players' }]));
    }
    expect(projection?.slots.composition).toMatchObject({ status: 'present', values: [{ relation: 'child-place', target: { value: 'location:north' } }] });
    expect(validateSubjectEnvelope(projection)).toEqual([]);
  });

  it('projects a static gazetteer place for the DM with explicit map scale and source provenance', () => {
    const place = (torilCardsJson as unknown as { places: GazetteerPlace[] }).places.find(row => row.name === 'Abreon')!;
    const projection = gazetteerPlaceSubjectEnvelope(emptyState(), place, 'toril', 'settlement', 'dm', {
      faith: { deities: ['lliira'], text: 'Lliira' }, deityNames: { lliira: 'Lliira' },
      organizations: [{ id: 'harpers', name: 'Harpers' }],
      residents: [['sample-npc', 'Sample NPC', null, null]],
    });
    expect(projection?.subjectId).toBe(`place:${place.id}`);
    expect(projection?.slots.core).toMatchObject({ status: 'present', values: { name: 'Abreon', scale: 'settlement' } });
    expect(projection?.slots.indicators).toMatchObject({ status: 'present', values: { danger: { value: place.card?.danger } } });
    expect(projection?.slots.characteristics).toMatchObject({ status: 'present', values: { type: { value: 'Town', provenance: { layer: 'reference' } } } });
    expect(projection?.slots.position).toMatchObject({ status: 'present', values: [{ kind: 'map-point', mapId: 'toril', x: place.x, y: place.y, visibility: 'dm' }] });
    expect(projection?.slots.characteristics).toMatchObject({ values: { faith: { value: 'Lliira', provenance: { sourceId: `content/world/place-faiths.json#${place.id}` } } } });
    expect(projection?.slots.relations).toMatchObject({ status: 'present', values: [{ kind: 'religion', target: { value: 'deity:lliira', label: 'Lliira' } }] });
    expect(projection?.slots.composition).toMatchObject({ status: 'present', values: [
      { relation: 'organization', target: { value: 'organization:harpers' } },
      { relation: 'resident', target: { value: 'person:sample-npc' } },
    ] });
    expect(JSON.stringify(projection)).toContain('CC BY-SA 3.0');
    expect(projection?.slots.knowledge.status).toBe('empty');
    expect(projection?.slots.secrets).toMatchObject({ status: 'present' });
    expect(JSON.stringify(projection?.slots.secrets)).toContain(place.card?.summary);
    expect(JSON.stringify(projection)).toContain('https://forgottenrealms.fandom.com/wiki/Abreon');
    expect(validateSubjectEnvelope(projection)).toEqual([]);
  });

  it('keeps a canonical gazetteer place out of player data until learned, then projects only learned facts', () => {
    const place = (torilCardsJson as unknown as { places: GazetteerPlace[] }).places.find(row => row.name === 'Abreon')!;
    const state = emptyState();
    expect(gazetteerPlaceSubjectEnvelope(state, place, 'toril', 'settlement', 'players')).toBeNull();
    state.knowledge = {};
    state.knowledge[`place:${place.id}`] = { ref: `place:${place.id}`, name: 'Abbor', facts: [{ label: 'Расположение', value: 'В Tethyr', sec: 10 }] };
    const projection = gazetteerPlaceSubjectEnvelope(state, place, 'toril', 'settlement', 'players', {
      faith: { deities: ['lliira'], text: 'Lliira' }, deityNames: { lliira: 'Lliira' },
      organizations: [{ id: 'harpers', name: 'Harpers' }], residents: [['sample-npc', 'Sample NPC', null, null]],
    });
    expect(projection?.slots.knowledge).toMatchObject({ status: 'present', values: [{ label: 'Расположение', value: { value: 'В Tethyr' } }] });
    expect(JSON.stringify(projection)).not.toContain(place.card?.summary);
    expect(JSON.stringify(projection)).not.toContain('CC BY-SA 3.0');
    expect(JSON.stringify(projection)).not.toContain('Harpers');
    expect(JSON.stringify(projection)).not.toContain('Lliira');
    expect(JSON.stringify(projection)).not.toContain('Sample NPC');
    expect(projection?.slots.position.status).toBe('empty');
    expect(validateSubjectEnvelope(projection)).toEqual([]);
  });
});

describe('reference subject adapters', () => {
  it('keeps unknown deity facts out of player projections and selects DM facts by era', () => {
    const state = emptyState();
    const deity = (deitiesJson as unknown as { deities: Deity[] }).deities.find(row => row.id === 'selune')!;
    expect(deitySubjectEnvelope(state, deity, '5e', 'players')).toBeNull();
    state.knowledge = {};
    state.knowledge!['deity:selune'] = { ref: 'deity:selune', name: deity.name, facts: [{ label: 'Portfolio', value: 'Moon', sec: 4 }] };
    const players = deitySubjectEnvelope(state, deity, '5e', 'players');
    const dm = deitySubjectEnvelope(state, deity, '5e', 'dm');
    const canonPortfolio = deity.fields.portfolio?.['5eR']?.t ?? deity.fields.portfolio?.['5e']?.t;
    expect(canonPortfolio).toBeTruthy();
    expect(JSON.stringify(players)).not.toContain(canonPortfolio);
    expect(JSON.stringify(players)).toContain('Moon');
    expect(players?.slots.composition.status).toBe('empty');
    expect(players?.slots.relations.status).toBe('empty');
    expect(players?.slots.capabilities.status).toBe('empty');
    expect(JSON.stringify(players)).not.toContain('faerunian-pantheon');
    expect(JSON.stringify(dm)).toContain(canonPortfolio);
    expect(dm?.slots.indicators).toMatchObject({ status: 'present', values: { powerRank: { value: 'Deity' } } });
    expect(dm?.slots.capabilities).toMatchObject({ status: 'present', values: {
      worshippers: { value: deity.fields.worshipers?.['5eR']?.t ?? deity.fields.worshipers?.['5e']?.t },
      holyDays: { value: deity.fields.holydays?.['2e']?.t, provenance: { sourceId: 'content/cosmos/deities.json#selune.holydays.2e' } },
    } });
    expect(dm?.slots.composition.status).toBe('present');
    if (dm?.slots.composition.status === 'present') {
      expect(dm.slots.composition.values.map(member => member.target.value)).toContain('pantheon:faerunian-pantheon');
    }
    expect(dm?.slots.relations.status).toBe('present');
    if (dm?.slots.relations.status === 'present') {
      expect(dm.slots.relations.values.map(relation => relation.target.value)).toContain('deity:sehanine-moonbow');
    }
    expect(dm?.slots.position).toMatchObject({ status: 'present', values: [{ kind: 'plane', plane: { value: 'plane:ysgard' }, field: 'homeplane', edition: '5eR' }] });
    expect(dm?.slots.characteristics).toMatchObject({ status: 'present', values: { alignment: { value: 'Chaotic good' } } });
    const playersAtOlderEra = deitySubjectEnvelope(state, deity, '3e', 'players');
    const dmAtOlderEra = deitySubjectEnvelope(state, deity, '3e', 'dm');
    expect(playersAtOlderEra?.slots.relations.status).toBe('empty');
    expect(JSON.stringify(playersAtOlderEra)).not.toContain('deity:sune');
    expect(JSON.stringify(dmAtOlderEra)).toContain('deity:sune');
    expect(validateSubjectEnvelope(players)).toEqual([]);
    expect(validateSubjectEnvelope(dm)).toEqual([]);
    expect(validateSubjectEnvelope(playersAtOlderEra)).toEqual([]);
    expect(validateSubjectEnvelope(dmAtOlderEra)).toEqual([]);
  });

  it('requires learned organization knowledge for players and keeps campaign metrics DM-only', () => {
    const state = emptyState();
    const organization = (organizationsJson as unknown as { organizations: Organization[] }).organizations.find(row => row.id === 'harpers')!;
    state.world.factions.harpers = { id: 'harpers', name: 'Harpers campaign', renown: 4, standing: 2, goal: 'secret campaign goal', ref: 'organization:harpers' };
    expect(organizationSubjectEnvelope(state, organization, 'players')).toBeNull();
    state.knowledge = {};
    state.knowledge!['organization:harpers'] = { ref: 'organization:harpers', name: 'Harpers', facts: [{ label: 'Known', value: 'A network', sec: 1 }] };
    const members = (orgMembersJson as unknown as { orgs: Record<string, Resident[]> }).orgs.harpers;
    const memberCitation = (orgMembersJson as unknown as { sources: Record<string, { title: string; url: string; license: string }> }).sources.harpers;
    expect(memberCitation).toMatchObject({
      title: 'Category:Members of the Harpers',
      url: 'https://forgottenrealms.fandom.com/wiki/Category:Members_of_the_Harpers',
      license: 'CC BY-SA 3.0',
    });
    const players = organizationSubjectEnvelope(state, organization, 'players', members);
    const dm = organizationSubjectEnvelope(state, organization, 'dm', members, memberCitation);
    const duplicateMemberInput = [...members.slice(0, 1), ...members.slice(0, 1), ...members.slice(1)];
    const dedupedDm = organizationSubjectEnvelope(state, organization, 'dm', duplicateMemberInput, memberCitation);
    expect(JSON.stringify(players)).not.toContain('Harpers campaign');
    expect(JSON.stringify(players)).not.toContain(organization.allies?.[0] ?? 'no-allies');
    expect(JSON.stringify(players)).not.toContain('secret campaign goal');
    expect(JSON.stringify(players)).not.toContain(members[0][0]);
    expect(dm?.slots.indicators).toMatchObject({ status: 'present', values: { renown: { value: 4 }, standing: { value: 2 } } });
    expect(dm?.slots.position.status).toBe('present');
    if (dm?.slots.position.status === 'present') expect(dm.slots.position.values.some(position => position.kind === 'linked-place' && position.role === 'associated')).toBe(true);
    expect(dm?.slots.composition.status).toBe('present');
    if (dm?.slots.composition.status === 'present') expect(dm.slots.composition.values[0]).toMatchObject({
      relation: 'organization-membership', certainty: 'category-ever-member',
      target: { provenance: { citation: memberCitation } }, provenance: { citation: memberCitation },
    });
    if (dedupedDm?.slots.composition.status === 'present') {
      expect(dedupedDm.slots.composition.values.some(item => item.target.value === `person:${members[0][0]}`)).toBe(true);
      expect(dedupedDm.slots.composition.values).toHaveLength(new Set(members.map(([id]) => id)).size);
    } else expect(dedupedDm?.slots.composition.status).toBe('present');
    expect(validateSubjectEnvelope(players)).toEqual([]);
    expect(validateSubjectEnvelope(dm)).toEqual([]);
  });

  it('projects additional source-backed organization facts and linked deities for the DM', () => {
    const state = emptyState();
    const organization = (organizationsJson as unknown as { organizations: Organization[] }).organizations.find(row => row.id === 'adarbrent')!;
    const dm = organizationSubjectEnvelope(state, organization, 'dm');
    expect(dm?.slots.characteristics).toMatchObject({ status: 'present', values: {
      symbol: { value: organization.symbol }, members: { value: organization.members },
    } });
    expect(dm?.slots.relations.status).toBe('present');
    if (dm?.slots.relations.status === 'present') {
      expect(dm.slots.relations.values.map(relation => relation.target.value)).toContain('deity:valkur');
      expect(dm.slots.relations.values.find(relation => relation.kind === 'dedicated-to')?.provenance.citation)
        .toMatchObject({ license: 'CC BY-SA 3.0', url: expect.stringContaining('forgottenrealms.fandom.com') });
      expect(dm.slots.relations.values.find(relation => relation.kind === 'ally')?.target.provenance.citation)
        .toMatchObject({ title: organization.name, license: 'CC BY-SA 3.0' });
    }
    expect(dm?.slots.characteristics).toMatchObject({ status: 'present', values: {
      leaders: [{ provenance: { citation: { title: organization.name, license: 'CC BY-SA 3.0' } } }],
      leaderNames: [{ value: organization.leaders?.[0].t, provenance: { citation: { title: organization.name, license: 'CC BY-SA 3.0' } } }],
    } });
    expect(organizationSubjectEnvelope(state, organization, 'players')).toBeNull();
    expect(validateSubjectEnvelope(dm)).toEqual([]);
  });

  it('links kingdom rulers only when the source has an explicit person reference', () => {
    const state = emptyState();
    const kingdom = (kingdomsJson as unknown as { kingdoms: Kingdom[] }).kingdoms.find(row => row.id === 'cormyr')!;
    const historyLines: KingdomHistoryLine[] = [{
      id: 'a-history-regency', year: 1260, to: 1261, text: 'The War of the Regency.',
      sourceTitle: 'War of the Regency · Regency period',
      sourceUrl: 'https://forgottenrealms.fandom.com/wiki/War_of_the_Regency',
      cites: ['The Grand History of the Realms, с. 77'],
    }, {
      id: 'y1261-2', year: 1261, text: 'Azoun III assumes the throne of Cormyr.',
      sourceTitle: '1261 DR', sourceUrl: 'https://forgottenrealms.fandom.com/wiki/1261_DR',
      cites: ['The Grand History of the Realms, с. 77'],
    }];
    expect(kingdomSubjectEnvelope(state, kingdom, 'players', 1492)).toBeNull();
    state.knowledge = {};
    state.knowledge!['kingdom:cormyr'] = { ref: 'kingdom:cormyr', name: 'Cormyr', facts: [{ label: 'Capital', value: 'Suzail', sec: 0 }] };
    const players = kingdomSubjectEnvelope(state, kingdom, 'players', 1492, historyLines);
    const dm = kingdomSubjectEnvelope(state, kingdom, 'dm', 1492, historyLines);
    const duplicateKingdom: Kingdom = {
      ...kingdom,
      places: [...(kingdom.places ?? []), ...(kingdom.places ?? []).slice(0, 1)],
      orgs: [...(kingdom.orgs ?? []), ...(kingdom.orgs ?? []).slice(0, 1)],
      within: [...(kingdom.within ?? []), ...(kingdom.within ?? []).slice(0, 1)],
    };
    const duplicateDm = kingdomSubjectEnvelope(state, duplicateKingdom, 'dm', 1492, historyLines, {
      placeNames: Object.fromEntries((kingdom.places ?? []).map(id => [id, id])),
    });
    expect(JSON.stringify(players)).not.toContain('Raedra Obarskyr');
    expect(dm?.slots.core).toMatchObject({ status: 'present', values: { referenceRef: { value: 'kingdom:cormyr' } } });
    expect(dm?.slots.characteristics).toMatchObject({ status: 'present', values: { capital: { value: `place:${kingdom.capitalPlace}` }, rulers: [{ value: 'person:raedra-obarskyr' }] } });
    expect(dm?.slots.characteristics).toMatchObject({ values: {
      populationText: { value: kingdom.population, provenance: { citation: { license: 'CC BY-SA 3.0', url: expect.stringContaining('forgottenrealms.fandom.com') } } },
      currency: { value: kingdom.currency }, rulerNames: [{ value: expect.stringContaining('Raedra Obarskyr') }],
    } });
    expect(dm?.slots.composition.status).toBe('present');
    if (dm?.slots.composition.status === 'present') {
      expect(dm.slots.composition.values.map(item => item.target.value)).toEqual(expect.arrayContaining((kingdom.orgs ?? []).map(id => `organization:${id}`)));
    }
    expect(dm?.slots.position.status).toBe('present');
    if (dm?.slots.position.status === 'present') expect(dm.slots.position.values.some(position => position.kind === 'linked-place' && position.role === 'capital')).toBe(true);
    expect(dm?.slots.history.status).toBe('present');
    if (dm?.slots.history.status === 'present') {
      expect(dm.slots.history.values.map(entry => entry.text.value)).toContain('War of the Regency');
      expect(dm.slots.history.values.find(entry => entry.text.value === 'War of the Regency')?.at).toMatchObject({ kind: 'canonical-date', value: '1260–1261 DR' });
      const chronicleEntry = dm.slots.history.values.find(entry => entry.text.value === 'The War of the Regency.');
      expect(chronicleEntry?.at).toMatchObject({ kind: 'canonical-date', value: '1260–1261 DR' });
      expect(chronicleEntry?.text.provenance.citation).toMatchObject({
        title: 'War of the Regency · Regency period',
        url: 'https://forgottenrealms.fandom.com/wiki/War_of_the_Regency',
        license: 'CC BY-SA 3.0',
      });
      expect(chronicleEntry?.text.provenance.citations).toEqual([
        { title: 'The Grand History of the Realms, с. 77', license: 'CC BY-SA 3.0' },
      ]);
      const annualEntry = dm.slots.history.values.find(entry => entry.text.value.startsWith('Azoun III assumes'));
      expect(annualEntry?.text.provenance.citation).toMatchObject({
        title: '1261 DR', url: 'https://forgottenrealms.fandom.com/wiki/1261_DR', license: 'CC BY-SA 3.0',
      });
      expect(annualEntry?.text.provenance.citations).toEqual([
        { title: 'The Grand History of the Realms, с. 77', license: 'CC BY-SA 3.0' },
      ]);
    }
    expect(JSON.stringify(players)).not.toContain('The War of the Regency.');
    expect(validateSubjectEnvelope(players)).toEqual([]);
    expect(validateSubjectEnvelope(dm)).toEqual([]);
    if (duplicateDm?.slots.composition.status === 'present') {
      const composition = duplicateDm.slots.composition.values;
      expect(composition.filter(item => item.relation === 'territory-place')).toHaveLength(new Set(kingdom.places ?? []).size);
      expect(composition.filter(item => item.relation === 'organization')).toHaveLength(new Set(kingdom.orgs ?? []).size);
      expect(composition.filter(item => item.relation === 'within')).toHaveLength(new Set(kingdom.within ?? []).size);
    } else expect(duplicateDm?.slots.composition.status).toBe('present');
  });
});

describe('U7 saved-session integration', () => {
  it('opens a serialized session log and builds valid envelopes for all six subject profiles', () => {
    const savedText = serializeLog(seedLog());
    const events = parseLog(savedText);
    const recovered = structuredClone(new EventLog(seedState(), events).state);
    const selune = (deitiesJson as unknown as { deities: Deity[] }).deities.find(row => row.id === 'selune')!;
    const harpers = (organizationsJson as unknown as { organizations: Organization[] }).organizations.find(row => row.id === 'harpers')!;
    const cormyr = (kingdomsJson as unknown as { kingdoms: Kingdom[] }).kingdoms.find(row => row.id === 'cormyr')!;
    const neverwinter = Object.values(recovered.world.locations).find(place => place.name === 'Neverwinter')!;
    const envelopes = [
      partySubjectEnvelope(recovered, 'dm'),
      characterSubjectEnvelope(recovered, 'bo', 'dm'),
      deitySubjectEnvelope(recovered, selune, '5e', 'dm'),
      organizationSubjectEnvelope(recovered, harpers, 'dm'),
      citySubjectEnvelope(recovered, neverwinter.id, 'dm'),
      kingdomSubjectEnvelope(recovered, cormyr, 'dm', 1492),
    ];

    expect(events).toHaveLength(seedLog().length);
    expect(envelopes.every(Boolean)).toBe(true);
    expect(envelopes.map(envelope => validateSubjectEnvelope(envelope))).toEqual([[], [], [], [], [], []]);

    recovered.world.locations[neverwinter.id].revealed = true;
    const known = (ref: string, name: string) => ({ ref: ref as EntityRef, name, facts: [{ label: 'Известное сведение', value: name, sec: recovered.time.sec }] });
    recovered.knowledge = {
      'deity:selune': known('deity:selune', selune.name),
      'organization:harpers': known('organization:harpers', harpers.name),
      [`location:${neverwinter.id}`]: known(`location:${neverwinter.id}`, neverwinter.name),
      'kingdom:cormyr': known('kingdom:cormyr', cormyr.name),
    };
    for (const [index, subjectId] of ['actor:bo', 'deity:selune', 'organization:harpers', `location:${neverwinter.id}`, 'kingdom:cormyr'].entries()) {
      const id = `u7-secret-${index}`;
      recovered.facts[id] = { id, subjectId, text: 'закрытое примечание теста', visibility: 'dm' };
    }
    const playerEnvelopes = [
      partySubjectEnvelope(recovered, 'players'),
      characterSubjectEnvelope(recovered, 'bo', 'players'),
      deitySubjectEnvelope(recovered, selune, '5e', 'players'),
      organizationSubjectEnvelope(recovered, harpers, 'players'),
      citySubjectEnvelope(recovered, neverwinter.id, 'players'),
      kingdomSubjectEnvelope(recovered, cormyr, 'players', 1492),
    ];
    const validPlayerEnvelopes = playerEnvelopes.filter((envelope): envelope is NonNullable<typeof envelope> => envelope !== null);

    expect(playerEnvelopes.every(Boolean)).toBe(true);
    expect(validPlayerEnvelopes.map(envelope => validateSubjectEnvelope(envelope))).toEqual([[], [], [], [], [], []]);
    for (const envelope of validPlayerEnvelopes) {
      expect(JSON.stringify(envelope)).not.toContain('закрытое примечание теста');
      expect('secrets' in envelope.slots).toBe(false);
    }
  });
});
