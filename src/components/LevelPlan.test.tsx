import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedState } from '../campaign/seed';
import { LevelPlan } from './LevelPlan';

describe('БА27: планировщик повышений', () => {
  it('восстанавливает черновик после повторного открытия формы', () => {
    window.localStorage.clear();
    const actor = seedState().actors.korrin;
    const first = render(<LevelPlan actor={actor} />);
    const target = actor.sheet!.level + 1;
    fireEvent.change(screen.getByRole('combobox', { name: 'Планировать до уровня' }), { target: { value: String(target) } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    first.unmount();
    render(<LevelPlan actor={actor} />);
    expect(screen.getByText(/Черновик плана восстановлен/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Заполненные шаги плана' })).toHaveTextContent(`${target}-й уровень`);
    window.localStorage.clear();
  });

  it('не переносит старые решения при смене актёра или базового листа', async () => {
    window.localStorage.clear();
    const actor = seedState().actors.korrin;
    const view = render(<LevelPlan actor={actor} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    await waitFor(() => expect(window.localStorage.getItem('dm-cockpit:level-plan:v1:korrin')).not.toBeNull());
    const otherActor = { ...actor, id: 'other-actor' };
    view.rerender(<LevelPlan actor={otherActor} />);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('dm-cockpit:level-plan:v1:other-actor')!).choices).toEqual([]));
    const changedSheet = { ...actor, sheet: { ...actor.sheet!, abilities: { ...actor.sheet!.abilities, con: actor.sheet!.abilities.con + 1 } } };
    view.rerender(<LevelPlan actor={changedSheet} />);
    await waitFor(() => { const saved=JSON.parse(window.localStorage.getItem('dm-cockpit:level-plan:v1:korrin')!); expect(saved.choices).toEqual([]); expect(saved.fingerprint).toBe(JSON.stringify(changedSheet.sheet)); });
    expect(screen.queryByRole('list', { name: 'Заполненные шаги плана' })).toBeNull();
    window.localStorage.clear();
  });

  it('изменение раннего решения удаляет зависимые поздние шаги; план остаётся локальным', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, subclassId: 'voin-cempion' } };
    render(<LevelPlan actor={actor} />);
    const target = actor.sheet!.level + 2;
    fireEvent.change(screen.getByRole('combobox', { name: 'Планировать до уровня' }), { target: { value: String(target) } });
    expect(screen.getByRole('form', { name: `Решение плана для ${actor.sheet!.level + 1}-го уровня` })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Характеристика' }), { target: { value: 'con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    expect(screen.getByRole('form', { name: `Решение плана для ${actor.sheet!.level + 2}-го уровня` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Изменить выбор ${actor.sheet!.level + 1}-го уровня` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Изменить выбор ${actor.sheet!.level + 1}-го уровня` }));
    expect(screen.getByRole('form', { name: `Решение плана для ${actor.sheet!.level + 1}-го уровня` })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: `Решение плана для ${actor.sheet!.level + 2}-го уровня` })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Характеристика' })).toHaveValue('con');
    fireEvent.change(screen.getByRole('combobox', { name: 'Характеристика' }), { target: { value: 'str' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    expect(screen.getByRole('form', { name: `Решение плана для ${actor.sheet!.level + 2}-го уровня` })).toBeInTheDocument();
    expect(actor.sheet?.subclassId).toBe('voin-cempion');
    expect(screen.getByText(/Черновик только для просмотра/)).toBeInTheDocument();
  });

  it('сохраняет неразмеченный кандидат, но не считает его полным уровнем и позволяет уточнить решение', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, level: 2, subclassId: undefined } };
    render(<LevelPlan actor={actor} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Планировать до уровня' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Подкласс' }), { target: { value: 'voin-master-boevyh-isskustv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    expect(screen.getByText(/Полный расчёт подтверждён до 2-го уровня/)).toBeInTheDocument();
    expect(screen.getByText(/3-й уровень · расчёт неполон/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Заполненные шаги плана' })).toHaveTextContent('Мастер боевых исскуств');
    expect(screen.queryByRole('region', { name: 'Итог плана' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить выбор 3-го уровня' }));
    expect(screen.getByRole('combobox', { name: 'Подкласс' })).toHaveValue('voin-master-boevyh-isskustv');
    fireEvent.change(screen.getByRole('combobox', { name: 'Подкласс' }), { target: { value: 'voin-cempion' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    expect(screen.getByRole('region', { name: 'Итог плана' })).toHaveTextContent('Расчётный итог · 3-й уровень');
    expect(screen.getByRole('list', { name: 'Заполненные шаги плана' })).not.toHaveTextContent('voin-cempion');
  });
});
