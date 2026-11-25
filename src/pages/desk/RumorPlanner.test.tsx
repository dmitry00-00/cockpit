import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RumorPlanner } from './RumorPlanner';

afterEach(cleanup);

const places = [
  { id: 'waterdeep', name: 'Waterdeep', x: 0, y: 0 },
  { id: 'triboar', name: 'Triboar', x: 5, y: 1 },
  { id: 'neverwinter', name: 'Neverwinter', x: 10, y: 0 },
];
const route = {
  from: places[0]!, to: places[1]!, nodes: ['waterdeep', 'neverwinter'],
  edges: [{ a: 'waterdeep', b: 'neverwinter', mode: 'road' as const, miles: 32 }], miles: 32,
};

describe('RumorPlanner', () => {
  it('previews a land route and submits only a GM-authored rumor request', async () => {
    const previewRumorRoute = vi.fn(() => route);
    const prepare = vi.fn().mockResolvedValue({ ready: true, rumorPlaces: () => places, previewRumorRoute });
    const propose = vi.fn().mockResolvedValue('Слух предложен во входящих.');
    render(<RumorPlanner prepare={prepare} propose={propose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить слух по дорогам' }));
    expect(await screen.findByRole('textbox', { name: 'Текст слуха' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Маршрут слуха' })).toHaveTextContent('Waterdeep → Neverwinter');
    expect(screen.getByRole('region', { name: 'Маршрут слуха' })).toHaveTextContent('32 мили');
    fireEvent.change(screen.getByRole('combobox', { name: 'Контрольный пункт слуха' }), { target: { value: 'triboar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить пункт' }));
    expect(previewRumorRoute).toHaveBeenLastCalledWith('waterdeep', 'neverwinter', ['triboar']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст слуха' }), { target: { value: 'У северных ворот слышали волков' } });
    fireEvent.click(screen.getByRole('button', { name: 'Предложить слух' }));

    await waitFor(() => expect(propose).toHaveBeenCalledWith({
      from: 'waterdeep', to: 'neverwinter', checkpoints: ['triboar'], text: 'У северных ворот слышали волков', speedMilesPerDay: 20,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Слух предложен во входящих');
  });

  it('requires a positive speed and authored text before proposing', async () => {
    const prepare = vi.fn().mockResolvedValue({ ready: true, rumorPlaces: () => places, previewRumorRoute: () => route });
    const propose = vi.fn();
    render(<RumorPlanner prepare={prepare} propose={propose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отправить слух по дорогам' }));
    await screen.findByRole('textbox', { name: 'Текст слуха' });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Скорость слуха' }), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Предложить слух' })).toBeDisabled();
    expect(propose).not.toHaveBeenCalled();
  });
});
