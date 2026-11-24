// InitiativeEditor: строки с иконкой типа, DEX и полем; известные броски предзаполнены; «Бросить» пишет итог
// броска в поле; «Бросить пустым» — только пустым; порядок по убыванию, равные — как строки переданы, пустые
// строки не в бою; главная кнопка по режиму, недоступна без единого числа; Enter в поле — главное действие;
// отрицательные числа (U+2212 или дефис) допустимы; без пиктограмм.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeEditor, initiativeFormula, orderFromDrafts, parseInitiative, type InitiativeRow } from './InitiativeEditor';

const EMOJI = /\p{Extended_Pictographic}/u;

const ROWS: InitiativeRow[] = [
  { id: 'bo', name: 'Bo Tambernack', kind: 'pc', mod: 3, initiative: 15 },
  { id: 'korrin', name: 'Korrin Battlehammer', kind: 'pc', mod: 0 },
  { id: 'captain', name: 'Bandit Captain', kind: 'monster', mod: 3 },
  { id: 'bandit-1', name: 'Bandit 1', kind: 'monster', mod: 1 },
];

const field = (name: string) => screen.getByRole('textbox', { name: `Инициатива: ${name}` });

describe('parseInitiative, initiativeFormula, orderFromDrafts', () => {
  it('целое до трёх цифр, с минусом любого вида; прочее — null', () => {
    expect(parseInitiative('15')).toBe(15);
    expect(parseInitiative(' 7 ')).toBe(7);
    expect(parseInitiative('-2')).toBe(-2);
    expect(parseInitiative('−3')).toBe(-3);
    expect(parseInitiative('')).toBeNull();
    expect(parseInitiative('1d20')).toBeNull();
    expect(parseInitiative('1234')).toBeNull();
  });

  it('формула — d20 с модификатором: «1d20+3», «1d20-1», «1d20»', () => {
    expect(initiativeFormula(3)).toBe('1d20+3');
    expect(initiativeFormula(-1)).toBe('1d20-1');
    expect(initiativeFormula(0)).toBe('1d20');
  });

  it('порядок из черновиков: по убыванию, равные — как строки, пустые и мусор — не в бою', () => {
    const order = orderFromDrafts(ROWS, { bo: '12', korrin: '', captain: '12', 'bandit-1': 'x' });
    expect(order).toEqual([{ actorId: 'bo', initiative: 12 }, { actorId: 'captain', initiative: 12 }]);
  });
});

describe('InitiativeEditor', () => {
  it('строки с DEX и полем; известный бросок предзаполнен; счётчик «в порядке»; кнопка режима «Начать бой»', () => {
    render(<InitiativeEditor rows={ROWS} mode="start" onRoll={() => 10} onApply={() => {}} />);
    const list = screen.getByRole('list', { name: 'Броски инициативы' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(field('Bo Tambernack')).toHaveValue('15');
    expect(field('Korrin Battlehammer')).toHaveValue('');
    expect(within(list).getAllByTitle('Модификатор инициативы (DEX)').map(e => e.textContent)).toEqual(['DEX +3', 'DEX +0', 'DEX +3', 'DEX +1']);
    expect(screen.getByTitle('В порядке боя')).toHaveTextContent('1 из 4');
    expect(screen.getByRole('button', { name: 'Начать бой' })).toBeInTheDocument();
    expect(within(list).getAllByTitle('Персонаж игрока')).toHaveLength(2);
    expect(within(list).getAllByTitle('Чудовище')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(EMOJI);
  });

  it('«Бросить» у строки зовёт onRoll с формулой и подписью и пишет итог в поле; «Бросить пустым» — только пустым', () => {
    const onRoll = vi.fn((formula: string, _label: string, _actorId?: string) => (formula === '1d20+3' ? 21 : 9));
    render(<InitiativeEditor rows={ROWS} mode="start" onRoll={onRoll} onApply={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Бросить: Bandit Captain' }));
    expect(onRoll).toHaveBeenCalledWith('1d20+3', 'Инициатива · Bandit Captain', 'captain');
    expect(field('Bandit Captain')).toHaveValue('21');

    fireEvent.click(screen.getByRole('button', { name: 'Бросить пустым' }));
    expect(onRoll).toHaveBeenCalledTimes(3);
    expect(onRoll.mock.calls.slice(1).map(c => [c[1], c[2]])).toEqual([['Инициатива · Korrin Battlehammer', 'korrin'], ['Инициатива · Bandit 1', 'bandit-1']]);
    expect(field('Bo Tambernack')).toHaveValue('15');
    expect(field('Korrin Battlehammer')).toHaveValue('9');
    expect(screen.getByRole('button', { name: 'Бросить пустым' })).toBeDisabled();
    expect(screen.getByTitle('В порядке боя')).toHaveTextContent('4 из 4');
  });

  it('«Применить» в бою отдаёт порядок по убыванию, пустые строки — нет; Enter в поле делает то же; без чисел кнопка недоступна', () => {
    const onApply = vi.fn();
    render(<InitiativeEditor rows={ROWS.map(r => ({ ...r, initiative: undefined }))} mode="set" onRoll={() => 1} onApply={onApply} />);
    const apply = screen.getByRole('button', { name: 'Применить' });
    expect(apply).toBeDisabled();
    fireEvent.change(field('Korrin Battlehammer'), { target: { value: '18' } });
    fireEvent.change(field('Bandit 1'), { target: { value: '18' } });
    fireEvent.change(field('Bo Tambernack'), { target: { value: '−1' } });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith([{ actorId: 'korrin', initiative: 18 }, { actorId: 'bandit-1', initiative: 18 }, { actorId: 'bo', initiative: -1 }]);
    fireEvent.keyDown(field('Bo Tambernack'), { key: 'Enter' });
    expect(onApply).toHaveBeenCalledTimes(2);
  });
});
