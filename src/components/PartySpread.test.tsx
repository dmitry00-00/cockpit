import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PartySpread, type PartySpreadItem } from './PartySpread';

const item = (n: number): PartySpreadItem => ({ id: `p${n}`, name: `Герой ${n}`, spine: <span>Заголовок {n}</span>, card: <div>Карточка {n}</div> });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
const info = () => screen.getByRole('button', { name: /Информация о партии/ });
const stage = () => screen.getByRole('region', { name: /^(Линия|Карточки) партии$/ });
const cards = () => within(stage()).getAllByRole('article');
const next = () => screen.getByRole('button', { name: 'Следующая страница участников' });
const prev = () => screen.getByRole('button', { name: 'Предыдущая страница участников' });

function Harness({ list, card, initialExpanded = false }: { list: PartySpreadItem[]; card?: ReactNode; initialExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [selected, setSelected] = useState<string>();
  return <PartySpread items={card ? list.map(x => ({ ...x, card })) : list} selectedId={selected} onSelect={setSelected} expanded={expanded} onExpandedChange={setExpanded} context={<p>Запас партии</p>} />;
}

describe('PartySpread: общее раскрытие и keyed slots', () => {
  it('корешок выбирает участника, но не раскрывает карточки; кнопка раскрывает все четыре и повторно скрывает', () => {
    const onSelect = vi.fn();
    const onExpandedChange = vi.fn();
    const { rerender } = render(<PartySpread items={items(4)} expanded={false} onSelect={onSelect} onExpandedChange={onExpandedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Герой 2' }));
    expect(onSelect).toHaveBeenCalledWith('p2');
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(stage()).toHaveAccessibleName('Линия партии');
    expect(stage().querySelectorAll('article')).toHaveLength(4);
    expect(within(stage()).queryAllByRole('article')).toHaveLength(0);
    fireEvent.click(info());
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    rerender(<PartySpread items={items(4)} selectedId="p2" expanded onSelect={onSelect} onExpandedChange={onExpandedChange} context={<p>Запас партии</p>} />);
    expect(info()).toHaveAttribute('aria-expanded', 'true');
    expect(cards()).toHaveLength(4);
    fireEvent.click(within(stage()).getByRole('button', { name: /Партия сейчас/ }));
    expect(within(stage()).getByText('Запас партии')).toBeInTheDocument();
    expect(stage().querySelector('.party-spread-spine-btn[aria-label="Герой 2"]')).toHaveAttribute('hidden');
    rerender(<PartySpread items={items(4)} selectedId="p2" expanded={false} onSelect={onSelect} onExpandedChange={onExpandedChange} />);
    expect(stage()).toHaveAccessibleName('Линия партии');
    expect(within(stage()).queryAllByRole('article')).toHaveLength(0);
    expect(stage().querySelectorAll('article')).toHaveLength(4);
  });

  it('на мобильном раскрывает одну выбранную карточку, оставляя портретные переключатели доступными', () => {
    const onSelect = vi.fn();
    const list = items(4).map(x => ({ ...x, spine: <span data-testid={`portrait-${x.id}`}>Портрет {x.id}</span> }));
    const { rerender } = render(<PartySpread items={list} mobile selectedId="p2" expanded onSelect={onSelect} onExpandedChange={() => {}} />);

    expect(stage()).toHaveAccessibleName('Карточки партии');
    expect(cards()).toHaveLength(1);
    expect(within(stage()).getByRole('article', { name: 'Герой 2' })).toBeInTheDocument();
    expect(within(stage()).getAllByRole('button')).toHaveLength(4);
    expect(within(stage()).getByRole('button', { name: 'Герой 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(stage()).getByTestId('portrait-p2')).toBeInTheDocument();
    expect(stage().querySelector('article[aria-label="Герой 1"]')).toHaveAttribute('hidden');

    fireEvent.click(within(stage()).getByRole('button', { name: 'Герой 3' }));
    expect(onSelect).toHaveBeenCalledWith('p3');
    rerender(<PartySpread items={list} mobile selectedId="p3" expanded onSelect={onSelect} onExpandedChange={() => {}} />);
    expect(cards()).toHaveLength(1);
    expect(within(stage()).getByRole('article', { name: 'Герой 3' })).toBeInTheDocument();
    expect(stage().querySelector('article[aria-label="Герой 2"]')).toHaveAttribute('hidden');
  });

  it('оставляет тему интерфейса общей, не добавляя локальные переключатели в раскладку партии', () => {
    render(<PartySpread items={items(2)} expanded onSelect={() => {}} onExpandedChange={() => {}} />);
    expect(screen.queryByRole('radio', { name: 'Плоская 2D' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Материалы' })).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it.each([0, 1, 4, 6])('%i участников: компактный вариант и общий предел шесть', count => {
    render(<Harness list={items(count)} />);
    expect(info()).toHaveAccessibleName(`Информация о партии ${count}`);
    if (!count) { expect(screen.queryByRole('region')).toBeNull(); return; }
    expect(within(stage()).getAllByRole('button')).toHaveLength(count);
    fireEvent.click(info());
    expect(cards()).toHaveLength(count);
    expect(screen.queryByRole('button', { name: 'Следующая страница участников' })).toBeNull();
  });

  it('сворачивание и пагинация сохраняют черновики, карточки остаются смонтированы', () => {
    const list = items(8).map(x => x.id === 'p1' ? { ...x, card: <input aria-label="Черновик" /> } : x);
    const { rerender } = render(<PartySpread items={list} expanded onSelect={() => {}} onExpandedChange={() => {}} />);
    const draft = within(stage()).getByRole('textbox', { name: 'Черновик' });
    fireEvent.change(draft, { target: { value: 'заметка' } });
    expect(stage().querySelectorAll('article')).toHaveLength(8);
    expect(cards()).toHaveLength(6);
    fireEvent.click(next());
    expect(cards()).toHaveLength(2);
    expect(stage().querySelector('li')).toHaveAttribute('hidden');
    fireEvent.click(prev());
    expect(within(stage()).getByRole('textbox', { name: 'Черновик' })).toBe(draft);
    rerender(<PartySpread items={list} expanded={false} onSelect={() => {}} onExpandedChange={() => {}} />);
    expect(stage().querySelectorAll('article')).toHaveLength(8);
    rerender(<PartySpread items={list} expanded onSelect={() => {}} onExpandedChange={() => {}} />);
    expect(within(stage()).getByRole('textbox', { name: 'Черновик' })).toHaveValue('заметка');
  });

  it('сокращение 8→5 на последней странице зажимает страницу и сохраняет все пять', () => {
    const { rerender } = render(<PartySpread items={items(8)} expanded onSelect={() => {}} onExpandedChange={() => {}} />);
    fireEvent.click(next());
    rerender(<PartySpread items={items(5)} expanded onSelect={() => {}} onExpandedChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Следующая страница участников' })).toBeNull();
    expect(cards()).toHaveLength(5);
    expect(within(stage()).getByRole('article', { name: 'Герой 5' })).toBeInTheDocument();
  });

  it('пустой context не отображается; Esc сворачивает только вне полей/диалогов', () => {
    const onExpandedChange = vi.fn();
    const list: PartySpreadItem[] = [{ ...item(1), card: <div><input aria-label="Поле" /><button>Действие</button></div> }];
    const { rerender } = render(<PartySpread items={list} expanded onSelect={() => {}} onExpandedChange={onExpandedChange} context={null} />);
    expect(screen.queryByText('Запас партии')).toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Поле' }), { key: 'Escape' });
    expect(onExpandedChange).not.toHaveBeenCalled();
    const action = screen.getByRole('button', { name: 'Действие' });
    action.focus();
    fireEvent.keyDown(action, { key: 'Escape' });
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(info()).toHaveFocus();
    rerender(<PartySpread items={list} expanded onSelect={() => {}} onExpandedChange={onExpandedChange} />);
  });

  it('открывает отдельную стопку на текущем участнике и оставляет доступной только его полную карту', () => {
    const list = items(4).map(card => ({ ...card, card: <button type="button">Действие {card.name}</button> }));
    render(<PartySpread items={list} selectedId="p2" expanded={false} onSelect={() => {}} onExpandedChange={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Открыть колоду персонажей, 4 карт' });
    fireEvent.click(trigger);
    const deck = screen.getByRole('region', { name: 'Колода карточек' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(deck).getByRole('img', { name: 'Стопка из 4 карточек' })).toBeInTheDocument();
    expect(within(deck).getByRole('group', { name: 'Выбрать лицевую карту' })).toBeInTheDocument();
    const frontEdge = deck.querySelector('.party-spread-deck-edge[data-front="true"]');
    expect(frontEdge).toHaveTextContent('Герой 2');
    expect(Number((frontEdge as HTMLElement).style.zIndex)).toBe(4);
    expect(within(deck).getByRole('article', { name: 'Герой 2' })).toBeInTheDocument();
    expect(within(deck).getAllByRole('article')).toHaveLength(1);
    expect(within(deck).getByRole('button', { name: 'Действие Герой 2' })).toBeInTheDocument();
    expect(within(deck).queryByRole('button', { name: 'Действие Герой 1' })).toBeNull();
    expect(deck.querySelectorAll('article')).toHaveLength(4);
    expect(deck.querySelector('article[aria-label="Герой 1"]')).toHaveAttribute('hidden');
    expect(deck.querySelector('article[aria-label="Герой 1"]')).toHaveAttribute('inert');
    expect(within(deck).queryByRole('article', { name: 'Герой 1' })).toBeNull();
  });

  it('выбор ребра меняет лицевую карту без дублирования или раскрытия партии', () => {
    const onExpandedChange = vi.fn();
    render(<PartySpread items={items(3)} expanded={false} onSelect={() => {}} onExpandedChange={onExpandedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть колоду персонажей, 3 карт' }));
    const deck = screen.getByRole('region', { name: 'Колода карточек' });
    fireEvent.click(within(deck).getByRole('button', { name: 'Герой 3' }));
    expect(within(deck).getByRole('article', { name: 'Герой 3' })).toBeInTheDocument();
    expect(within(deck).getAllByRole('article')).toHaveLength(1);
    expect(deck.querySelectorAll('article')).toHaveLength(3);
    expect(deck.querySelector('article[aria-label="Герой 1"]')).toHaveAttribute('hidden');
    expect(within(deck).getByRole('button', { name: 'Герой 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it('сворачивает D17-раскладку перед открытием стопки', () => {
    render(<Harness list={items(4)} initialExpanded />);
    expect(info()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(stage()).getByRole('button', { name: /Партия сейчас/ }));
    expect(within(stage()).getByText('Запас партии')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть колоду персонажей, 4 карт' }));
    expect(info()).toHaveAttribute('aria-expanded', 'false');
    const deck = screen.getByRole('region', { name: 'Колода карточек' });
    expect(deck.querySelectorAll('article')).toHaveLength(4);
    expect(within(deck).getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByText('Запас партии')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть колоду персонажей' }));
    fireEvent.click(info());
    fireEvent.click(within(stage()).getByRole('button', { name: /Партия сейчас/ }));
    expect(within(stage()).getByText('Запас партии')).toBeInTheDocument();
  });

  it('закрывает стопку по кнопке или Escape и возвращает фокус к переключателю, не сворачивая D17', () => {
    const onExpandedChange = vi.fn();
    render(<PartySpread items={items(2)} expanded={false} onSelect={() => {}} onExpandedChange={onExpandedChange} />);
    const trigger = screen.getByRole('button', { name: 'Открыть колоду персонажей, 2 карт' });
    fireEvent.click(trigger);
    const picker = screen.getByRole('button', { name: 'Герой 2' });
    picker.focus();
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(onExpandedChange).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: 'Закрыть колоду персонажей' });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole('region', { name: 'Колода карточек' })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onExpandedChange).not.toHaveBeenCalled();
  });
});
