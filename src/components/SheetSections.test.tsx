import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SheetAttacks } from './SheetSections';

describe('SheetAttacks', () => {
  it('передаёт выведенную характеристику атаки обработчику броска', () => {
    const onRoll = vi.fn();
    const attack = { id: 'mindblade', name: 'Клинок разума', ability: 'wis' as const, toHit: 5, damage: '1d8 + 2', damageType: 'force', proficient: true };

    render(<SheetAttacks sheet={{ attacks: [attack] }} onRoll={onRoll} />);
    fireEvent.click(screen.getByRole('button', { name: 'Атака Клинок разума +5' }));

    expect(onRoll).toHaveBeenCalledWith(attack);
    expect(screen.getByRole('button', { name: 'Атака Клинок разума +5' }).getAttribute('title')).toContain('Мудрость');
  });
});
