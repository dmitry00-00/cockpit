import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MapCoveragePlanner } from './MapCoveragePlanner';

afterEach(cleanup);

describe('MapCoveragePlanner', () => {
  it('opens the planning dialog with source, corridor and independent priority controls', () => {
    render(<MapCoveragePlanner currentMapId="neverwinter" />);
    fireEvent.click(screen.getByRole('button', { name: 'Покрытие' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Картографические источники и пробелы' })).toBeTruthy();
    expect(screen.getByLabelText('Радиус поискового коридора в милях')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Сортировать: Важность в мире' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Сортировать: Ценность за столом' })).toHaveLength(2);
    expect(screen.getByText('План Neverwinter — Mike Schley')).toBeTruthy();
    expect(screen.getAllByText(/Разрешить расхождение `.dd2vtt`/).length).toBeGreaterThan(0);
  });

  it('changes the corridor radius and filters tasks outside the selected buffer', () => {
    render(<MapCoveragePlanner currentMapId="neverwinter" />);
    fireEvent.click(screen.getByRole('button', { name: 'Покрытие' }));
    const radius = screen.getByLabelText('Радиус поискового коридора в милях');
    fireEvent.change(radius, { target: { value: '8' } });

    expect(screen.queryAllByText(/Сверить промежуточные места и пины/)).toHaveLength(0);
    fireEvent.change(radius, { target: { value: '16' } });
    expect(screen.queryAllByText(/Сверить промежуточные места и пины/).length).toBeGreaterThan(0);
  });
});
