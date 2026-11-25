import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedState } from '../campaign';
import { characterCardProps } from '../campaign/characterCard';
import type { PcHeaderData } from './PcSheet';
import { CharacterCard } from './CharacterCard';
import { CharacterCardSpine } from './CharacterCardSpine';

const sourceHeader: PcHeaderData = { level: 5, title: 'Полурослик · Следопыт', alignment: 'Нейтральный', speed: 25, height: '97 см' };
const card = characterCardProps(seedState().actors.bo, sourceHeader, 0)!;

describe('CharacterCardSpine', () => {
  it('компактный корешок использует ту же разметку и содержимое без интерактивных элементов', () => {
    const { container } = render(<button type="button" aria-label="Выбрать Bo"><CharacterCardSpine card={card} compact /></button>);
    const spine = container.querySelector<HTMLElement>('[data-part="edge-top"]')!;
    expect(spine.tagName).toBe('SPAN');
    expect(spine).toHaveClass('h-10', 'bg-linear-to-br', 'from-pl', 'to-cd');
    expect(spine).toHaveClass('character-card-spine--compact');
    expect(spine).toHaveTextContent('5');
    expect(spine).toHaveTextContent(card.name);
    expect(spine).toHaveTextContent(card.header.title);
    expect(spine.querySelector('button, a, header')).toBeNull();
    expect(within(spine).getByRole('img', { name: `Портрет: ${card.name}` })).toBeInTheDocument();
  });

  it('открытая карта сохраняет семантический header и доступную кнопку листа; collapse отсутствует без callback', () => {
    const onSheet = vi.fn();
    const { container } = render(<CharacterCard card={card} onSheet={onSheet} />);
    const header = container.querySelector('header[data-part="edge-top"]')!;
    expect(header).toHaveAttribute('aria-label', `Персонаж ${card.name}, уровень ${card.header.level}`);
    fireEvent.click(screen.getByRole('button', { name: 'Лист' }));
    expect(onSheet).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: `Свернуть карточку: ${card.name}` })).toBeNull();
  });

  it('A5E Strife входит в DM-корешок и отсутствует в player data и DOM', () => {
    const actor = structuredClone(seedState().actors.bo);
    actor.a5eConditions = { strife: 3 };
    const dmCard = characterCardProps(actor, sourceHeader, 0, true)!;
    const playerCard = characterCardProps(actor, sourceHeader, 0, false)!;
    expect(dmCard.strife).toMatchObject({ level: 3 });
    expect(playerCard).not.toHaveProperty('strife');

    const dm = render(<CharacterCardSpine card={dmCard} compact />);
    expect(dm.container.querySelector('[data-part="spine-status"][aria-label="A5E Strife 3"]')).not.toBeNull();
    dm.unmount();
    const players = render(<CharacterCardSpine card={playerCard} compact />);
    expect(within(players.container).queryByRole('img', { name: /A5E Strife/ })).toBeNull();
    expect(players.container.innerHTML).not.toContain('A5E Strife');
  });
});
