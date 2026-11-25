import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PulseEdge, PulseFaction, PulseGod } from '../campaign/pulse';
import { FactionOrrery, influenceRadius } from './FactionOrrery';
import { pulseOf } from '../campaign/pulse';
import { seedEngine } from '../campaign/seed';
import { FACTION } from '../campaign/world';

const EDGES: PulseEdge[] = [{ a: 'harpers', b: 'zhentarim', value: -2, pending: -1 }];
const GODS: PulseGod[] = [
  { id: 'mystra', name: 'Mystra', worshippers: ['Lyra'], relations: [{ id: 'azuth', name: 'Azuth', kind: 'serves' }] },
];
const factions = (influencePercent: number | undefined): PulseFaction[] => [
  { id: 'harpers', name: 'Harpers', renown: 2, influencePercent },
  { id: 'zhentarim', name: 'Zhentarim', renown: 0 },
];

describe('FactionOrrery', () => {
  it('maps only the campaign influence percentage to body radius; missing values stay unassigned', () => {
    expect(influenceRadius(undefined)).toBe(10);
    expect(influenceRadius(0)).toBe(10);
    expect(influenceRadius(100)).toBe(34);
    expect(influenceRadius(150)).toBe(34);
    const { rerender } = render(<FactionOrrery factions={factions(45)} edges={EDGES} gods={GODS} />);
    const harpers = () => document.querySelector('[data-faction="harpers"]');
    const unknown = () => document.querySelector('[data-faction="zhentarim"]');
    expect(harpers()).toHaveAttribute('data-influence-radius', String(influenceRadius(45)));
    expect(unknown()).toHaveAttribute('data-influence-radius', '10');
    expect(unknown()).toHaveTextContent('—');

    // This is the state projection after the owner accepts a world proposal.
    rerender(<FactionOrrery factions={factions(80)} edges={EDGES} gods={GODS} />);
    expect(harpers()).toHaveAttribute('data-influence-radius', String(influenceRadius(80)));
    expect(unknown()).toHaveAttribute('data-influence-radius', '10');
  });

  it('shows relationship status and available deities, with keyboard and pointer opening', () => {
    const onOpenFaction = vi.fn();
    const onOpenDeity = vi.fn();
    render(<FactionOrrery factions={factions(45)} edges={EDGES} gods={GODS} onOpenFaction={onOpenFaction} onOpenDeity={onOpenDeity} />);

    expect(screen.getByRole('group', { name: /Орбиты фракций и богов/ })).toHaveAttribute('aria-label', expect.stringContaining('Harpers, влияние 45%'));
    expect(document.querySelector('[data-edge="harpers|zhentarim"]')).toBeInTheDocument();
    expect(screen.getByText('Azuth')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Открыть фракцию: Harpers' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть бога: Mystra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть бога: Azuth' }));
    expect(onOpenFaction).toHaveBeenCalledWith('harpers');
    expect(onOpenDeity).toHaveBeenCalledWith('mystra');
    expect(onOpenDeity).toHaveBeenCalledWith('azuth');
  });

  it('changes the faction body after an accepted world influence proposal', () => {
    let tick = 0;
    const store = seedEngine({ clock: { now: () => tick++ }, ids: { next: () => `event-${tick}` } });
    const factionId = FACTION.zhentarim;
    const readFactions = () => pulseOf(store.getState().state).factions;
    const before = readFactions().find(faction => faction.id === factionId)!;
    expect(before.influencePercent).toBe(45);
    const proposal = {
      id: 'orrery-influence', scale: 'continent' as const, subject: 'Zhentarim · влияние', was: '45%', now: '62%',
      cause: 'Принятое изменение влияния', causeId: factionId, status: 'pending' as const,
      patch: { kind: 'faction' as const, id: factionId, field: 'influencePercent' as const, value: 62 },
    };
    store.getState().propose(proposal);
    expect(readFactions().find(faction => faction.id === factionId)?.influencePercent).toBe(45);
    store.getState().accept(proposal.id);
    const after = readFactions();
    expect(after.find(faction => faction.id === factionId)?.influencePercent).toBe(62);

    const { rerender } = render(<FactionOrrery factions={after} edges={[]} gods={[]} />);
    const node = () => document.querySelector(`[data-faction="${factionId}"]`);
    expect(node()).toHaveAttribute('data-influence-radius', String(influenceRadius(62)));
    expect(node()).toHaveTextContent('62%');
    const grown = Number(node()?.getAttribute('data-influence-radius'));
    rerender(<FactionOrrery factions={readFactions()} edges={[]} gods={[]} />);
    expect(Number(node()?.getAttribute('data-influence-radius'))).toBe(grown);
  });
});
