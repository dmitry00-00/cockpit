// Место как сцена (Д2, ROADMAP 6.2): вкладка «Сейчас» в карточке места — Neverwinter 15 Mirtul 1492 DR: Selûne,
// погода, боги места, вражды организаций, цены со ждущим, ликантропы Neverwinter Wood; строка открывает карточку;
// шаг «Десятидневка» — сцена другого дня; глазами игроков — только открытое. Событий вкладка не пишет.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cardOf, down, mount, step, tab, tempoGroup, openTimeControls } from './testkit';

const section = (name: string) => within(cardOf('Neverwinter')).findByRole('region', { name });

describe('место как сцена (Д2)', () => {
  it('«Сейчас» у Neverwinter: день, вера, силы, люди, рынок и округа со ждущим, нить, канон; строка — карточка; событий нет', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    down();
    tab('Сейчас');
    const now = await section('Сейчас');
    expect(now).toHaveTextContent('15 Mirtul 1492 DR');
    expect(now).toHaveTextContent(/Selûne\s*растёт · полнолуние через 3 дн\./);
    const faith = await section('Вера');
    expect(within(faith).getByRole('button', { name: 'Helm' })).toBeInTheDocument();
    const powers = await section('Силы');
    expect(powers).toHaveTextContent(/Neverwinter's Rangers\s*и\s*Ashmadai\s*враги по вики/);
    expect(await section('Люди')).toHaveTextContent(/ещё \d+/);
    expect(await section('Рынок')).toHaveTextContent(/оружие\s*\+10%\s*ждёт: \+20%/);
    const around = await section('Округа');
    expect(around).toHaveTextContent(/Werewolf\s*Neverwinter Wood ×1\s*ждёт: ×2/);
    expect(around).toHaveTextContent('Urban Township');
    expect(await section('Нити')).toHaveTextContent('The Missing Caravan');
    const canon = await section('Канон места');
    expect(canon.querySelector('[lang="en"]')).toHaveTextContent(/Neverwinter/);
    expect(store.getState().events.length).toBe(before);

    // Строка — ссылка: Helm открывает карточку бога.
    fireEvent.click(within(faith).getByRole('button', { name: 'Helm' }));
    expect(await screen.findByRole('region', { name: 'Helm' })).toBeInTheDocument();
  });

  it('шаг «Десятидневка» — сцена 25 Mirtul: Selûne уже после полнолуния', async () => {
    mount();
    down();
    tab('Сейчас');
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Другие темпы' }));
    fireEvent.click(within(tempoGroup()).getByRole('radio', { name: /Десятидневка/ }));
    await step();
    // Шаг поднимает сводку «что изменилось»; Esc — обратно на стол, вкладка та же.
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    const now = await section('Сейчас');
    expect(now).toHaveTextContent('25 Mirtul 1492 DR');
    expect(now).not.toHaveTextContent('полнолуние через 3 дн.');
  });

  it('глазами игроков: только «Сейчас» и рынок без ждущего — ни вики, ни встреч, ни секретов', async () => {
    mount(undefined, false);
    down();
    tab('Сейчас');
    await section('Сейчас');
    const card = cardOf('Neverwinter');
    const sections = [...card.querySelectorAll<HTMLElement>('[data-scene]')].map(s => s.dataset.scene);
    expect(sections).toEqual(['now', 'market']);
    expect(card).not.toHaveTextContent('ждёт');
    await waitFor(() => expect(card.querySelector('[data-scene="powers"]')).toBeNull());
  });
});
