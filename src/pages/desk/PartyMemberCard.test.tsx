import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedState } from '../../campaign';
import { PartyMemberCard } from './PartyMemberCard';

const setup = (dmView = true) => {
  const state = seedState();
  const inventory = Object.values(state.inventory ?? {});
  const onDamage = vi.fn(), onHeal = vi.fn(), onRoll = vi.fn(), onSheet = vi.fn();
  render(<>{['bo', 'korrin'].map(id => <PartyMemberCard key={id} actor={state.actors[id]} worldSec={state.time.sec}
    dmView={dmView} inventory={inventory.filter(stack => stack.owner.kind === 'actor' && stack.owner.id === id)}
    onDamage={onDamage} onHeal={onHeal} onRoll={onRoll} onSheet={onSheet} />)}</>);
  return { state, onDamage, onHeal, onRoll, onSheet };
};

describe('карточки нескольких участников партии', () => {
  it('передаёт тип характеристики и персонажа вместе с броском для применения Strife', () => {
    const { onRoll } = setup();
    const bo = within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' }));
    fireEvent.click(bo.getByRole('button', { name: /^INT/ }));
    expect(onRoll).toHaveBeenCalledWith(expect.any(String), 'INT · Bo Tambernack', { kind: 'check', ability: 'int' }, 'bo');
    fireEvent.click(bo.getByRole('button', { name: /Все навыки/ }));
    fireEvent.click(bo.getByRole('button', { name: /^Внимательность/ }));
    expect(onRoll).toHaveBeenLastCalledWith(expect.any(String), 'Внимательность · Bo Tambernack', { kind: 'check', ability: 'wis', skill: 'perception' }, 'bo');
  });

  it('урон, лечение, броски и лист относятся к нажатой карточке, а не к выбранному персонажу', () => {
    const { state, onDamage, onHeal, onRoll, onSheet } = setup();
    const bo = within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' }));
    const korrin = within(screen.getByRole('article', { name: 'Карта персонажа: Korrin Battlehammer' }));
    fireEvent.change(korrin.getByRole('spinbutton', { name: 'Сколько хитов' }), { target: { value: '7' } });
    fireEvent.click(korrin.getByRole('button', { name: 'Урон' }));
    expect(onDamage).toHaveBeenCalledExactlyOnceWith('korrin', 7);
    fireEvent.change(bo.getByRole('spinbutton', { name: 'Сколько хитов' }), { target: { value: '3' } });
    fireEvent.click(bo.getByRole('button', { name: 'Леч' }));
    expect(onHeal).toHaveBeenCalledExactlyOnceWith('bo', 3);
    fireEvent.click(korrin.getByRole('button', { name: 'Лист' }));
    expect(onSheet).toHaveBeenCalledExactlyOnceWith('korrin');
    fireEvent.click(bo.getByRole('button', { name: /Инициатива/ }));
    expect(onRoll).toHaveBeenCalledWith(expect.any(String), 'Инициатива · Bo Tambernack');
    expect(state.actors.korrin.sheet!.level).toBe(5);
  });

  it('в режиме игроков нет изменения хитов, а открытие листа остаётся доступным', () => {
    const { onSheet } = setup(false);
    expect(screen.queryByRole('spinbutton', { name: 'Сколько хитов' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Урон' })).toBeNull();
    fireEvent.click(within(screen.getByRole('article', { name: 'Карта персонажа: Korrin Battlehammer' })).getByRole('button', { name: 'Лист' }));
    expect(onSheet).toHaveBeenCalledWith('korrin');
  });

  it('показывает мастеру контекстные проверки побега при включённой теме и активном Terrorized', () => {
    const state = seedState();
    state.actors.bo.a5eConditions = { mentalStress: { kind: 'short', id: 'terrorized', untilSec: 100 } };
    const onRoll = vi.fn();
    render(<PartyMemberCard actor={state.actors.bo} worldSec={10}
      dmView stressEnabled inventory={Object.values(state.inventory ?? {}).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === 'bo')}
      onDamage={vi.fn()} onHeal={vi.fn()} onRoll={onRoll} onSheet={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Состояния/ }));
    const group = screen.getByRole('group', { name: 'Проверка выхода из опасности: Bo Tambernack' });
    fireEvent.click(within(group).getByRole('button', { name: 'Проверка выхода из опасности · STR · Bo Tambernack' }));
    expect(onRoll).toHaveBeenCalledWith(expect.stringMatching(/^1d20/), 'Выход из боя или опасности · STR · Bo Tambernack',
      { kind: 'check', ability: 'str', purpose: 'escape-combat-or-danger' }, 'bo');
    fireEvent.click(within(group).getByRole('button', { name: 'Спасбросок Мудрости Сл 15 · Terrorized · Bo Tambernack' }));
    expect(onRoll).toHaveBeenLastCalledWith(expect.stringMatching(/^1d20/), 'Terrorized · спасбросок Мудрости Сл 15 · Bo Tambernack',
      { kind: 'save', ability: 'wis' }, 'bo');
  });

  it('скрывает контекстные проверки побега при истёкшем кратком эффекте', () => {
    const state = seedState();
    state.actors.bo.a5eConditions = { mentalStress: { kind: 'short', id: 'terrorized', untilSec: 10 } };
    render(<PartyMemberCard actor={state.actors.bo} worldSec={10}
      dmView stressEnabled inventory={[]} onDamage={vi.fn()} onHeal={vi.fn()} onRoll={vi.fn()} onSheet={vi.fn()} />);
    expect(screen.queryByRole('group', { name: /Проверка выхода из опасности/ })).toBeNull();
  });

  it('скрывает проверки Mental Stress, когда тема кампании отключена', () => {
    const state = seedState();
    state.actors.bo.a5eConditions = { mentalStress: { kind: 'short', id: 'terrorized', untilSec: 100 } };
    render(<PartyMemberCard actor={state.actors.bo} worldSec={10}
      dmView stressEnabled={false} inventory={[]} onDamage={vi.fn()} onHeal={vi.fn()} onRoll={vi.fn()} onSheet={vi.fn()} />);
    expect(screen.queryByRole('group', { name: /Проверка выхода из опасности/ })).toBeNull();
  });
});
