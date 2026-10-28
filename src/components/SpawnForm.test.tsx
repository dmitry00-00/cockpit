// SpawnForm: блоки с CR/AC/HP кнопками aria-pressed, первый выбран; имя — подсказка выбранного, пока не тронуто;
// число штук 1–20; «Добавить» и Enter отдают блок, имя и число; пустое имя — имя блока; без блоков — ничего.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpawnForm, filterOptions, parseCount, type SpawnOption } from './SpawnForm';

const OPTIONS: SpawnOption[] = [
  { id: 'bandit', name: 'Bandit', cr: '1/8', ac: 12, hp: 11, suggested: 'Bandit 4' },
  { id: 'bandit-captain', name: 'Bandit Captain', cr: '2', ac: 15, hp: 65, suggested: 'Bandit Captain 2' },
];

describe('parseCount', () => {
  it('1–20, иначе null', () => {
    expect(parseCount('1')).toBe(1);
    expect(parseCount('20')).toBe(20);
    expect(parseCount('0')).toBeNull();
    expect(parseCount('21')).toBeNull();
    expect(parseCount('')).toBeNull();
    expect(parseCount('a')).toBeNull();
  });
});

describe('SpawnForm', () => {
  it('блоки — кнопки с CR, AC и хитами, первый нажат; имя — его подсказка; «Добавить» отдаёт блок, имя и 1', () => {
    const onSpawn = vi.fn();
    render(<SpawnForm options={OPTIONS} onSpawn={onSpawn} />);
    const group = screen.getByRole('group', { name: 'Блок' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['BanditCR 1/8AC 12HP 11', 'Bandit CaptainCR 2AC 15HP 65']);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Bandit 4');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onSpawn).toHaveBeenCalledWith('bandit', 'Bandit 4', 1);
  });

  it('смена блока меняет подсказку имени, пока имя не тронуто; тронутое остаётся; число штук — Enter отдаёт его', () => {
    const onSpawn = vi.fn();
    render(<SpawnForm options={OPTIONS} onSpawn={onSpawn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bandit Captain/ }));
    const name = screen.getByRole('textbox', { name: 'Имя' });
    expect(name).toHaveValue('Bandit Captain 2');
    fireEvent.change(name, { target: { value: 'Атаман' } });
    fireEvent.click(screen.getByRole('button', { name: /^Bandit CR/ }));
    expect(name).toHaveValue('Атаман');
    const count = screen.getByRole('textbox', { name: 'Сколько' });
    fireEvent.change(count, { target: { value: '3' } });
    fireEvent.keyDown(count, { key: 'Enter' });
    expect(onSpawn).toHaveBeenCalledWith('bandit', 'Атаман', 3);
  });

  it('число вне 1–20 — кнопка недоступна; пустое имя — имя блока; без блоков ничего не рисуется', () => {
    const onSpawn = vi.fn();
    const { container, unmount } = render(<SpawnForm options={OPTIONS} onSpawn={onSpawn} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Сколько' }), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Сколько' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя' }), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onSpawn).toHaveBeenCalledWith('bandit', 'Bandit', 2);
    unmount();
    expect(container).toBeEmptyDOMElement();
    render(<SpawnForm options={[]} onSpawn={onSpawn} />);
    expect(screen.queryByRole('group', { name: 'Блок' })).toBeNull();
  });
});

describe('поиск по блокам', () => {
  it('filterOptions — подстрока без регистра, пустой запрос — все; поиск сужает список и переводит выбор на первый видимый', () => {
    expect(filterOptions(OPTIONS, '').map(o => o.id)).toEqual(['bandit', 'bandit-captain']);
    expect(filterOptions(OPTIONS, 'CAPT').map(o => o.id)).toEqual(['bandit-captain']);
    const onSpawn = vi.fn();
    render(<SpawnForm options={OPTIONS} onSpawn={onSpawn} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Найти блок' }), { target: { value: 'capt' } });
    const group = screen.getByRole('group', { name: 'Блок' });
    expect(within(group).getAllByRole('button')).toHaveLength(1);
    expect(within(group).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Bandit Captain 2');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onSpawn).toHaveBeenCalledWith('bandit-captain', 'Bandit Captain 2', 1);
  });
});
