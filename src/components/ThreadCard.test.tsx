// ThreadCard: section «Нить: имя» на плите cd с левой полосой gd, шапка с иконкой threads, «#ИМЯ» type-h-15
// uppercase gd и счётчиком со склонением (1 запись / 2 записи / 5 записей); шапка — кнопка только при
// onSelect; выбранная — золотое кольцо и aria-current; строки dl: подпись 72px type-key t2, текст по тону,
// секрет приглушён и с глазом; пустые строки не рисуются.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { ThreadCard, entryCountLabel, type ThreadCardRow } from './ThreadCard';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const ROWS: ThreadCardRow[] = [
  { key: 'age', label: '12 дней', text: 'караван не дошёл до Neverwinter', tone: 't2' },
  { key: 'now', label: 'сейчас', text: 'Zhentarim усилились, цены на железо +10%' },
  { key: 'clock', label: 'часы', text: '5 из 8 делений', tone: 'sim' },
  { key: 'secret', label: 'секрет', text: 'некромант — бывший ученик из Дома Зари', secret: true },
  { key: 'cascade', label: 'каскад', text: 'полнолуние → ликантропы → слух', tone: 'gd' },
];

const card = () => screen.getByRole('region', { name: 'Нить: The Missing Caravan' });

describe('entryCountLabel', () => {
  it('склонение: 1 запись, 2 записи, 5 записей, 11 записей, 21 запись, 0 записей', () => {
    expect(entryCountLabel(1)).toBe('1 запись');
    expect(entryCountLabel(2)).toBe('2 записи');
    expect(entryCountLabel(4)).toBe('4 записи');
    expect(entryCountLabel(5)).toBe('5 записей');
    expect(entryCountLabel(11)).toBe('11 записей');
    expect(entryCountLabel(21)).toBe('21 запись');
    expect(entryCountLabel(0)).toBe('0 записей');
  });
});

describe('ThreadCard', () => {
  it('section с data-thread на плите cd с левой полосой gd; шапка на плите pl: иконка threads gd, «#ИМЯ» type-h-15 uppercase gd, счётчик type-key t2', () => {
    render(<ThreadCard id="caravan" name="The Missing Caravan" count={4} rows={ROWS} />);
    const c = card();
    expect(c.tagName).toBe('SECTION');
    expect(c).toHaveAttribute('data-thread', 'caravan');
    expect(c).not.toHaveAttribute('aria-current');
    expect(c).toHaveClass('bg-cd');
    expect(c.className).toContain('shadow-[var(--bevel),inset_3px_0_0_var(--gd)]');
    expect(c.className).not.toContain('glow-gold');
    const head = c.querySelector('[data-part="head"]') as HTMLElement;
    expect(head.tagName).toBe('DIV');
    expect(head.className).toContain('from-pl');
    expect(head).toHaveClass('shadow-plate');
    const icon = within(head).getByRole('img', { name: 'Нить' });
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS.threads).filter(Boolean));
    expect(icon.querySelector('path[fill*="--gd"]')).not.toBeNull();
    const name = within(head).getByTitle('The Missing Caravan');
    expect(name).toHaveTextContent('#The Missing Caravan');
    expect(name).toHaveClass('type-h-15', 'uppercase', 'text-gd', 'truncate');
    const count = within(head).getByTitle('Записей по нити');
    expect(count).toHaveTextContent('4 записи');
    expect(count).toHaveClass('type-key', 'text-t2');
    expect(within(c).queryAllByRole('button')).toHaveLength(0);
    expect(c.textContent).not.toMatch(EMOJI);
  });

  it('счётчик склоняется: 1 запись, 3 записи, 5 записей', () => {
    const { rerender } = render(<ThreadCard id="t" name="Луна и стая" count={1} rows={[]} />);
    const count = () => within(screen.getByRole('region', { name: 'Нить: Луна и стая' })).getByTitle('Записей по нити');
    expect(count()).toHaveTextContent('1 запись');
    rerender(<ThreadCard id="t" name="Луна и стая" count={3} rows={[]} />);
    expect(count()).toHaveTextContent('3 записи');
    rerender(<ThreadCard id="t" name="Луна и стая" count={5} rows={[]} />);
    expect(count()).toHaveTextContent('5 записей');
  });

  it('строки — dl: подпись term type-key uppercase t2 (72px), текст definition type-body-sm по тону: tx по умолчанию, t2, sim → src-sim, gd', () => {
    render(<ThreadCard id="caravan" name="The Missing Caravan" count={4} rows={ROWS} />);
    const c = card();
    const terms = within(c).getAllByRole('term');
    expect(terms.map(t => t.textContent)).toEqual(['12 дней', 'сейчас', 'часы', 'секрет', 'каскад']);
    for (const t of terms) expect(t).toHaveClass('type-key', 'uppercase', 'text-t2', 'truncate');
    const rowOf = (key: string) => c.querySelector(`[data-row="${key}"]`) as HTMLElement;
    expect(rowOf('age')).toHaveClass('grid-cols-[72px_1fr]');
    const defOf = (key: string) => within(rowOf(key)).getByRole('definition');
    expect(defOf('age')).toHaveClass('type-body-sm', 'text-t2');
    expect(defOf('now')).toHaveClass('type-body-sm', 'text-tx');
    expect(defOf('clock')).toHaveClass('text-src-sim');
    expect(defOf('cascade')).toHaveClass('text-gd');
    expect(defOf('secret')).toHaveClass('text-tx');
    expect(defOf('now')).toHaveTextContent('Zhentarim усилились, цены на железо +10%');
  });

  it('секретная строка: data-secret, текст приглушён op-hidden-from-players, глаз hidden цветом src-players вне приглушённого куска', () => {
    render(<ThreadCard id="caravan" name="The Missing Caravan" count={4} rows={ROWS} />);
    const row = card().querySelector('[data-row="secret"]') as HTMLElement;
    expect(row).toHaveAttribute('data-secret', 'true');
    const eye = within(row).getByRole('img', { name: 'Скрыто от игроков' });
    expect(eye.querySelector('path[fill*="--src-players"]')).not.toBeNull();
    expect(pathsOf(eye)).toEqual(tonePaths(ICONS.hidden).filter(Boolean));
    const text = within(row).getByText('некромант — бывший ученик из Дома Зари');
    expect(text).toHaveClass('opacity-(--op-hidden-from-players)');
    expect(text.contains(eye)).toBe(false);
    // Обычная строка — без глаза и без приглушения.
    const now = card().querySelector('[data-row="now"]') as HTMLElement;
    expect(now).not.toHaveAttribute('data-secret');
    expect(within(now).queryByRole('img')).toBeNull();
    expect(within(now).getByText(/Zhentarim/).className).not.toContain('opacity');
  });

  it('без строк списка нет вовсе — только шапка', () => {
    render(<ThreadCard id="t" name="Old Owl Well" count={0} rows={[]} />);
    const c = screen.getByRole('region', { name: 'Нить: Old Owl Well' });
    expect(c.querySelector('dl')).toBeNull();
    expect(c.querySelector('[data-part="head"]')).not.toBeNull();
    expect(c.children).toHaveLength(1);
  });

  it('onSelect: шапка — кнопка «Фильтр по нити: имя», клик отдаёт id; выбранная — aria-current, aria-pressed и кольцо glow-gold поверх полосы', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ThreadCard id="caravan" name="The Missing Caravan" count={4} rows={ROWS} onSelect={onSelect} />);
    const btn = within(card()).getByRole('button', { name: 'Фильтр по нити: The Missing Caravan' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveAttribute('data-part', 'head');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveClass('cursor-pointer', 'w-full');
    expect(btn.className).toContain('from-pl');
    expect(within(btn).getByTitle('Записей по нити')).toHaveTextContent('4 записи');
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith('caravan');
    expect(within(card()).getAllByRole('button')).toHaveLength(1);
    rerender(<ThreadCard id="caravan" name="The Missing Caravan" count={4} rows={ROWS} onSelect={onSelect} selected />);
    expect(card()).toHaveAttribute('aria-current', 'true');
    expect(card().className).toContain('shadow-[var(--bevel),inset_3px_0_0_var(--gd),var(--glow-gold)]');
    expect(within(card()).getByRole('button', { name: 'Фильтр по нити: The Missing Caravan' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('сторож: t3 на карточке нет вовсе (шапка — плита pl), нет hex, rounded, эмодзи; у каждой иконки title; className уходит на section', () => {
    render(<ThreadCard id="caravan" name="The Missing Caravan" count={4} rows={ROWS} onSelect={() => {}} selected className="mb-2" />);
    const c = card();
    expect(c).toHaveClass('mb-2');
    for (const el of [c, ...c.querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
    }
    for (const icon of c.querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
    expect(c.textContent).not.toMatch(EMOJI);
  });
});
