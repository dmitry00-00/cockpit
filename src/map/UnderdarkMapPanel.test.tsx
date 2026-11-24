import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UnderdarkMapPanel } from './UnderdarkMapPanel';

afterEach(cleanup);

describe('UnderdarkMapPanel', () => {
  it('opens a separate three-level map and displays region and place counts', async () => {
    render(<UnderdarkMapPanel currentMapId="toril" />);
    fireEvent.click(screen.getByRole('button', { name: 'Подземье' }));

    expect(await screen.findByRole('heading', { name: 'Подземье Фаэруна' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Верхнее Подземье/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Среднее Подземье/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Нижнее Подземье/ })).toBeTruthy();
    const upperMap = await screen.findByRole('group', { name: /Верхнее Подземье: 28 областей и 38 мест/ });
    const sharedViewBox = upperMap.getAttribute('viewBox');
    fireEvent.click(screen.getByRole('button', { name: /Среднее Подземье/ }));
    const middleMap = await screen.findByRole('group', { name: /Среднее Подземье/ });
    expect(middleMap.getAttribute('viewBox')).toBe(sharedViewBox);
  });

  it('shows only source-backed relationships in the passage view and marks geometry as unknown', async () => {
    render(<UnderdarkMapPanel currentMapId="toril" />);
    fireEvent.click(screen.getByRole('button', { name: 'Подземье' }));
    await screen.findByRole('heading', { name: 'Подземье Фаэруна' });
    fireEvent.click(screen.getByRole('button', { name: 'Переходы' }));

    expect(screen.getByText('lava tubes')).toBeTruthy();
    expect(screen.getByText('Lake of Shadows → Lake Thoroot')).toBeTruthy();
    expect(screen.getByText('Lowroad tunnel network')).toBeTruthy();
    expect(screen.getByText('portal network')).toBeTruthy();
    expect(screen.getAllByText(/геометрия неизвестна/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/пустой слой туннелей Toril GIS не используется как доказательство связи/i)).toBeTruthy();
    expect(screen.getAllByText(/Ярус самого маршрута источником не установлен/i).length).toBe(4);
    expect(screen.getByText(/Геоконтекст GIS · Lake of Shadows: Среднее Подземье/i)).toBeTruthy();
    expect(screen.getByText(/Подтверждена связь с поверхностью/i)).toBeTruthy();
  });
});
