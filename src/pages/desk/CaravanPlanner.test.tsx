import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CaravanPlanner, type CaravanPlannerSimulation } from './CaravanPlanner';

afterEach(cleanup);

function ready(): CaravanPlannerSimulation {
  const places = [
    { id: 'a', name: 'Waterdeep', x: 0, y: 0 },
    { id: 'b', name: 'Neverwinter', x: 10, y: 0 },
    { id: 'c', name: 'Luskan', x: 20, y: 0 },
  ];
  return {
    ready: true,
    caravanPlaces: () => places,
    previewCaravanRoute: (from, to, options) => from === to
      ? { ok: false, reason: 'same-place', message: 'Нужны разные поселения' }
      : to === 'c'
        ? { ok: false, reason: 'no-route', message: 'Между поселениями нет пути' }
        : (() => {
          const nodes = [from, ...(options?.checkpoints ?? []), to];
          return {
            ok: true as const, from: places.find(place => place.id === from)!, to: places.find(place => place.id === to)!,
            route: {
              version: 1 as const, map: 'toril', nodes,
              edges: nodes.slice(1).map((id, index) => ({ a: nodes[index], b: id, mode: 'road' as const, miles: 24 })),
              miles: 24, days: 1.9,
              ...(options?.transport && options.transport !== 'any' ? { transport: options.transport } : {}),
              ...(options?.checkpoints?.length ? { checkpoints: options.checkpoints } : {}),
            },
          };
        })(),
  };
}

it('selection and preview propose nothing; same-place and unreachable routes cannot be submitted', async () => {
  const prepare = vi.fn().mockResolvedValue(ready()), propose = vi.fn();
  render(<CaravanPlanner prepare={prepare} propose={propose} />);
  expect(prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать караван' }));
  expect(await screen.findByRole('combobox', { name: 'Куда' })).toHaveValue('b');
  expect(screen.getByLabelText('Предпросмотр торгового пути')).toHaveTextContent('Waterdeep → Neverwinter');
  expect(propose).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Куда' }), { target: { value: 'a' } });
  expect(screen.getByRole('button', { name: 'Предложить отправку' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Куда' }), { target: { value: 'c' } });
  expect(screen.getByRole('status')).toHaveTextContent('нет пути');
  expect(screen.getByRole('button', { name: 'Предложить отправку' })).toBeDisabled();
  expect(propose).not.toHaveBeenCalled();
});

it('submits the selected graph IDs and cargo once, while waiting for the proposal', async () => {
  let finish!: (message: string) => void;
  const propose = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  render(<CaravanPlanner prepare={async () => ready()} propose={propose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать караван' }));
  await screen.findByRole('combobox', { name: 'Груз' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Груз' }), { target: { value: 'food' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Объём, единицы запаса' }), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Охрана, шкала 0–5' }), { target: { value: '1' } });
  const send = screen.getByRole('button', { name: 'Предложить отправку' });
  fireEvent.click(send);
  fireEvent.click(send);
  expect(screen.getByRole('button', { name: 'Готовится предложение…' })).toBeDisabled();
  expect(propose).toHaveBeenCalledExactlyOnceWith({ from: 'a', to: 'b', goods: 'food', quantity: 2, escort: 1 });
  finish('Предложение во входящих; мир пока не изменён.');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('мир пока не изменён'));
});

it('shows a preparation failure and lets the owner retry without submitting cargo', async () => {
  const prepare = vi.fn().mockRejectedValueOnce(new Error('Не удалось загрузить граф')).mockResolvedValueOnce(ready());
  const propose = vi.fn();
  render(<CaravanPlanner prepare={prepare} propose={propose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать караван' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить граф');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку путей' }));
  await screen.findByRole('combobox', { name: 'Откуда' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(propose).not.toHaveBeenCalled();
});

it('collects transport, ordered checkpoints, and an explicit recurring interval before proposing a line', async () => {
  const prepare = vi.fn().mockResolvedValue(ready()), propose = vi.fn().mockResolvedValue('линия предложена');
  render(<CaravanPlanner prepare={prepare} propose={propose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать караван' }));
  await screen.findByRole('combobox', { name: 'Откуда' });

  fireEvent.change(screen.getByRole('combobox', { name: 'Способ перевозки' }), { target: { value: 'land' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Отправления' }), { target: { value: 'regular' } });
  const submit = screen.getByRole('button', { name: 'Предложить регулярную линию' });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByRole('combobox', { name: 'Добавить контрольную точку' }), { target: { value: 'c' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить точку' }));
  expect(screen.getByText('1. Luskan')).toBeInTheDocument();
  expect(screen.getByLabelText('Предпросмотр торгового пути')).toHaveTextContent('Waterdeep → Luskan → Neverwinter');

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Интервал, дней' }), { target: { value: '7' } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(propose).toHaveBeenCalledExactlyOnceWith({
    from: 'a', to: 'b', goods: 'cloth', quantity: 1, escort: 3,
    transport: 'land', checkpoints: ['c'], intervalDays: 7,
  }));
  expect(screen.getByRole('status')).toHaveTextContent('линия предложена');
});
