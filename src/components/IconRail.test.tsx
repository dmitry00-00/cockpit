// IconRail: полоса 40px с кнопками-иконками в порядке секций; имя — подпись и счётчик; активная — aria-pressed
// и золотая грань со стороны главной зоны; бирка только при счётчике; клик отдаёт id; без элементов — ничего.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconRail, type IconRailItem } from './IconRail';

const ITEMS: IconRailItem[] = [
  { id: 'actions', icon: 'reroll', label: 'Действия' },
  { id: 'inbox', icon: 'inbox', label: 'Входящие', badge: 4, color: 'var(--src-sim)' },
  { id: 'journal', icon: 'journal', label: 'Журнал', badge: 0 },
];

describe('IconRail', () => {
  it('кнопки по порядку с именами и счётчиком; активная нажата; клик отдаёт id; пустой список не рисуется', () => {
    const onOpen = vi.fn();
    render(<IconRail items={ITEMS} active="inbox" onOpen={onOpen} side="right" label="Инструменты" />);
    const nav = screen.getByRole('navigation', { name: 'Инструменты' });
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Действия', 'Входящие · 4', 'Журнал']);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(nav.querySelectorAll('[data-part="badge"]')).toHaveLength(1);
    expect(nav.querySelector('[data-part="badge"]')).toHaveTextContent('4');
    expect(buttons[1].title).toBe('Входящие · 4: свернуть');
    expect(buttons[2].title).toBe('Журнал: раскрыть панель');
    fireEvent.click(buttons[2]);
    expect(onOpen).toHaveBeenCalledWith('journal');
    expect(nav).toHaveAttribute('data-side', 'right');
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('без элементов — null', () => {
    const { container } = render(<IconRail items={[]} onOpen={() => {}} side="left" label="Партия" />);
    expect(container).toBeEmptyDOMElement();
  });
});
