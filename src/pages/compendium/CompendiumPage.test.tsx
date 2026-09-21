import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CompendiumPage } from './CompendiumPage';
import { RACES, CLASSES } from '../../rules/compendium';

describe('экран «Компендиум»', () => {
  it('открывается на матрице рас: каждая SRD-раса видна по русскому и английскому имени', () => {
    render(<CompendiumPage />);
    for (const r of RACES.filter(x => x.source === 'srd')) {
      expect(screen.getAllByText(r.nameRu).length).toBeGreaterThan(0);
      expect(screen.getAllByText(r.name).length).toBeGreaterThan(0);
    }
  });

  it('снятие источника «книга» убирает книжные подрасы и оставляет SRD', () => {
    render(<CompendiumPage />);
    expect(screen.getAllByText('Прохода').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'книга' }));
    expect(screen.queryByText('Прохода')).toBeNull();
    expect(screen.getAllByText('High Elf').length).toBeGreaterThan(0);
  });

  it('клик по клетке открывает текст черты в панели подробностей, повторный — закрывает', () => {
    render(<CompendiumPage />);
    const dwarf = RACES.find(r => r.name === 'Dwarf')!;
    const trait = dwarf.traits.find(t => t.text.length > 20)!;
    fireEvent.click(screen.getByRole('button', { name: trait.name }));
    const pane = screen.getByRole('complementary', { name: 'Подробности' });
    expect(within(pane).getByText(trait.name)).toBeInTheDocument();
    expect(pane.textContent).toContain(trait.text.slice(0, 40));
    fireEvent.click(screen.getByRole('button', { name: trait.name }));
    expect(within(pane).queryByText(trait.name)).toBeNull();
  });

  it('вкладка классов: переключение класса меняет колонки подклассов', () => {
    render(<CompendiumPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Уровни × подклассы' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Волшебник' }));
    const wizard = CLASSES.find(c => c.name === 'Wizard')!;
    for (const s of wizard.subclasses) expect(screen.getAllByText(s.name).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Жрец' }));
    const cleric = CLASSES.find(c => c.name === 'Cleric')!;
    expect(screen.getAllByText(cleric.subclasses[0].name).length).toBeGreaterThan(0);
    expect(screen.getAllByText('+6').length).toBeGreaterThan(0); // бонус мастерства 17–20
  });

  it('вкладка черт: поиск сужает список', () => {
    render(<CompendiumPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Черты × эффекты' }));
    expect(screen.getAllByText('Grappler').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText('название или текст'), { target: { value: 'Grappler' } });
    expect(screen.getByText(/^1 черт/)).toBeInTheDocument();
  });

  it('в разметке нет эмодзи', () => {
    const { container } = render(<CompendiumPage />);
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
