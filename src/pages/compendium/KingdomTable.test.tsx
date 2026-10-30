// «Державы» в компендиуме (вид `kingdom:`, 30.10.2026): строки с правителем на выбранный год, фильтр «только
// существующие», карточка по щелчку, ссылка на соседа открывает его здесь же. Данные — подменённый загрузчик:
// файл импорта держав в тестах не нужен.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Kingdom } from '../../world/kingdoms';

const KINGDOMS: Kingdom[] = [
  { id: 'cormyr', name: 'Cormyr', title: 'Cormyr', type: 'Kingdom', capital: 'Suzail', region: 'Western Heartlands', rulers: [{ t: 'King Azoun IV', from: 1336, to: 1369 }, { t: 'King Foril Obarskyr', from: 1385 }], allies: ['netheril'], founded: -26 },
  { id: 'netheril', name: 'Netheril', title: 'Netheril', type: 'Empire', founded: -3859, dissolved: -339 },
];

vi.mock('../../world/kingdoms', async orig => ({
  ...(await orig<typeof import('../../world/kingdoms')>()),
  loadKingdoms: () => Promise.resolve(new Map(KINGDOMS.map(k => [k.id, k]))),
}));

const { KingdomTable } = await import('./KingdomTable');

describe('KingdomTable', () => {
  it('строки на год: правитель по годам вики; распавшаяся держава — только со снятым фильтром; карточка и сосед ссылкой', async () => {
    render(<KingdomTable query="" />);
    const cormyr = await screen.findByRole('button', { name: /^Cormyr/ });
    expect(screen.getByText('1 из 2 держав')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Cormyr/ })).toHaveTextContent('King Foril Obarskyr');
    fireEvent.click(screen.getByRole('tab', { name: '1372 DR' }));
    expect(screen.getByRole('row', { name: /Cormyr/ })).not.toHaveTextContent('King Foril');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /^Netheril/ })).toBeInTheDocument();
    fireEvent.click(cormyr);
    const card = screen.getByRole('complementary', { name: 'Карточка державы' });
    expect(card).toHaveTextContent('Suzail');
    expect(card).toHaveTextContent('основана -26 DR · в 1372 DR есть');
    fireEvent.click(within(card).getByRole('button', { name: /Союзники/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Netheril' }));
    expect(screen.getByRole('complementary', { name: 'Карточка державы' })).toHaveTextContent('распалась -339 DR');
  });
});
