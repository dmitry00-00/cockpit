// Лестница масштабов и её уровни: карта мира, справочник мест, глобус, космос.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { secOf, seedState } from '../../campaign';
import { createEngineStore, memoryStore } from '../../engine';
import { loadGazetteer } from '../../map/gazetteer';
import {
  EMOJI, mount, cardOf, lastEvent, bar, grid, startCombat, journalView, openJournal, ladderNav, stepOf, currentStep, worldView, levelHead, here,
  up, down, tempoOn,
} from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/* ---------- Лестница масштабов (шаг 10): `[` и `]` двигают уровень, точка фокуса сохраняется ---------- */

describe('лестница масштабов', () => {
  it('на старте — регион Sword Coast North: по имени текущая и соседи, дальние иконкой; «Здесь» — четыре места, на пути выбран Neverwinter', () => {
    mount();
    expect(currentStep()).toBe('region');
    expect(ladderNav().querySelectorAll('[data-scale]')).toHaveLength(8); // бой не идёт — ступени боя нет
    expect(stepOf('region')).toHaveTextContent('Sword Coast North');
    expect(stepOf('continent')).toHaveTextContent('Faerûn');
    expect(stepOf('settlement')).toHaveTextContent('Neverwinter');
    expect(stepOf('cosmology').querySelector('span')).toBeNull(); // далеко — только иконка
    expect(stepOf('region')).toHaveAttribute('title', expect.stringContaining('[ и ]'));
    expect(levelHead()).toHaveTextContent('Регион · Sword Coast North');
    expect(worldView().querySelector('[data-part="chosen"]')).toHaveTextContent('выбрано: Neverwinter');
    const rows = within(here()!).getAllByRole('button');
    // Бейдж — записей и фактов о месте: у Neverwinter заметка сида и секрет об агенте у ворот; у колодца — секрет о мертвецах.
    expect(rows.map(r => r.textContent?.replace(/^Место/, ''))).toEqual(['Neverwinter2Симуляция, ждёт решения', 'Triboar Trail1Симуляция, ждёт решения', 'Neverwinter WoodСимуляция, ждёт решения', 'Old Owl Well1']);
    expect(rows[0]).toHaveAttribute('aria-current', 'true'); // ВЫБРАНО — место пути
    expect(rows[3]).not.toHaveAttribute('aria-current');
    // Стол по умолчанию — карточка Bo, как раньше; противники рядом.
    expect(cardOf('Bo Tambernack')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Противники' })).toBeInTheDocument();
  });

  it('`]` и `[`: вниз до здания, вверх до Колеса и обратно — та же ветка; темп следует за уровнем; ни одного события в логе', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    down();
    expect(currentStep()).toBe('settlement');
    expect(levelHead()).toHaveTextContent('Поселение · Neverwinter');
    const nw = cardOf('Neverwinter');
    expect(within(nw).getByText('23k')).toBeInTheDocument();
    expect(within(nw).getByText('средняя')).toBeInTheDocument();
    expect(within(nw).getByText('+10%')).toBeInTheDocument();
    expect(within(nw).getByRole('tab', { name: 'DM' })).toBeInTheDocument(); // секрет об агенте у ворот
    expect(within(nw).getByRole('button', { name: /Sword Coast North/ })).toBeInTheDocument(); // «внутри» — ссылка вверх
    expect(within(here()!).getAllByRole('button').map(r => r.textContent)).toEqual(['МестоЮжные ворота']);
    expect(tempoOn()).toBe('Час');
    down();
    expect(currentStep()).toBe('building');
    expect(cardOf('Южные ворота')).toBeInTheDocument();
    expect(here()).toBeNull(); // у ворот детей нет — секции нет
    expect(tempoOn()).toBe('10 мин');
    down();
    expect(currentStep()).toBe('building'); // боя нет — ниже некуда
    for (const lvl of ['settlement', 'region', 'continent', 'planet', 'system', 'plane', 'cosmology', 'cosmology']) { up(); expect(currentStep()).toBe(lvl); }
    expect(levelHead()).toHaveTextContent('Космология · Великое Колесо');
    expect(tempoOn()).toBe('Год');
    expect(stepOf('building').querySelector('span')).toBeNull(); // далеко — иконка; но путь его помнит:
    for (const lvl of ['plane', 'system', 'planet', 'continent', 'region', 'settlement', 'building']) { down(); expect(currentStep()).toBe(lvl); }
    expect(cardOf('Южные ворота')).toBeInTheDocument();
    expect(store.getState().events.length).toBe(before); // навигация — не событие
  });

  it('крошка — прыжок на уровень с сохранением пути; «Здесь» — выбор места: подрегион занимает уровень региона, `[` и `]` возвращают к нему', () => {
    mount();
    fireEvent.click(stepOf('continent'));
    expect(currentStep()).toBe('continent');
    expect(cardOf('Faerûn')).toBeInTheDocument();
    const powers = screen.getByRole('group', { name: 'Державы' });
    expect(within(powers).getAllByRole('button').map(r => r.textContent)).toEqual(['ФракцияZhentarim45%Симуляция, ждёт решения', "ФракцияLords' Alliance", 'ФракцияHarpers']);
    fireEvent.click(within(powers).getByRole('button', { name: /Zhentarim/ }));
    const zh = cardOf('Zhentarim');
    expect(within(zh).getByText('45%')).toBeInTheDocument();
    expect(within(zh).getByText('+1')).toBeInTheDocument();
    expect(within(zh).getByText('контроль над Triboar Trail')).toBeInTheDocument();
    expect(currentStep()).toBe('continent'); // держава — карточка, не уровень
    fireEvent.click(stepOf('region'));
    fireEvent.click(within(here()!).getByRole('button', { name: /Triboar Trail/ }));
    expect(currentStep()).toBe('region');
    expect(levelHead()).toHaveTextContent('Регион · Triboar Trail');
    expect(cardOf('Triboar Trail')).toBeInTheDocument();
    expect(here()).toBeNull();
    expect(stepOf('settlement')).toHaveTextContent('Поселение'); // Neverwinter не внутри Triboar Trail — с пути снят
    up();
    expect(currentStep()).toBe('continent');
    down();
    expect(levelHead()).toHaveTextContent('Регион · Triboar Trail');
    expect(cardOf('Triboar Trail')).toBeInTheDocument();
  });

  it('бой — ступень лестницы: «Начать бой» ведёт на неё (сетка), `[` поднимает к зданию при живой полосе, `]` возвращает сетку; конец боя уводит со ступени, отмена конца — обратно', () => {
    const { store } = mount();
    startCombat();
    expect(currentStep()).toBe('battle');
    expect(grid()).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Поле боя' })).toBeInTheDocument();
    up();
    expect(currentStep()).toBe('building');
    expect(screen.queryByRole('group', { name: 'Боевая сетка' })).toBeNull();
    expect(bar()).toBeInTheDocument(); // полоса боя живёт, пока идёт бой
    expect(screen.queryByRole('region', { name: 'Южные ворота' })).toBeNull(); // в бою карточка — по кнопке
    fireEvent.click(screen.getByRole('button', { name: 'Карточка' }));
    expect(cardOf('Южные ворота')).toBeInTheDocument();
    down();
    expect(currentStep()).toBe('battle');
    expect(grid()).toBeInTheDocument();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Закончить бой' }));
    expect(currentStep()).toBe('building');
    expect(ladderNav().querySelector('[data-scale="battle"]')).toBeNull();
    expect(tempoOn()).toBe('10 мин');
    act(() => { store.getState().undo(); });
    expect(store.getState().state.encounter.active).toBe(true);
    expect(currentStep()).toBe('battle');
  });

  it('цель ждущего предложения пульсирует и перечисляется в карточке; решение снимает пульс; у игроков — ни пульса, ни списка, ни DM, ни темпа', () => {
    const { store } = mount();
    down();
    const nw = cardOf('Neverwinter');
    expect(nw.className).toContain('glow-sim');
    const pending = within(nw).getByRole('region', { name: 'Ждёт решения' });
    expect(within(pending).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'Симуляция, ждёт решенияЦены на железо и оружие · Neverwinter · базовые → +10%',
      'Симуляция, ждёт решенияСлух в таверне · Neverwinter · тишина → у Old Owl Well видели восставших мертвецов',
    ]);
    act(() => { store.getState().accept('d-iron-prices'); store.getState().reject('d-owl-well-rumor'); });
    expect(cardOf('Neverwinter').className).not.toContain('glow-sim');
    expect(within(cardOf('Neverwinter')).queryByRole('region', { name: 'Ждёт решения' })).toBeNull();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(currentStep()).toBe('settlement'); // лестница не секрет — уровень тот же
    const players = cardOf('Neverwinter');
    expect(within(players).queryByRole('tab', { name: 'DM' })).toBeNull();
    expect(worldView().querySelector('[data-part="level-tempo"]')).toBeNull();
    up();
    expect(currentStep()).toBe('region'); // `[` и `]` работают и у игроков
    expect(within(here()!).getByRole('button', { name: /Old Owl Well/ })).not.toHaveTextContent('ждёт решения');
    // Бейджи считают только видимое игрокам: заметка о прибытии — да, секреты о месте — нет.
    expect(within(here()!).getAllByRole('button').map(r => r.textContent?.replace(/^Место/, ''))).toEqual(['Neverwinter1', 'Triboar Trail1', 'Neverwinter Wood', 'Old Owl Well']);
    expect(document.body.innerHTML).not.toContain('Ждёт решения');
  });

  it('@упоминание места в журнале ведёт лестницу к нему на столе; @фракции — карточка державы; «внутри» в карточке поднимает на уровень выше', () => {
    const { store } = mount();
    act(() => { store.getState().note('Zhentarim следят за Old Owl Well', [], 'region'); });
    openJournal();
    fireEvent.click(within(journalView()).getByRole('button', { name: 'Открыть карточку: Old Owl Well' }));
    expect(screen.queryByRole('region', { name: 'Журнал сессии' })).toBeNull();
    expect(currentStep()).toBe('building');
    expect(levelHead()).toHaveTextContent('Здание · Old Owl Well');
    expect(within(cardOf('Old Owl Well')).getByRole('tab', { name: 'DM' })).toBeInTheDocument(); // мертвецы у колодца — секрет о месте
    fireEvent.click(within(cardOf('Old Owl Well')).getByRole('button', { name: /Sword Coast North/ }));
    expect(currentStep()).toBe('region');
    expect(cardOf('Sword Coast North')).toBeInTheDocument();
    openJournal();
    fireEvent.click(within(journalView()).getByRole('button', { name: 'Открыть карточку: Zhentarim' }));
    expect(cardOf('Zhentarim')).toBeInTheDocument();
    expect(currentStep()).toBe('region'); // фракция уровень не двигает
    expect(document.body.textContent).not.toMatch(EMOJI);
  });
});

describe('карта мира (27.10.2026)', () => {
  const map = () => screen.getByRole('application', { name: 'Карта Toril' });

  it('регион на старте — карта под корешками: пины мест региона, у мастера — пульс ждущих решений, знак партии', () => {
    mount();
    const m = map();
    expect([...m.querySelectorAll('[data-pin]')].map(p => p.getAttribute('data-pin')).sort()).toEqual(['loc-neverwinter', 'loc-neverwinter-wood', 'loc-old-owl-well', 'loc-triboar-trail']);
    expect(m.querySelector('[data-pin="loc-neverwinter"]')).toHaveAttribute('data-pending', 'true');
    expect(m.querySelector('[data-part="party"]')).not.toBeNull();
    // Корешки и карточка — внутри карты, поверх неё.
    expect(within(m).getByRole('group', { name: 'Здесь' })).toBeInTheDocument();
  });

  it('пин — то же, что строка «Здесь»: подрегион становится фокусом уровня, карта смотрит на него; событий нет', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    fireEvent.click(map().querySelector('[data-pin="loc-triboar-trail"]')!);
    expect(levelHead()).toHaveTextContent('Регион · Triboar Trail');
    expect(map()).toBeInTheDocument();
    expect(store.getState().events.length).toBe(before);
  });

  it('поход к Old Owl Well: время на дни пути вперёд, PARTY_TRAVELED, запись в журнале; Ctrl+Z снимает поход', () => {
    const { store } = mount();
    const t0 = store.getState().state.time.sec;
    fireEvent.click(within(map()).getByRole('button', { name: 'Поход' }));
    fireEvent.click(map().querySelector('[data-pin="loc-old-owl-well"]')!);
    fireEvent.click(within(screen.getByRole('group', { name: 'Поход' })).getByRole('button', { name: /^обычный/ }));
    const travel = store.getState().events.filter(e => e.type === 'PARTY_TRAVELED');
    expect(travel).toHaveLength(1);
    expect(travel[0].payload).toMatchObject({ fromId: 'loc-neverwinter', toId: 'loc-old-owl-well', map: 'toril', pace: 'normal' });
    expect(store.getState().state.time.sec).toBeGreaterThan(t0);
    expect(store.getState().state.actors.bo.locationId).toBe('loc-old-owl-well');
    act(() => store.getState().undo());
    expect(store.getState().state.actors.bo.locationId).not.toBe('loc-old-owl-well');
  });

  it('стол игроков: карта есть, похода, пульса симуляции и секретов мастера на пинах нет; туман включён сам', () => {
    mount(undefined, false);
    const m = map();
    expect(within(m).queryByRole('button', { name: 'Поход' })).toBeNull();
    expect(m.querySelector('[data-pending]')).toBeNull();
    expect(within(m).queryAllByRole('img', { name: /^Секрет мастера/ })).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/восставших мертвецов|Агент Zhentarim/);
    expect(m.querySelector('[data-part="fog"]')).toHaveAttribute('data-forced', 'true');
  });

  it('мастеру на пинах — секреты о месте; «Открыть игрокам на карте» в карточке места — PLACE_REVEALED, Ctrl+Z обратно', () => {
    const { store } = mount();
    expect(within(map().querySelector<HTMLElement>('[data-pin="loc-old-owl-well"]')!).getByRole('img', { name: /^Секрет мастера: У Old Owl Well видели восставших мертвецов/ })).toBeInTheDocument();
    fireEvent.click(within(here()!).getByRole('button', { name: /Neverwinter Wood/ }));
    const card = cardOf('Neverwinter Wood');
    fireEvent.click(within(card).getByRole('button', { name: 'Открыть игрокам на карте' }));
    expect(lastEvent(store)).toMatchObject({ type: 'PLACE_REVEALED', payload: { locationId: 'loc-neverwinter-wood' } });
    expect(within(cardOf('Neverwinter Wood')).getByText('Открыто игрокам на карте')).toBeInTheDocument();
    act(() => store.getState().undo());
    expect(within(cardOf('Neverwinter Wood')).getByRole('button', { name: 'Открыть игрокам на карте' })).toBeInTheDocument();
  });

  it('жители места (E9): мастеру в карточке Neverwinter Wood — NPC вики, живые в 1492 DR; щелчок открывает NPC; событий нет', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    fireEvent.click(within(here()!).getByRole('button', { name: /Neverwinter Wood/ }));
    // Adriyana Voudsarr умерла в 292 DR — в 1492 её среди жителей нет.
    fireEvent.click(await within(cardOf('Neverwinter Wood')).findByRole('button', { name: /^Жители в 1492 DR по вики 40$/ }, { timeout: 10000 }));
    const list = within(cardOf('Neverwinter Wood')).getByRole('list', { name: 'Жители в 1492 DR по вики' });
    expect(within(list).queryByRole('button', { name: 'Adriyana Voudsarr' })).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: 'Malchor Harpell' }));
    expect(await screen.findByRole('region', { name: 'Malchor Harpell' }, { timeout: 10000 })).toHaveTextContent('NPC');
    expect(store.getState().events.length).toBe(before);
  // Справочник карты и индекс жителей — отдельные куски: под полным прогоном импорт дольше пяти секунд.
  }, 20000);
});

describe('справочник мест на карте (M12, 28.10.2026)', () => {
  const map = () => screen.getByRole('application', { name: 'Карта Toril' });

  it('мастер находит Daggerford по имени — карточка места со ссылкой на вики; событий нет', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    const box = await within(map()).findByRole('searchbox', { name: 'Найти место' });
    fireEvent.change(box, { target: { value: 'Daggerford' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const info = map().querySelector<HTMLElement>('[data-part="place-info"]')!;
    expect(info).toHaveTextContent('Daggerford');
    expect(within(info).getByRole('link', { name: 'Forgotten Realms Wiki · CC BY-SA' })).toHaveAttribute('href', expect.stringMatching(/\/wiki\/Daggerford$/));
    expect(store.getState().events.length).toBe(before);
  });

  it('стол игроков: справочника нет', async () => {
    mount(undefined, false);
    await act(async () => { await loadGazetteer('toril'); });
    expect(within(map()).queryByRole('searchbox', { name: 'Найти место' })).toBeNull();
  });
});

describe('глобус планеты (27.10.2026)', () => {
  const toPlanet = () => fireEvent.click(screen.getByRole('navigation', { name: 'Лестница масштабов' }).querySelector('[data-scale="planet"]')!);

  it('уровень планеты — глобус по маске с меткой Faerûn и партией; «Карта» — плоская карта, «Глобус» — обратно; событий нет', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    toPlanet();
    const globe = screen.getByRole('img', { name: /^Глобус Toril/ });
    expect(globe).toBeInTheDocument();
    const box = document.querySelector('[data-part="globe"]')!;
    expect(box.querySelector('[data-marker="loc-faerun"]')).toHaveTextContent('Faerûn');
    expect(box.querySelector('[data-marker="party"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Карта' }));
    expect(screen.getByRole('application', { name: 'Карта Toril' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Глобус' }));
    expect(screen.getByRole('img', { name: /^Глобус Toril/ })).toBeInTheDocument();
    expect(store.getState().events.length).toBe(before);
  });
});

describe('космос: планетарий и течения флогистона (28.10.2026)', () => {
  const toLevel = (lvl: string) => fireEvent.click(screen.getByRole('navigation', { name: 'Лестница масштабов' }).querySelector(`[data-scale="${lvl}"]`)!);

  it('система Realmspace — планетарий; «Спуститься: Toril» ведёт на планету; событий нет', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    toLevel('system');
    expect(screen.getByRole('img', { name: /^Планетарий Realmspace/ })).toBeInTheDocument();
    expect(document.querySelector('[data-part="body-info"]')).toHaveTextContent('Toril');
    fireEvent.click(screen.getByRole('button', { name: 'Спуститься: Toril' }));
    expect(screen.getByRole('img', { name: /^Глобус Toril/ })).toBeInTheDocument();
    expect(store.getState().events.length).toBe(before);
  });

  it('космология — Великое колесо: Материальный — план партии; «Спуститься» ведёт на уровень плана с его карточкой; событий нет', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    toLevel('cosmology');
    expect(screen.getByRole('img', { name: /^Великое колесо/ })).toBeInTheDocument();
    expect(document.querySelector('[data-part="plane-info"]')).toHaveTextContent('Prime Material Plane');
    fireEvent.click(screen.getByRole('button', { name: 'Nine Hells' }));
    expect(screen.queryByRole('button', { name: /^Спуститься/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Prime Material Plane' }));
    fireEvent.click(screen.getByRole('button', { name: 'Спуститься: Prime Material Plane' }));
    expect(screen.getByRole('img', { name: /^Флогистон/ })).toBeInTheDocument();
    expect(document.querySelector('[data-part="plane-info"]')).toHaveTextContent('поддаётся изменению');
    expect(store.getState().events.length).toBe(before);
  });

  it('космология: «Древо» — Великое древо, «Колесо» — обратно; Материальный открывается и с Древа; событий нет', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    toLevel('cosmology');
    fireEvent.click(screen.getByRole('button', { name: 'Древо' }));
    expect(screen.getByRole('img', { name: /^Великое древо/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Древо' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Колесо' }));
    expect(screen.getByRole('img', { name: /^Великое колесо/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Древо' }));
    fireEvent.click(screen.getByRole('button', { name: 'Спуститься: Prime Material Plane' }));
    expect(screen.getByRole('img', { name: /^Флогистон/ })).toBeInTheDocument();
    expect(store.getState().events.length).toBe(before);
  });

  it('уделы богов (E3): после загрузки — число в узле Elysium, в карточке плана — «Morninglory — Lathander», щелчок открывает бога; событий нет', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    toLevel('cosmology');
    const wheel = screen.getByRole('img', { name: /^Великое колесо/ });
    await waitFor(() => expect(wheel.querySelector('[data-plane="elysium"] [data-realms]')).not.toBeNull(), { timeout: 10000 });
    fireEvent.click(screen.getByRole('button', { name: 'Elysium' }));
    fireEvent.click(screen.getByRole('button', { name: /^Уделы богов/ }));
    const list = screen.getByRole('list', { name: 'Уделы богов: Elysium' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(Number(wheel.querySelector('[data-plane="elysium"] [data-realms]')!.textContent));
    fireEvent.click(within(list).getByRole('button', { name: 'Morninglory — Lathander' }));
    expect(await screen.findByRole('region', { name: 'Lathander' }, { timeout: 10000 })).toHaveTextContent('Божество');
    expect(store.getState().events.length).toBe(before);
  // Данные богов — отдельный кусок: под полным прогоном импорт дольше пяти секунд по умолчанию.
  }, 20000);

  it('год кампании задаёт линзу по умолчанию (ROADMAP 0.6): в 1372 DR космология открывается Великим древом', () => {
    const seed = seedState();
    mount(createEngineStore({ ...seed, time: { ...seed.time, sec: secOf({ year: 1372, month: 'Mirtul', day: 15, hour: 8 }) } }, { persist: memoryStore() }));
    toLevel('cosmology');
    expect(screen.getByRole('img', { name: /^Великое древо/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Древо' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('план — схема течений с Realmspace в центре, путь Krynnspace → Realmspace за 53 дня', () => {
    mount();
    toLevel('plane');
    expect(screen.getByRole('img', { name: /^Флогистон/ })).toBeInTheDocument();
    const info = document.querySelector('[data-part="sphere-info"]')!;
    expect(info).toHaveTextContent('Realmspace');
    expect(info.querySelector('[data-route="krynnspace"]')).toHaveTextContent('← Krynnspace · течение в одну сторону · 53 дня');
    fireEvent.click(screen.getByRole('button', { name: 'Спуститься: Realmspace' }));
    expect(screen.getByRole('img', { name: /^Планетарий Realmspace/ })).toBeInTheDocument();
  });
});
