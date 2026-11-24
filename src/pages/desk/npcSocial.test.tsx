import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedState } from '../../campaign';
import { TEMPO_SECONDS, type InventoryStack } from '../../engine';
import { NpcSocialPanel } from './bodies';

describe('NpcSocialPanel gifts', () => {
  it('records a gift as a reversible social fact and enforces the tenday cooldown', () => {
    const state = seedState();
    const npc = { ...state.actors.bo, id: 'npc-gift', name: 'Спутник', kind: 'npc' as const, social: { attitude: 'indifferent' as const } };
    const giftStacks: InventoryStack[] = [{ id: 'hero-rope', itemId: 'rope', qty: 2, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } }];
    const onCommand = vi.fn();
    const onInfluence = vi.fn();
    const view = render(<NpcSocialPanel actor={npc} party={[state.actors.bo]} giftStacks={giftStacks} worldSec={state.time.sec} onCommand={onCommand} onInfluence={onInfluence} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество подарка' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Примечание к подарку' }), { target: { value: 'Карта безопасной дороги' } });
    fireEvent.click(screen.getByRole('button', { name: 'Передать подарок' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      type: 'ITEM_GIFTED',
      payload: expect.objectContaining({ recipientId: npc.id, giverId: 'bo', stackId: 'hero-rope', qty: 1, note: 'Карта безопасной дороги', splitStackId: expect.any(String) }),
    }));

    view.rerender(<NpcSocialPanel actor={{ ...npc, social: { attitude: 'indifferent', giftAtSec: state.time.sec } }} party={[state.actors.bo]} giftStacks={giftStacks} worldSec={state.time.sec + 5 * 86_400} onCommand={onCommand} onInfluence={onInfluence} />);
    expect((screen.getByRole('button', { name: 'Передать подарок' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Можно снова через 5 дн.')).toBeTruthy();
    expect(TEMPO_SECONDS.tenday).toBe(10 * 86_400);
  });
});
