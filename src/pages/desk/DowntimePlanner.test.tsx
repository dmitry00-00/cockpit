// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DowntimePlanner } from './DowntimePlanner';

afterEach(cleanup);

describe('DowntimePlanner', () => {
  it('collects one activity, manual result and optional Strife recovery per participant', () => {
    const onApply = vi.fn();
    render(<DowntimePlanner participants={[{ id: 'mira', name: 'Mira', strife: 2, relaxation: 'available', mods: { arcana: 4, investigation: 3 }, coinStacks: [{ stackId: 'mira-purse', itemId: 'coin:pp', qty: 50 }] }]} targets={[]} onApply={onApply} onRoll={() => ({ die: 16, total: 20 })} />);
    fireEvent.click(screen.getByText('Оформить промежуток (A5E)'));
    fireEvent.change(screen.getByLabelText('Период'), { target: { value: 'month' } });
    fireEvent.change(screen.getByLabelText('Занятие'), { target: { value: 'research' } });
    fireEvent.change(screen.getByLabelText('Цель/вопрос'), { target: { value: 'история гильдии' } });
    fireEvent.change(screen.getByLabelText('Категория сведений'), { target: { value: 'secret' } });
    expect(screen.getByText(/DC 25 · 5 нед. · стоимость 500\+ gp \(минимум 500 gp\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Бросить arcana +4' }));
    expect(screen.getByText('16+4 = 20 против DC 25 · failure-by-5')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Исход по решению мастера'), { target: { value: 'ложный след о гильдии' } });
    fireEvent.click(screen.getByLabelText('Развеяться: снять 1 Strife (правило стола)'));
    fireEvent.click(screen.getByText('Проверить и перейти к разбору времени'));
    expect(onApply).toHaveBeenCalledWith('month', [{ actorId: 'mira', actorName: 'Mira', activity: 'research', outcome: 'ложный след о гильдии', relaxStrife: true, information: { obscurity: 'secret', skill: 'arcana', subject: 'история гильдии', check: { total: 20, die: 16, modifier: 4 } } }]);
  });

  it('requires a manual outcome before submitting', () => {
    const onApply = vi.fn();
    render(<DowntimePlanner participants={[{ id: 'mira', name: 'Mira', strife: 0, relaxation: 'unavailable', mods: {} }]} targets={[]} onApply={onApply} />);
    fireEvent.click(screen.getByText('Оформить промежуток (A5E)'));
    fireEvent.click(screen.getByText('Проверить и перейти к разбору времени'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Укажите исход занятия: Mira.');
  });

  it('requires a linked entity and records one player-facing fact on success', () => {
    const onApply = vi.fn();
    render(<DowntimePlanner participants={[{ id: 'mira', name: 'Mira', strife: 0, relaxation: 'unavailable', mods: {}, coinStacks: [{ stackId: 'mira-gp', itemId: 'coin:gp', qty: 10 }] }]} targets={[{ ref: 'actor:mira', name: 'Mira' }]} onApply={onApply} />);
    fireEvent.click(screen.getByText('Оформить промежуток (A5E)'));
    fireEvent.change(screen.getByLabelText('Занятие'), { target: { value: 'gather-information' } });
    fireEvent.change(screen.getByLabelText('Цель/вопрос'), { target: { value: 'кто владеет печатью' } });
    fireEvent.change(screen.getByLabelText('Итог проверки: Mira'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Сущность для тетради Д6/), { target: { value: 'actor:mira' } });
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Владелец' } });
    fireEvent.change(screen.getByLabelText('Значение'), { target: { value: 'Хранитель архива' } });
    fireEvent.change(screen.getByLabelText('Исход по решению мастера'), { target: { value: 'сведения подтверждены' } });
    fireEvent.click(screen.getByText('Проверить и перейти к разбору времени'));
    expect(onApply).toHaveBeenCalledWith('tenday', [expect.objectContaining({
      activity: 'gather-information',
      information: expect.objectContaining({ target: { ref: 'actor:mira', name: 'Mira' }, facts: [{ label: 'Владелец', value: 'Хранитель архива' }] }),
    })]);
  });

  it('requires exact coin payment unless the Narrator waives Research fees for a suitable library', () => {
    const onApply = vi.fn();
    render(<DowntimePlanner participants={[{ id: 'mira', name: 'Mira', strife: 0, relaxation: 'unavailable', mods: {} }]} targets={[{ ref: 'actor:mira', name: 'Mira' }]} onApply={onApply} />);
    fireEvent.click(screen.getByText('Оформить промежуток (A5E)'));
    fireEvent.change(screen.getByLabelText('Занятие'), { target: { value: 'gather-information' } });
    fireEvent.change(screen.getByLabelText('Цель/вопрос'), { target: { value: 'кто владеет печатью' } });
    fireEvent.change(screen.getByLabelText('Итог проверки: Mira'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Сущность для тетради Д6/), { target: { value: 'actor:mira' } });
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Владелец' } });
    fireEvent.change(screen.getByLabelText('Значение'), { target: { value: 'Хранитель архива' } });
    fireEvent.change(screen.getByLabelText('Исход по решению мастера'), { target: { value: 'сведения подтверждены' } });
    fireEvent.click(screen.getByText('Проверить и перейти к разбору времени'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('нужны 10 gp точной оплатой');

    fireEvent.change(screen.getByLabelText('Занятие'), { target: { value: 'research' } });
    fireEvent.change(screen.getByLabelText('Цель/вопрос'), { target: { value: 'происхождение печати' } });
    fireEvent.click(screen.getByLabelText(/подходящей библиотеке/));
    fireEvent.change(screen.getByLabelText('Итог проверки: Mira'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Сущность для тетради Д6/), { target: { value: 'actor:mira' } });
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Владелец' } });
    fireEvent.change(screen.getByLabelText('Значение'), { target: { value: 'Хранитель архива' } });
    fireEvent.click(screen.getByText('Проверить и перейти к разбору времени'));
    expect(onApply).toHaveBeenCalledWith('tenday', [expect.objectContaining({
      activity: 'research',
      information: expect.objectContaining({ suitableLibrary: true }),
    })]);
  });
});
