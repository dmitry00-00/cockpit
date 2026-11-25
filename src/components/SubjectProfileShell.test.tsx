import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptyState } from '../engine/state';
import {
  characterSubjectEnvelope, citySubjectEnvelope, deitySubjectEnvelope, kingdomSubjectEnvelope,
  organizationSubjectEnvelope, partySubjectEnvelope,
} from '../entities/subjectAdapters';
import type { Deity } from '../cosmos/deities';
import type { Organization } from '../world/organizations';
import type { Kingdom } from '../world/kingdoms';
import deitiesJson from '../../content/cosmos/deities.json';
import organizationsJson from '../../content/world/organizations.json';
import kingdomsJson from '../../content/world/kingdoms.json';
import { SubjectProfileShell } from './SubjectProfileShell';

describe('SubjectProfileShell', () => {
  it('renders all six profiles from real adapter envelopes', () => {
    const state = emptyState();
    state.actors.bo = {
      id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 8, max: 8, temp: 0 }, ac: 14,
      passivePerception: 12, conditions: {},
    };
    state.party = ['bo'];
    state.world.locations.north = { id: 'north', name: 'Sword Coast North', scale: 'region', revealed: true };
    state.world.locations.neverwinter = { id: 'neverwinter', name: 'Neverwinter', scale: 'settlement', parentId: 'north', revealed: true };
    const selune = (deitiesJson as unknown as { deities: Deity[] }).deities.find(row => row.id === 'selune')!;
    const harpers = (organizationsJson as unknown as { organizations: Organization[] }).organizations.find(row => row.id === 'harpers')!;
    const cormyr = (kingdomsJson as unknown as { kingdoms: Kingdom[] }).kingdoms.find(row => row.id === 'cormyr')!;
    const envelopes = [
      characterSubjectEnvelope(state, 'bo', 'dm'),
      partySubjectEnvelope(state, 'dm'),
      deitySubjectEnvelope(state, selune, '5e', 'dm'),
      organizationSubjectEnvelope(state, harpers, 'dm'),
      citySubjectEnvelope(state, 'neverwinter', 'dm'),
      kingdomSubjectEnvelope(state, cormyr, 'dm', 1492),
    ];
    expect(envelopes.every(Boolean)).toBe(true);

    const { container } = render(<>{envelopes.map(envelope => envelope
      ? <SubjectProfileShell key={envelope.subjectId} envelope={envelope as NonNullable<typeof envelope>} />
      : null)}</>);

    expect([...container.querySelectorAll('[data-subject-profile]')].map(node => node.getAttribute('data-subject-profile')))
      .toEqual(['character', 'party', 'deity', 'organization', 'city', 'kingdom']);
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it('renders city scale, danger and position as readable Russian labels instead of internal enum keys', () => {
    const state = emptyState();
    state.world.locations.north = { id: 'north', name: 'Sword Coast North', scale: 'region', revealed: true };
    state.world.locations.neverwinter = {
      id: 'neverwinter', name: 'Neverwinter', scale: 'settlement', parentId: 'north', revealed: true,
      danger: 'medium', geo: { map: 'toril', x: 8522, y: 2610, r: 120 },
    };
    const envelope = citySubjectEnvelope(state, 'neverwinter', 'dm');
    expect(envelope).not.toBeNull();

    render(<SubjectProfileShell envelope={envelope!} />);

    expect(screen.getByText('Масштаб: Поселение')).toBeInTheDocument();
    expect(screen.getByText('Опасность: средняя')).toBeInTheDocument();
    expect(screen.getByText('Родительское место: Sword Coast North')).toBeInTheDocument();
    expect(screen.getByText(/Карта toril: 8.522, 2.610 · радиус 120/)).toBeInTheDocument();
    expect(screen.queryByText(/kind:|role:|settlement|medium|mapId:/)).not.toBeInTheDocument();
  });

  it('renders kingdom composition and campaign relations with localized labels and canonical names', () => {
    const state = emptyState();
    state.world.factions.cormyrCampaign = {
      id: 'cormyrCampaign', name: 'Cormyr campaign', renown: 0, ref: 'kingdom:cormyr', relations: { harpersCampaign: 2 },
    };
    state.world.factions.harpersCampaign = {
      id: 'harpersCampaign', name: 'Harpers campaign', renown: 0, ref: 'organization:harpers',
    };
    const kingdom = (kingdomsJson as unknown as { kingdoms: Kingdom[] }).kingdoms.find(row => row.id === 'cormyr')!;
    const envelope = kingdomSubjectEnvelope(state, kingdom, 'dm', 1492, [], {
      relatedNames: { 'organization:harpers': 'Harpers' },
    });
    expect(envelope).not.toBeNull();

    render(<SubjectProfileShell envelope={envelope!} />);

    expect(screen.getByText('Организация: Harpers')).toBeInTheDocument();
    expect(screen.getByText('Отношение фракций: Harpers campaign · 2')).toBeInTheDocument();
    expect(screen.queryByText(/organization:|campaign-relation|within:/)).not.toBeInTheDocument();
  });

  it('renders kingdom history links to the cited event page and lists book references separately', () => {
    const state = emptyState();
    const kingdom = (kingdomsJson as unknown as { kingdoms: Kingdom[] }).kingdoms.find(row => row.id === 'cormyr')!;
    const envelope = kingdomSubjectEnvelope(state, kingdom, 'dm', 1492, [{
      id: 'a1260-4', year: 1260, to: 1261, text: 'The War of the Regency spanned the years of 1260 DR and 1261 DR in Cormyr.',
      sourceTitle: 'War of the Regency', sourceUrl: 'https://forgottenrealms.fandom.com/wiki/War_of_the_Regency',
      cites: ['The Grand History of the Realms, с. 77'],
    }]);
    const historyEntry = envelope?.slots.history.status === 'present'
      ? envelope.slots.history.values.find(item => item.text.value.includes('The War of the Regency spanned'))
      : undefined;
    expect(historyEntry?.text.provenance.citations).toEqual([
      { title: 'The Grand History of the Realms, с. 77', license: 'CC BY-SA 3.0' },
    ]);
    const { container } = render(<SubjectProfileShell envelope={envelope!} />);
    expect(container.querySelector('[data-slot="history"]')?.textContent).toContain('The Grand History of the Realms, с. 77');

    expect(screen.getByRole('link', { name: 'War of the Regency' })).toHaveAttribute(
      'href', 'https://forgottenrealms.fandom.com/wiki/War_of_the_Regency',
    );
    expect(container.textContent).toContain('The Grand History of the Realms, с. 77');
    const historyLinks = [...container.querySelectorAll('[data-slot="history"] a')]
      .map(link => ({ title: link.textContent, href: link.getAttribute('href') }));
    expect(historyLinks).toContainEqual({
      title: 'War of the Regency', href: 'https://forgottenrealms.fandom.com/wiki/War_of_the_Regency',
    });
    expect(historyLinks.some(link => link.title?.includes('Grand History'))).toBe(false);
  });

});
