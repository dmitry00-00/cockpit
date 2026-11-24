// RestForm: два вида отдыха переключателем (короткий по умолчанию); строки с галочкой «отдыхает» (все включены),
// хитами и — на коротком — костями по листу: число костей, хиты за них, «Бросить» пишет итог; строка без листа
// отдыхает без костей; на долгом — строка «что случится»; «Отдохнуть» и Enter отдают вид, кто и кости; недоступна
// без единого отдыхающего или при незаполненных хитах за кости; кости выше запаса не проходят.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RestForm, diceFormula, parseDice, parseHealed, type RestRow } from './RestForm';

const ROWS: RestRow[] = [
  { id: 'bo', name: 'Bo Tambernack', kind: 'pc', hp: { current: 41, max: 49, temp: 0 }, hitDice: { die: 10, available: 5, total: 5 }, conMod: 3 },
  { id: 'lyra', name: 'Lyra Moonwhisper', kind: 'pc', hp: { current: 32, max: 32, temp: 0 }, hitDice: { die: 6, available: 2, total: 5 }, conMod: 1, exhaustion: 2 },
  { id: 'guide', name: 'Проводник', kind: 'npc', hp: { current: 4, max: 9, temp: 3 }, conMod: 0 },
];

const field = (label: string) => screen.getByRole('textbox', { name: label });

describe('parseDice, parseHealed, diceFormula', () => {
  it('кости: пусто — 0, число в запасе — оно, выше запаса или мусор — null; хиты: целое, иначе null; формула с CON за кость', () => {
    expect(parseDice('', 5)).toBe(0);
    expect(parseDice('3', 5)).toBe(3);
    expect(parseDice('6', 5)).toBeNull();
    expect(parseDice('x', 5)).toBeNull();
    expect(parseHealed('13')).toBe(13);
    expect(parseHealed('')).toBeNull();
    expect(diceFormula(2, 10, 3)).toBe('2d10+6');
    expect(diceFormula(1, 6, -1)).toBe('1d6-1');
    expect(diceFormula(1, 8, 0)).toBe('1d8');
  });
});

describe('RestForm', () => {
  it('короткий по умолчанию: все отдыхают, у строк с листом — кости и поля, у NPC без листа — нет; «Отдохнуть» без костей отдаёт всех и пустой список', () => {
    const onRest = vi.fn();
    render(<RestForm rows={ROWS} onRoll={() => 0} onRest={onRest} />);
    expect(screen.getByRole('radiogroup', { name: 'Вид отдыха' }).querySelector('[data-state="on"]')).toHaveTextContent('Короткий · 1 ч');
    expect(screen.getByTitle('Отдыхают')).toHaveTextContent('3 из 3');
    const list = screen.getByRole('list', { name: 'Кто отдыхает' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(list).getAllByRole('checkbox').every(c => (c as HTMLInputElement).checked)).toBe(true);
    expect(within(list).getByText('d10 · 5')).toBeInTheDocument();
    expect(within(list).getByText('4/9 +3')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Кости хитов: Проводник' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Отдохнуть' }));
    expect(onRest).toHaveBeenCalledWith('short', ['bo', 'lyra', 'guide'], [], { layer: 'srd', haven: false });
  });

  it('кости → «Бросить» зовёт onRoll с формулой класса и CON и пишет итог в хиты; без хитов за кости «Отдохнуть» недоступна; кости выше запаса — тоже', () => {
    const onRoll = vi.fn(() => 14);
    const onRest = vi.fn();
    render(<RestForm rows={ROWS} onRoll={onRoll} onRest={onRest} />);
    const rest = screen.getByRole('button', { name: 'Отдохнуть' });
    expect(screen.getByRole('button', { name: 'Бросить: Bo Tambernack' })).toBeDisabled();
    fireEvent.change(field('Кости хитов: Bo Tambernack'), { target: { value: '2' } });
    expect(rest).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Бросить: Bo Tambernack' }));
    expect(onRoll).toHaveBeenCalledWith('2d10+6', 'Кости хитов · Bo Tambernack');
    expect(field('Хиты: Bo Tambernack')).toHaveValue('14');
    fireEvent.change(field('Кости хитов: Lyra Moonwhisper'), { target: { value: '3' } });
    expect(rest).toBeDisabled(); // запас Lyra — 2
    fireEvent.change(field('Кости хитов: Lyra Moonwhisper'), { target: { value: '1' } });
    fireEvent.change(field('Хиты: Lyra Moonwhisper'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Отдыхает: Проводник' }));
    fireEvent.keyDown(field('Хиты: Lyra Moonwhisper'), { key: 'Enter' });
    expect(onRest).toHaveBeenCalledWith('short', ['bo', 'lyra'], [{ actorId: 'bo', dice: 2, healed: 14 }, { actorId: 'lyra', dice: 1, healed: 5 }], { layer: 'srd', haven: false });
  });

  it('долгий: строка «что случится» вместо костей; никто не отдыхает — кнопка недоступна; «Отдохнуть» отдаёт long без костей', () => {
    const onRest = vi.fn();
    render(<RestForm rows={ROWS} onRoll={() => 0} onRest={onRest} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Долгий · 8 ч' }));
    const notes = screen.getAllByText(/./, { selector: '[data-part="long-note"]' }).map(n => n.textContent);
    expect(notes).toEqual(['хиты полны', '+2 костей хитов, истощение 2 → 1', 'хиты полны']);
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const c of screen.getAllByRole('checkbox')) fireEvent.click(c);
    expect(screen.getByRole('button', { name: 'Отдохнуть' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Отдыхает: Bo Tambernack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отдохнуть' }));
    expect(onRest).toHaveBeenCalledWith('long', ['bo'], [], { layer: 'srd', haven: false });
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('A5E long-rest attempt records duration and exposes the reset outcome above one hour of strenuous interruption', () => {
    const onRest = vi.fn();
    render(<RestForm rows={ROWS} supplyAvailable={3} restLayer="a5e" onRoll={() => 0} onRest={onRest} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Долгий · 8 ч' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Длительность отдыха, ч' }), { target: { value: '9' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Прерывание отдыха, мин' }), { target: { value: '61' } });

    expect(screen.getByText(/Свыше 60 минут напряжённой активности сбрасывают период/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отдохнуть' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Отдохнуть' }));
    expect(onRest).toHaveBeenCalledWith('long', ['bo', 'lyra', 'guide'], [], expect.objectContaining({
      layer: 'a5e', haven: false, a5eTiming: 'period-v2', a5eDurationHours: 9, a5eSleepHours: 6, a5eStrenuousMinutes: 61,
    }));
  });

  it('A5E long-rest form records sleep below six hours and explains that recovery will not apply', () => {
    const onRest = vi.fn();
    render(<RestForm rows={ROWS} supplyAvailable={3} restLayer="a5e" onRoll={() => 0} onRest={onRest} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Долгий · 8 ч' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Сон во время отдыха, ч' }), { target: { value: '5' } });

    expect(screen.getByText(/Для отдыха нужно не меньше 6 часов сна/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отдохнуть' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Отдохнуть' }));
    expect(onRest).toHaveBeenCalledWith('long', ['bo', 'lyra', 'guide'], [], expect.objectContaining({
      layer: 'a5e', a5eTiming: 'period-v2', a5eDurationHours: 8, a5eSleepHours: 5, a5eStrenuousMinutes: 0,
    }));
  });
});
