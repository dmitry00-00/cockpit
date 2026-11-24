// Персонаж как путь (Д8) и Q10 на столе: вкладка «Путь» — 20 ступеней, нынешняя отмечена; у мастера — повышение:
// CHARACTER_LEVELED, уровень в бейдже, Ctrl+Z возвращает; пробел паспорта — кнопкой, запись — SHEET_EDITED с причиной;
// в сводке партии — возможности по уровням; у игроков формы повышения нет.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cardOf, lastEvent, mount, rowOf, tab } from './testkit';

describe('путь персонажа и повышение (Д8, Q10)', () => {
  it('сравнение ветви и будущего уровня не пишет событий и не меняет лист', () => {
    const { store } = mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    tab('Путь');
    const before = store.getState();
    const card = cardOf('Korrin Battlehammer');
    const select = within(card).getByRole('combobox', { name: 'Подкласс для просмотра' });
    const other = [...select.querySelectorAll('option')].find(o => o.value && o.value !== (select as HTMLSelectElement).value)!;
    fireEvent.change(select, { target: { value: other.value } });
    fireEvent.click(within(card).getByRole('button', { name: 'Уровень 20: сводка' }));
    expect(within(card).getByRole('region', { name: 'Описание развития' })).toHaveTextContent('Сводка 20-го уровня');
    expect(store.getState().events).toBe(before.events);
    expect(store.getState().state).toBe(before.state);
    expect(card.querySelector('[data-part="level-up"]')).not.toHaveAttribute('open');
  });

  it('«Путь» Korrin: 20 ступеней, 5-я — нынешняя; «Повысить» с +2 STR — 6-й уровень; Ctrl+Z — снова 5-й', () => {
    const { store } = mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    tab('Путь');
    const card = cardOf('Korrin Battlehammer');
    const path = within(card).getByRole('list', { name: 'Путь: Воин' });
    expect(within(path).getAllByRole('listitem')).toHaveLength(20);
    expect(path.querySelector('[aria-current="step"]')).toHaveAttribute('data-level', '5');
    expect(within(card).getByText('Следующий уровень (6-й) даст: увеличение характеристик или черта')).toBeInTheDocument();
    fireEvent.click(within(card).getByText('Повысить персонажа до 6-го уровня'));
    const form = within(card).getByRole('form', { name: 'Повышение до 6-го уровня' });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Характеристика' }), { target: { value: 'str' } });
    const str = store.getState().state.actors.korrin.sheet!.abilities.str;
    fireEvent.click(within(form).getByRole('button', { name: 'Повысить' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CHARACTER_LEVELED', payload: { actorId: 'korrin', sheet: { level: 6 }, hp: { method: 'average', value: 6 } } });
    expect(store.getState().state.actors.korrin.sheet!.abilities.str).toBe(str + 2);
    expect(card).toHaveTextContent('6 ур.');
    expect(card.querySelector('form[aria-label="Повышение до 6-го уровня"]')).toBeNull();
    expect(card.querySelectorAll('[data-part="path"]')).toHaveLength(1);
    expect(card.querySelectorAll('form[aria-label="Повышение до 7-го уровня"]')).toHaveLength(1);
    expect(within(card).getByRole('list', { name: 'Путь: Воин' }).querySelector('[aria-current="step"]')).toHaveAttribute('data-level', '6');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(store.getState().state.actors.korrin.sheet!.level).toBe(5);
    expect(store.getState().state.actors.korrin.sheet!.abilities.str).toBe(str);
  });

  it('пробел паспорта — кнопкой: значение и причина → SHEET_EDITED; пробела больше нет, предыстория — текстом', () => {
    const { store } = mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    const passport = () => cardOf('Korrin Battlehammer').querySelector('[data-part="passport"]') as HTMLElement;
    expect(within(passport()).getAllByRole('button').map(b => b.textContent)).toEqual(['мировоззрение', 'рост', 'вес', 'возраст', 'родом из']);
    expect(passport()).toHaveTextContent('возраст, родом из, предыстория');
    fireEvent.click(within(passport()).getByRole('button', { name: 'мировоззрение' }));
    const form = screen.getByRole('form', { name: 'Заполнить: мировоззрение' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'мировоззрение' }), { target: { value: 'Законно-добрый' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Записать' }));
    expect(lastEvent(store)).toMatchObject({ type: 'SHEET_EDITED', payload: { actorId: 'korrin', patch: { alignment: 'Законно-добрый' }, reason: 'со слов игрока' } });
    expect(within(passport()).queryByRole('button', { name: 'мировоззрение' })).toBeNull();
    fireEvent.click(within(passport()).getByRole('button', { name: 'возраст' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'возраст' }), { target: { value: 'сто' } });
    expect(within(screen.getByRole('form', { name: 'Заполнить: возраст' })).getByRole('button', { name: 'Записать' })).toBeDisabled();
  });

  it('«Родом из» выбирается из держав и открывает ссылку kingdom: в карточке', async () => {
    const { store } = mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    const passport = cardOf('Korrin Battlehammer').querySelector('[data-part="passport"]') as HTMLElement;
    fireEvent.click(within(passport).getByRole('button', { name: 'родом из' }));
    const form = await screen.findByRole('form', { name: 'Заполнить: родом из' });
    await within(form).findByRole('option', { name: 'Cormyr' });
    fireEvent.change(within(form).getByRole('combobox', { name: 'родом из' }), { target: { value: 'cormyr' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Записать' }));
    expect(lastEvent(store)).toMatchObject({ type: 'SHEET_EDITED', payload: { actorId: 'korrin', patch: { homeland: 'kingdom:cormyr' } } });
    expect(await screen.findByTitle('Открыть карточку державы: Cormyr')).toBeInTheDocument();
  });

  it('сводка партии: возможности — лечение есть, ловушки — ни у кого; у игроков формы повышения нет', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Сводка партии 4' }));
    const caps = within(screen.getByRole('region', { name: 'Сводка партии 4' })).getByRole('list', { name: 'Возможности партии' });
    expect(caps.querySelector('[data-capability="healing"]')).toHaveAttribute('data-covered', 'true');
    expect(caps.querySelector('[data-capability="traps"]')).toHaveTextContent('нет: снятие ловушекни у кого');
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    fireEvent.click(rowOf('Korrin Battlehammer'));
    tab('Путь');
    expect(within(cardOf('Korrin Battlehammer')).queryByRole('form', { name: /^Повышение/ })).toBeNull();
    expect(within(cardOf('Korrin Battlehammer')).getByRole('list', { name: 'Путь: Воин' })).toBeInTheDocument();
  });
});
