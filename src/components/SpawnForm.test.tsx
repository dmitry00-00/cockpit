// SpawnForm: блоки с CR/AC/HP кнопками aria-pressed, первый выбран; имя — подсказка выбранного, пока не тронуто;
// число штук 1–20; «Добавить» и Enter отдают блок, имя и число; пустое имя — имя блока; без блоков — ничего.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual([
      'Bandit, тип не указан, размер не указан, CR 1/8, AC 12, HP 11',
      'Bandit Captain, тип не указан, размер не указан, CR 2, AC 15, HP 65',
    ]);
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
    fireEvent.click(screen.getByRole('button', { name: /^Bandit,/ }));
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
  it('«Имя» — только у гуманоида и только со suggestName; имя из округи ставится в поле и уже не меняется сменой блока; null — подсказка', async () => {
    const opts: SpawnOption[] = [{ ...OPTIONS[0], humanoid: true }, { id: 'wolf', name: 'Wolf', cr: '1/4', ac: 13, hp: 11, suggested: 'Wolf 1' }];
    const suggest = vi.fn(async () => 'Nasim el Wisynn');
    const onSpawn = vi.fn();
    const { rerender } = render(<SpawnForm options={opts} onSpawn={onSpawn} />);
    expect(screen.queryByRole('button', { name: 'Имя' })).toBeNull();
    rerender(<SpawnForm options={opts} onSpawn={onSpawn} suggestName={suggest} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Имя' })); });
    expect(suggest).toHaveBeenCalledWith('bandit');
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Nasim el Wisynn');
    fireEvent.click(screen.getByRole('button', { name: /^Wolf/ }));
    expect(screen.queryByRole('button', { name: 'Имя' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Nasim el Wisynn');
    fireEvent.click(screen.getByRole('button', { name: /^Bandit/ }));
    suggest.mockResolvedValueOnce(null as unknown as string);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Имя' })); });
    expect(screen.getByRole('button', { name: 'Имя' })).toHaveAttribute('title', expect.stringContaining('нет жителей'));
  });
});

describe('фильтры «Добавить» (ROADMAP 0.5, M15)', () => {
  const LIBS: SpawnOption[] = [
    { id: 'bandit', name: 'Bandit', cr: '1/8', ac: 12, hp: 11, origin: 'SRD', suggested: 'Bandit 4' },
    { id: 'bf-bandit', name: 'Bandit', cr: '1/8', ac: 12, hp: 9, origin: 'Black Flag', suggested: 'Bandit 4' },
    { id: 'a5e-ogre', name: 'Ogre', cr: '2', ac: 11, hp: 59, origin: 'A5E', suggested: 'Ogre' },
    { id: 'wolf', name: 'Wolf', cr: '1/4', ac: 13, hp: 11, origin: 'SRD', suggested: 'Wolf' },
  ];

  it('filterOptions: библиотека и CR «от» и «до» дробями', () => {
    expect(filterOptions(LIBS, '', { origin: 'SRD' }).map(o => o.id)).toEqual(['bandit', 'wolf']);
    expect(filterOptions(LIBS, '', { crMin: '1/4' }).map(o => o.id)).toEqual(['a5e-ogre', 'wolf']);
    expect(filterOptions(LIBS, 'band', { crMax: '1/8', origin: 'Black Flag' }).map(o => o.id)).toEqual(['bf-bandit']);
  });

  it('форма: библиотека кнопкой, CR списком, «N из M»; фильтр скрыл выбранный — выбран первый видимый; initial — выбран заранее', () => {
    const onSpawn = vi.fn();
    const { unmount } = render(<SpawnForm options={LIBS} onSpawn={onSpawn} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Библиотека' })).getByRole('button', { name: 'A5E' }));
    expect(screen.getByText('1 из 4')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Блок' })).getByRole('button', { name: /Ogre/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('combobox', { name: 'CR до' }), { target: { value: '1/4' } });
    expect(screen.getByText('0 из 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
    unmount();
    render(<SpawnForm options={LIBS} onSpawn={onSpawn} initial="wolf" />);
    expect(within(screen.getByRole('group', { name: 'Блок' })).getByRole('button', { name: /Wolf/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onSpawn).toHaveBeenCalledWith('wolf', 'Wolf', 1);
  });
});
