// Ряд иконок со ссылкой: в раскрытом тексте — «Карточка», если страница дала вход OpenEntityContext; без входа кнопки нет.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenEntityContext } from './openEntity';
import { SheetSpells } from './SheetSections';

const sheet = { spellcasting: { ability: 'int', saveDc: 13, attack: 5, kind: 'spellbook', maxLevel: 1, cantrips: ['fire-bolt'], spells: [], always: [] } } as const;

describe('IconGrid: «Карточка» по ссылке', () => {
  it('заговор листа открывает spell:fire-bolt через вход страницы', () => {
    const open = vi.fn();
    render(<OpenEntityContext.Provider value={open}><SheetSpells sheet={sheet} /></OpenEntityContext.Provider>);
    fireEvent.click(within(screen.getByRole('list', { name: 'Заговоры' })).getByRole('button', { name: /^Fire Bolt/ }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Fire Bolt' })).getByRole('button', { name: 'Карточка' }));
    expect(open).toHaveBeenCalledWith('spell:fire-bolt');
  });

  it('без входа страницы кнопки «Карточка» нет — текст раскрывается как раньше', () => {
    render(<SheetSpells sheet={sheet} />);
    fireEvent.click(within(screen.getByRole('list', { name: 'Заговоры' })).getByRole('button', { name: /^Fire Bolt/ }));
    expect(within(screen.getByRole('region', { name: 'Fire Bolt' })).queryByRole('button', { name: 'Карточка' })).toBeNull();
  });
});
