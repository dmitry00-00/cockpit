// ConcentrationForm: поле заклинания, сроки SRD переключателем (1 мин по умолчанию), «Начать» и Enter отдают
// заклинание и срок в секундах (без срока — undefined); пустое заклинание — кнопка недоступна; текущее
// заклинание названо строкой «Сменит: …», без него строки нет.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CONCENTRATION_DURATIONS, ConcentrationForm } from './ConcentrationForm';

const spellField = () => screen.getByRole('textbox', { name: 'Заклинание' });

describe('ConcentrationForm', () => {
  it('шесть сроков SRD, «1 мин» по умолчанию; «Начать» недоступна без заклинания; с ним — отдаёт заклинание и 60 с', () => {
    const onStart = vi.fn();
    render(<ConcentrationForm onStart={onStart} />);
    const group = screen.getByRole('radiogroup', { name: 'Срок' });
    expect(group.querySelectorAll('button')).toHaveLength(CONCENTRATION_DURATIONS.length);
    expect(group.querySelector('[data-state="on"]')).toHaveTextContent('1 мин');
    const start = screen.getByRole('button', { name: 'Начать' });
    expect(start).toBeDisabled();
    expect(screen.queryByText(/^Сменит:/)).toBeNull();
    fireEvent.change(spellField(), { target: { value: ' Hold Person ' } });
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith('Hold Person', 60);
  });

  it('срок «1 ч» — 3600; «без срока» — undefined; Enter в поле — то же, что «Начать»; текущее названо', () => {
    const onStart = vi.fn();
    render(<ConcentrationForm current="Hunter's Mark" onStart={onStart} />);
    expect(screen.getByText("Сменит: Hunter's Mark")).toBeInTheDocument();
    fireEvent.change(spellField(), { target: { value: 'Bless' } });
    fireEvent.click(screen.getByRole('radio', { name: '1 ч' }));
    fireEvent.keyDown(spellField(), { key: 'Enter' });
    expect(onStart).toHaveBeenLastCalledWith('Bless', 3600);
    fireEvent.click(screen.getByRole('radio', { name: 'без срока' }));
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    expect(onStart).toHaveBeenLastCalledWith('Bless', undefined);
  });

  it('с листа (ROADMAP 5.5): щелчок ставит имя и срок SRD; срок вне ряда — своей кнопкой; ввод руками остаётся', () => {
    const onStart = vi.fn();
    render(<ConcentrationForm onStart={onStart} options={[
      { id: 'hunters-mark', name: "Hunter's Mark", duration: 'Up to 1 hour', durationSec: 3600 },
      { id: 'blade-ward', name: 'Odd Spell', duration: 'Up to 1 round', durationSec: 6 },
    ]} />);
    const fromSheet = screen.getByRole('group', { name: 'С листа' });
    fireEvent.click(screen.getByRole('button', { name: "Hunter's Mark" }));
    expect(screen.getByRole('button', { name: "Hunter's Mark" })).toHaveAttribute('aria-pressed', 'true');
    expect(spellField()).toHaveValue("Hunter's Mark");
    expect(screen.getByRole('radio', { name: '1 ч' })).toHaveAttribute('data-state', 'on');
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    expect(onStart).toHaveBeenLastCalledWith("Hunter's Mark", 3600);
    fireEvent.click(screen.getByRole('button', { name: 'Odd Spell' }));
    expect(screen.getByRole('radio', { name: '1 раунд' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radiogroup', { name: 'Срок' }).querySelectorAll('button')).toHaveLength(CONCENTRATION_DURATIONS.length + 1);
    expect(fromSheet.querySelectorAll('button')).toHaveLength(2);
    fireEvent.change(spellField(), { target: { value: 'Ring of Something' } });
    expect(screen.getByRole('button', { name: 'Odd Spell' })).toHaveAttribute('aria-pressed', 'false');
  });
});
