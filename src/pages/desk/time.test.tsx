// Шаг времени (F6) и отдых / новая сессия.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedEngine, seedState } from '../../campaign';
import { createEngineStore, memoryStore } from '../../engine';
import { DeskPage } from '../DeskPage';
import { fixed, mount, rowOf, cardOf, hpOf, lastEvent, damageViaPopover, startCombat, inbox, deltaCard, tempoGroup, timeView, step } from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/* ---------- Шаг времени (шаг 8): сценарий F6 — темп, фаза суток, небесные тела, сводка, решения, отмена ---------- */

describe('шаг времени', () => {
  it('погода в полосе часов — из календаря (§13): «Облачно, +14 °C, лёгкий ветер», с иконкой неба; после шага «День» — другая, но та же для этого дня', () => {
    mount();
    const w = screen.getByTitle('Погода: Облачно, +14 °C, лёгкий ветер');
    expect(w).toHaveTextContent('Облачно, +14 °C, лёгкий ветер');
    expect(w.querySelector('svg')).not.toBeNull();
    fireEvent.click(within(tempoGroup()).getByRole('radio', { name: /День/ }));
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    const next = screen.getByTitle(/^Погода: /).getAttribute('title');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByTitle(/^Погода: /)).toHaveAttribute('title', 'Погода: Облачно, +14 °C, лёгкий ветер');
    expect(next).toMatch(/^Погода: (Ясно|Облачно|Дождь|Гроза), [+\u2212]\d+ °C, /);
  });

  it('полоса часов: утро, Selûne растёт, полнолуние через 3 дня; три шага «Час» по T — день и 11:00; шаг «День» — полнолуние через 2 дня', () => {
    const { store } = mount();
    const clock = screen.getByLabelText('Мировые часы');
    expect(clock).toHaveTextContent('Утро');
    expect(clock).toHaveTextContent('Selûne растёт');
    expect(clock).toHaveTextContent('через 3 дня');
    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    expect(store.getState().events.filter(e => e.type === 'TIME_ADVANCED')).toHaveLength(3);
    expect(lastEvent(store)).toMatchObject({ type: 'TIME_ADVANCED', payload: { tempo: 'hour', steps: 1 } });
    expect(clock).toHaveTextContent('11:00');
    expect(clock).toHaveTextContent('День');
    // Сводка поднимается после шага: главная зона — «Шаг времени», фаза «День» — текущая.
    const view = timeView();
    expect(within(within(view).getByRole('list', { name: 'Фаза суток' })).getByRole('listitem', { current: true })).toHaveTextContent('День');
    expect(within(view).getByRole('region', { name: 'Что изменилось' })).toHaveTextContent('Всё решено');
    fireEvent.click(within(tempoGroup()).getByRole('radio', { name: /День/ }));
    step();
    expect(lastEvent(store)).toMatchObject({ type: 'TIME_ADVANCED', payload: { tempo: 'day' } });
    expect(clock).toHaveTextContent('16 Mirtul 1492 DR, 11:00');
    expect(clock).toHaveTextContent('через 2 дня');
  });

  it('F6: десятидневка → сводка по уровням: Faerûn свёрнут с «Принять пачкой», Neverwinter развёрнут; принять цены → +15% в мире; принять пачкой; отклонить и перебросить во входящих; Ctrl+Z возвращает отклонённое', () => {
    const { store } = mount();
    fireEvent.click(within(tempoGroup()).getByRole('radio', { name: /Десятидневка/ }));
    step();
    // Влияние Zhentarim, цены Neverwinter и две вражды растущей Zhentarim (Q7).
    const types = store.getState().events.slice(-5).map(e => e.type);
    expect(types).toEqual(['TIME_ADVANCED', ...Array(4).fill('WORLD_DELTA_PROPOSED')]);
    expect(screen.getByLabelText('Мировые часы')).toHaveTextContent('25 Mirtul 1492 DR');
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(8);

    const summary = within(timeView()).getByRole('region', { name: 'Что изменилось' });
    expect(summary).toHaveTextContent('Континент · Faerûn');
    expect(summary).toHaveTextContent('Поселение · Neverwinter');
    expect(summary).toHaveTextContent('+10%');
    expect(summary).toHaveTextContent('+15%');
    expect(within(summary).getByRole('button', { name: 'Принять пачкой' })).toBeInTheDocument();
    // Свёрнутый уровень строк не показывает, развёрнутый решается поштучно.
    expect(within(summary).queryByText('Zhentarim · влияние')).toBeNull();
    fireEvent.click(within(summary).getByRole('button', { name: 'Принять' }));
    expect(lastEvent(store).type).toBe('WORLD_DELTA_ACCEPTED');
    expect(store.getState().state.world.locations['loc-neverwinter'].pricePercent).toBe(15);
    fireEvent.click(within(summary).getByRole('button', { name: 'Принять пачкой' }));
    expect(store.getState().state.world.factions['fac-zhentarim'].influencePercent).toBe(46);
    expect(store.getState().state.world.factions['fac-harpers'].relations?.['fac-zhentarim']).toBe(-3);
    expect(summary).toHaveTextContent('Всё решено');
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(4);
    const journal = screen.getByRole('list', { name: 'Записи журнала' });
    expect(journal).toHaveTextContent('Принято: Цены · @Neverwinter — +10% → +15%');
    expect(journal).toHaveTextContent('Принято: @Zhentarim · влияние — 45% → 46%');

    fireEvent.click(within(deltaCard('Zhentarim · Triboar Trail')).getByRole('button', { name: 'Переброс' }));
    expect(deltaCard('Zhentarim · Triboar Trail')).toHaveTextContent('Harpers перехватили курьера');
    fireEvent.click(within(deltaCard('Встречи с ликантропами · Neverwinter Wood')).getByRole('button', { name: 'Отклонить' }));
    expect(lastEvent(store).type).toBe('WORLD_DELTA_REJECTED');
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('Отменено: Отклонено: Встречи с ликантропами · Neverwinter Wood');
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(4);
    expect(store.getState().state.deltas['d-lycanthropes'].status).toBe('pending');
    // Ещё раз назад — переброс; дальше пачка снимается по одному принятию: две вражды, потом влияние.
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(deltaCard('Zhentarim · Triboar Trail')).toHaveTextContent('караван всё ещё не найден');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(store.getState().state.world.factions['fac-harpers'].relations?.['fac-zhentarim']).toBe(-2);
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(store.getState().state.world.factions['fac-zhentarim'].influencePercent).toBe(45);
    // Свёрнутая группа континента вернулась в сводку — с кнопкой пачки, без строк.
    expect(within(timeView()).getByRole('region', { name: 'Что изменилось' })).toHaveTextContent('Континент · Faerûn');
    expect(within(timeView()).getByRole('button', { name: 'Принять пачкой' })).toBeInTheDocument();
  });

  it('в бою темп — раунды и переключатель недоступен; «Шаг» двигает часы на 6 секунд', () => {
    const { store } = mount();
    startCombat();
    expect(within(tempoGroup()).getByRole('radio', { name: /Раунд/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(tempoGroup()).getByRole('radio', { name: /День/ })).toBeDisabled();
    step();
    expect(lastEvent(store)).toMatchObject({ type: 'TIME_ADVANCED', payload: { tempo: 'round', fromSec: seedState().time.sec, toSec: seedState().time.sec + 6 } });
  });
});

describe('отдых и новая сессия', () => {
  const restDialog = () => screen.getByRole('dialog', { name: 'Отдых' });

  it('короткий отдых: кости Bo → «Бросить» 2d10+6 → «Отдохнуть»: DICE_ROLLED, TIME_ADVANCED на час, REST_TAKEN; Bo 49/49 и две кости потрачены; Ctrl+Z снимает отдых, потом час', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Отдых' }));
    const dlg = restDialog();
    expect(within(dlg).getByTitle('Отдыхают')).toHaveTextContent('4 из 4');
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Кости хитов: Bo Tambernack' }), { target: { value: '2' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Бросить: Bo Tambernack' }));
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { formula: '2d10+6', total: 26, label: 'Кости хитов · Bo Tambernack' } });
    expect(within(dlg).getByRole('textbox', { name: 'Хиты: Bo Tambernack' })).toHaveValue('26');
    const before = store.getState().events.length;
    fireEvent.click(within(dlg).getByRole('button', { name: 'Отдохнуть' }));
    expect(store.getState().events.slice(before).map(e => e.type)).toEqual(['TIME_ADVANCED', 'REST_TAKEN']);
    expect(lastEvent(store)).toMatchObject({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo', 'korrin', 'lyra', 'aldric'], hitDice: [{ actorId: 'bo', dice: 2, healed: 26 }] } });
    expect(screen.queryByRole('dialog', { name: 'Отдых' })).toBeNull();
    expect(hpOf(store, 'bo').current).toBe(49);
    expect(store.getState().state.actors.bo.hitDiceSpent).toBe(2);
    expect(screen.getByTitle('Дата и время мира')).toHaveTextContent('15 Mirtul 1492 DR, 09:00');
    // Час без событий мира — предложений нет, стол остаётся столом.
    expect(screen.getByRole('button', { name: 'Стол' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Короткий отдых: @Bo Tambernack +26 (2 кости хитов)');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(hpOf(store, 'bo').current).toBe(41);
    expect(store.getState().state.actors.bo.hitDiceSpent).toBeUndefined();
    expect(screen.getByTitle('Дата и время мира')).toHaveTextContent('09:00');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByTitle('Дата и время мира')).toHaveTextContent('08:00');
  });

  it('долгий отдых: восемь часов, хиты полны, кости назад; в бою кнопки «Отдых» нет; у игроков — тоже', () => {
    const { store } = mount();
    damageViaPopover(cardOf('Bo Tambernack'), 20);
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Отдых' }));
    const dlg = restDialog();
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Долгий · 8 ч' }));
    fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Отдыхает: Brother Aldric' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Отдохнуть' }));
    expect(lastEvent(store)).toMatchObject({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo', 'korrin', 'lyra'] } });
    expect(hpOf(store, 'bo').current).toBe(49);
    expect(screen.getByTitle('Дата и время мира')).toHaveTextContent('15 Mirtul 1492 DR, 16:00');
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Долгий отдых: @Bo Tambernack, @Korrin Battlehammer, @Lyra Moonwhisper');
    startCombat();
    expect(screen.queryByRole('button', { name: 'Отдых' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закончить бой' }));
    expect(screen.getByRole('button', { name: 'Отдых' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.queryByRole('button', { name: 'Отдых' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Новая сессия' })).toBeNull();
  });

  it('«Новая сессия» — в два клика: «Оставить» ничего не трогает; «Стереть» чистит хранилище и поднимает сид заново — Bo снова 41/49, журнал сида', () => {
    const persist = memoryStore();
    const store = seedEngine({ persist, ...fixed() });
    render(<DeskPage store={store} persist={persist} />);
    damageViaPopover(cardOf('Bo Tambernack'), 8);
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(within(rowOf('Bo Tambernack')).getByText('33/49')).toBeInTheDocument();
    expect(persist.load()?.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Новая сессия' }));
    const ask = screen.getByRole('alertdialog', { name: 'Новая сессия' });
    expect(ask).toHaveTextContent('Стереть журнал сессии и начать заново?');
    fireEvent.click(within(ask).getByRole('button', { name: 'Оставить' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(rowOf('Bo Tambernack')).getByText('33/49')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Новая сессия' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Новая сессия' })).getByRole('button', { name: 'Стереть' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(rowOf('Bo Tambernack')).getByText('41/49')).toBeInTheDocument();
    expect(persist.load()).toBeNull();
    // Четыре записи сида — и ни одной из этой сессии (урон 8 в сиде тоже есть, поэтому считаем, а не ищем текст).
    expect(within(screen.getByRole('list', { name: 'Записи журнала' })).getAllByRole('listitem')).toHaveLength(4);
    // Старый стор страница больше не слушает: его состояние осталось с уроном, стол — без.
    expect(store.getState().state.actors.bo.hp.current).toBe(33);
  });
});

describe('часы Харптоса: мини-циферблат и календарь (28.10.2026)', () => {
  it('мини-циферблат в полосе часов открывает откидную панель: 15 Mirtul — сегодня, десятидневка вторая, полнолуние 18-го, Greengrass в году; Esc закрывает', () => {
    mount();
    const clock = screen.getByLabelText('Мировые часы');
    const dial = within(clock).getByRole('button', { name: 'Календарь Харптоса' });
    expect(within(dial).getByRole('img', { name: 'Время суток: 08:00, утро' })).toBeInTheDocument();
    fireEvent.click(dial);
    const cal = screen.getByRole('region', { name: 'Календарь Харптоса' });
    expect(within(cal).getByText('15 Mirtul')).toBeInTheDocument();
    expect(cal).toHaveTextContent('вторая, день 5');
    const month = within(cal).getByRole('table', { name: 'Mirtul 1492 DR' });
    const today = month.querySelector('[aria-current="date"]')!;
    expect(today).toHaveTextContent('15');
    expect(within(month).getByTitle('18 Mirtul 1492 DR · Selûne полная')).toBeInTheDocument();
    expect(within(month).getAllByRole('row')).toHaveLength(3);
    expect(within(cal).getByRole('list', { name: 'Год 1492 DR' })).toHaveTextContent('Greengrass');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Календарь Харптоса' })).toBeNull();
  });

  it('листать месяцы — вид, не событие: › — Kythorn, праздник после Tarsakh виден на своём месяце, «Сегодня» возвращает', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    fireEvent.click(within(screen.getByLabelText('Мировые часы')).getByRole('button', { name: 'Календарь Харптоса' }));
    const cal = screen.getByRole('region', { name: 'Календарь Харптоса' });
    fireEvent.click(within(cal).getByRole('button', { name: 'Следующий месяц' }));
    expect(within(cal).getByRole('table', { name: 'Kythorn 1492 DR' })).toBeInTheDocument();
    fireEvent.click(within(cal).getByRole('button', { name: 'Tarsakh' }));
    expect(within(cal).getByRole('table', { name: 'Tarsakh 1492 DR' })).toBeInTheDocument();
    expect(cal.querySelector('[data-part="festival"]')).toHaveTextContent('Greengrass');
    fireEvent.click(within(cal).getByRole('button', { name: 'Сегодня' }));
    expect(within(cal).getByRole('table', { name: 'Mirtul 1492 DR' })).toBeInTheDocument();
    expect(store.getState().events).toHaveLength(before);
  });

  it('святые дни (E4): ближайший в сводке, отметка и список месяца, праздник с богами, «все пантеоны» — вид; имя бога открывает карточку', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    fireEvent.click(within(screen.getByLabelText('Мировые часы')).getByRole('button', { name: 'Календарь Харптоса' }));
    const cal = screen.getByRole('region', { name: 'Календарь Харптоса' });
    // У Aldric в сиде Lathander — вид «партия» по умолчанию: ближайший — его Midsummer.
    expect(within(cal).getByRole('button', { name: 'партия' })).toHaveAttribute('aria-pressed', 'true');
    expect(cal.querySelector('[data-part="holy-next"]')).toHaveTextContent('Lathander · через 76 дней');
    fireEvent.click(within(cal).getByRole('button', { name: 'Faerûn' }));
    expect(cal.querySelector('[data-part="holy-next"]')).toHaveTextContent('летнее солнцестояние: Amaunator, Mielikki · через 35 дней');
    // Mirtul: Tyr — 1, 13, 22 каждого месяца — строкой и отметкой.
    expect(cal.querySelector('[data-part="holy-repeats"]')).toHaveTextContent('каждый месяц: Tyr (1, 13, 22)');
    const mirtul = within(cal).getByRole('table', { name: 'Mirtul 1492 DR' });
    expect(within(mirtul).getByTitle(/^13 Mirtul 1492 DR · .* · святой день: Tyr$/)).toBeInTheDocument();
    fireEvent.click(within(cal).getByRole('button', { name: 'Следующий месяц' }));
    const kythorn = within(cal).getByRole('table', { name: 'Kythorn 1492 DR' });
    expect(within(kythorn).getByTitle(/^20 Kythorn .* святой день: летнее солнцестояние: Amaunator, Mielikki$/).querySelector('[data-holy]')).not.toBeNull();
    const list = within(cal).getByRole('list', { name: 'Святые дни: Kythorn' });
    expect(list).toHaveTextContent('20 Kythorn летнее солнцестояние: Amaunator, Mielikki');
    fireEvent.click(within(cal).getByRole('button', { name: 'Tarsakh' }));
    expect(cal.querySelector('[data-part="festival-holy"]')).toHaveTextContent('Eldath');
    fireEvent.click(within(cal).getByRole('button', { name: 'Mirtul' }));
    expect(within(cal).getByTitle(/^18 Mirtul 1492 DR · Selûne полная$/)).toBeInTheDocument();
    fireEvent.click(within(cal).getByRole('button', { name: 'все пантеоны' }));
    expect(within(cal).getByTitle(/^18 Mirtul 1492 DR · Selûne полная · святой день: .*Sehanine Moonbow/)).toBeInTheDocument();
    expect(store.getState().events).toHaveLength(before);
    fireEvent.click(within(cal).getByRole('button', { name: 'Kythorn' }));
    fireEvent.click(within(within(cal).getByRole('list', { name: 'Святые дни: Kythorn' })).getByRole('button', { name: /Amaunator/ }));
    const card = await screen.findByRole('region', { name: 'Amaunator' }, { timeout: 10000 });
    expect(card).toHaveTextContent('Божество');
    expect(card).toHaveTextContent('Святые дни');
  // Карточка бога — кусок космоса по требованию: под полным прогоном импорт дольше пяти секунд по умолчанию.
  }, 20000);

  it('бог партии (E8): у Aldric на листе Torm — «Мир спокоен» и календарь начинают с его святых дней, в шапке листа — Torm и символ', async () => {
    const seed = seedState();
    const aldric = seed.actors.aldric;
    // Без лога сида: предложений нет — входящие пусты, строка «Мир спокоен» видна сразу.
    mount(createEngineStore({ ...seed, actors: { ...seed.actors, aldric: { ...aldric, sheet: { ...aldric.sheet!, deity: { id: 'torm', name: 'Torm' } } } } }, { persist: memoryStore() }));
    expect(screen.getByText(/Мир спокоен/)).toHaveTextContent(/Святой день бога партии через \d+ дн\S* — The Divine Death: Torm\.$/);
    fireEvent.click(within(screen.getByLabelText('Мировые часы')).getByRole('button', { name: 'Календарь Харптоса' }));
    const cal = screen.getByRole('region', { name: 'Календарь Харптоса' });
    expect(within(cal).getByRole('button', { name: 'партия' })).toHaveAttribute('aria-pressed', 'true');
    expect(cal.querySelector('[data-part="holy-next"]')).toHaveTextContent('The Divine Death: Torm');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    fireEvent.click(rowOf('Brother Aldric'));
    const line = () => cardOf('Brother Aldric').querySelector<HTMLElement>('[data-part="deity"]')!;
    expect(within(line()).getByRole('button', { name: 'Torm' })).toBeInTheDocument();
    // Символ — из карточки бога по эпохе (5e): справочник догружается отдельным куском.
    await waitFor(() => expect(line()).toHaveTextContent('Torm· White right gauntlet'), { timeout: 10000 });
  }, 20000);

  it('вкладка «Время» показывает тот же календарь под фазами суток', () => {
    mount();
    fireEvent.click(within(screen.getByRole('group', { name: 'Вид главной зоны' })).getByRole('button', { name: /Время/ }));
    const view = timeView();
    expect(within(view).getByRole('region', { name: 'Календарь Харптоса' })).toBeInTheDocument();
    expect(within(view).getByRole('img', { name: 'Время суток: 08:00, утро' })).toBeInTheDocument();
  });
});
