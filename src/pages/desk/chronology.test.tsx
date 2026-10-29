// «Хроника» (ROADMAP Х3): H открывает вид мастера — шкала эпох и плотности, год кампании по умолчанию, выбор года —
// линза стола (карточки справочника на этот год, плашка «Канон N DR» на карте); фильтр видов и поиск по окну шкалы;
// событий вид не пишет; у игроков вида нет.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mount } from './testkit';

const chrono = () => screen.getByRole('region', { name: 'Хроника' });
const openChrono = () => fireEvent.keyDown(window, { key: 'h', code: 'KeyH' });
const eventsOf = async (name: RegExp) => within(chrono()).findByRole('region', { name });

describe('хроника канона (Х3)', () => {
  it('H — год кампании 1492 DR и эпоха Present Age; 1479 DR — имя года, события по датам; линза — плашка на карте и карточка на год; событий нет', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    openChrono();
    const year = await within(chrono()).findByRole('spinbutton', { name: 'Год DR' });
    expect(year).toHaveValue(1492);
    expect(chrono()).toHaveTextContent('Present Age');
    expect(within(chrono()).getByText('год кампании')).toBeInTheDocument();
    expect(within(chrono()).getByRole('button', { name: 'Present Age' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(year, { target: { value: '1479' } });
    await waitFor(() => expect(chrono()).toHaveTextContent('Year of the Ageless One'));
    expect(chrono()).toHaveTextContent('Era of Upheaval');
    const list = await eventsOf(/^События 1479 DR/);
    await waitFor(() => expect(list).toHaveTextContent('The green dragon Skuthosiin sends his forces of ash giants to invade Tymanther.'));
    const invasion = list.querySelector<HTMLElement>('[data-event] p[lang="en"]')!.closest('li')!;
    expect(invasion).toHaveTextContent('Tarsakh');
    expect(invasion).toHaveTextContent('войны и конфликты');
    expect(invasion).toHaveTextContent('Источник: The Captive Flame');
    // Шкала: столбик 1470–1479 — текущий.
    expect(within(chrono()).getByRole('group', { name: 'Плотность событий' }).querySelector('[aria-current="true"]')).toHaveAccessibleName(/^1470 DR — 1479 DR: \d+ событий/);

    // Фильтр видов: «войны и конфликты» выключены — строки о вторжении нет.
    fireEvent.click(within(chrono()).getByRole('button', { name: /^войны и конфликты \d+$/ }));
    expect(list).not.toHaveTextContent('Skuthosiin sends his forces');
    fireEvent.click(within(chrono()).getByRole('button', { name: /^войны и конфликты \d+$/ }));

    // Поиск по окну шкалы: Neverwinter Wood — событие 1479 DR о Fireguard.
    fireEvent.change(within(chrono()).getByRole('searchbox', { name: 'Место, NPC, организация' }), { target: { value: 'Neverwinter Wood' } });
    const found = await eventsOf(/^Найдено в /);
    await waitFor(() => expect(found).toHaveTextContent('Fireguard Fortress'));

    // Линза: карта стола с плашкой «Канон 1479 DR»; плашка снимает линзу.
    fireEvent.click(within(chrono()).getByRole('button', { name: 'На карте' }));
    const lens = await screen.findByTitle(/^Карта и карточки справочника — канон на 1479 DR/);
    fireEvent.click(lens);
    expect(screen.queryByTitle(/^Карта и карточки справочника — канон на/)).toBeNull();
    expect(store.getState().events.length).toBe(before);
  });

  it('ссылка события открывает карточку справочника на год линзы: Skuthosiin в 1479 DR', async () => {
    mount();
    openChrono();
    fireEvent.change(await within(chrono()).findByRole('spinbutton', { name: 'Год DR' }), { target: { value: '1479' } });
    const list = await eventsOf(/^События 1479 DR/);
    const link = await within(list).findAllByRole('button', { name: 'Skuthosiin' });
    fireEvent.click(link[0]);
    const card = await screen.findByRole('region', { name: 'Skuthosiin' });
    await waitFor(() => expect(card).toHaveTextContent('в 1479 DR'));
  });

  it('у игроков вида нет: кнопки «Хроника» нет, H ничего не открывает', () => {
    mount();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.queryByRole('button', { name: /Хроника/ })).toBeNull();
    openChrono();
    expect(screen.queryByRole('region', { name: 'Хроника' })).toBeNull();
  });
});
