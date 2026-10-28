// Бой на столе, живой стол (инициатива, появление, «Мир спокоен») и предложения концентрации.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, rowOf, cardOf, hpOf, lastEvent, damageViaPopover, bar, grid, tokenIn, activeIn, startCombat } from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/* ---------- Бой (шаг 6): сценарий F2 мышью — урон → промпт концентрации → следующий ход → отмена ---------- */

describe('бой на столе', () => {
  it('«Начать бой» → ENCOUNTER_STARTED из бросков сида: полоса инициативы с восемью токенами, ход Korrin, раунд 1, сетка вместо карточки', () => {
    const { store } = mount();
    expect(screen.queryByLabelText('Бой', { selector: 'footer' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Боевая сетка' })).toBeNull();
    startCombat();
    expect(lastEvent(store).type).toBe('ENCOUNTER_STARTED');
    const ids = [...bar().querySelectorAll<HTMLElement>('[data-actor]')].map(t => t.dataset.actor);
    expect(ids).toEqual(['korrin', 'bo', 'captain', 'lyra', 'bandit-1', 'aldric', 'bandit-2', 'bandit-3']);
    expect(activeIn(bar())).toBe('korrin');
    expect(activeIn(grid())).toBe('korrin');
    expect(screen.getByLabelText('Мировые часы')).toHaveTextContent('Раунд 1');
    expect(screen.queryByRole('button', { name: 'Начать бой' })).toBeNull();
    // Карточка в бою — по кнопке, а не всегда: главная зона отдана сетке.
    expect(screen.queryByRole('region', { name: 'Bo Tambernack' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Противники' })).toBeNull();
    expect(grid().querySelectorAll('[data-actor]')).toHaveLength(8);
  });

  it('F2: урон с токена → число на токене, в корешке и в журнале; промпт концентрации «Удержал»; «Ход» → Bo; Ctrl+Z → снова Korrin', () => {
    const { store } = mount();
    startCombat();
    fireEvent.click(tokenIn(grid(), 'bo')!);
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Величина' }), { target: { value: '14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Урон' }));
    expect(hpOf(store, 'bo')).toEqual({ current: 27, max: 49, temp: 0 });
    expect(within(rowOf('Bo Tambernack')).getByText('27/49')).toBeInTheDocument();
    expect(tokenIn(grid(), 'bo')).toHaveAttribute('title', expect.stringContaining('27/49'));
    expect(tokenIn(bar(), 'bo')).toHaveAttribute('title', expect.stringContaining('27/49'));
    const journal = screen.getByRole('list', { name: 'Записи журнала' });
    expect(journal).toHaveTextContent('Урон 14 по @Bo Tambernack');

    // Промпт: Hunter's Mark, DC max(10, 14/2) = 10. «Удержал» — события нет, концентрация остаётся.
    const prompt = within(dialog).getByRole('group', { name: 'Проверка концентрации' });
    expect(prompt).toHaveTextContent('DC 10');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Удержал' }));
    expect(within(dialog).queryByRole('group', { name: 'Проверка концентрации' })).toBeNull();
    expect(store.getState().state.actors.bo.concentration?.spell).toBe("Hunter's Mark");
    expect(lastEvent(store).type).toBe('DAMAGE_APPLIED');

    fireEvent.click(within(bar()).getByRole('button', { name: 'Ход' }));
    expect(lastEvent(store)).toMatchObject({ type: 'TURN_ADVANCED', payload: { round: 1, turnIndex: 1, actorId: 'bo' } });
    expect(activeIn(bar())).toBe('bo');
    expect(activeIn(grid())).toBe('bo');
    expect(journal).toHaveTextContent('Раунд 1, ход @Bo Tambernack');

    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('Отменено: Раунд 1, ход Bo Tambernack');
    expect(activeIn(bar())).toBe('korrin');
    expect(store.getState().state.encounter.turnIndex).toBe(0);
  });

  it('Space — следующий ход, но не из поля попапа; после круга раунд 2; клик по токену полосы открывает попап от него', () => {
    const { store } = mount();
    startCombat();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(store.getState().state.encounter.turnIndex).toBe(1);
    fireEvent.click(tokenIn(bar(), 'captain')!);
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bandit Captain' });
    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Величина' }), { key: ' ', code: 'Space' });
    expect(store.getState().state.encounter.turnIndex).toBe(1);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    for (let i = 0; i < 7; i++) fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(store.getState().state.encounter).toMatchObject({ round: 2, turnIndex: 0 });
    expect(screen.getByLabelText('Мировые часы')).toHaveTextContent('Раунд 2');
  });

  it('«Убрать из боя» с токена — ACTOR_REMOVED: токен уходит из полосы и с сетки, «Выбыл (убит)» в журнале; Ctrl+Z возвращает', () => {
    const { store } = mount();
    startCombat();
    act(() => store.getState().damage('bandit-3', 11));
    expect(tokenIn(bar(), 'bandit-3')).toHaveAttribute('data-down');
    fireEvent.click(tokenIn(bar(), 'bandit-3')!);
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bandit 3' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Убрать из боя' }));
    expect(lastEvent(store)).toMatchObject({ type: 'ACTOR_REMOVED', payload: { actorId: 'bandit-3', reason: 'dead' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tokenIn(bar(), 'bandit-3')).toBeNull();
    expect(tokenIn(grid(), 'bandit-3')).toBeNull();
    expect(bar().querySelectorAll('[data-actor]')).toHaveLength(7);
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Выбыл (убит): @Bandit 3');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(tokenIn(bar(), 'bandit-3')).not.toBeNull();
    expect(tokenIn(grid(), 'bandit-3')).not.toBeNull();
  });

  it('«Карточка» в бою показывает карточку выбранного рядом с сеткой; «Закончить бой» → ENCOUNTER_ENDED, стол как до боя', () => {
    const { store } = mount();
    startCombat();
    fireEvent.click(tokenIn(grid(), 'captain')!);
    fireEvent.click(screen.getByRole('button', { name: 'Карточка' }));
    expect(screen.getByRole('region', { name: 'Bandit Captain' })).toBeInTheDocument();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Закончить бой' }));
    expect(lastEvent(store).type).toBe('ENCOUNTER_ENDED');
    expect(screen.queryByLabelText('Бой', { selector: 'footer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Начать бой' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bandit Captain' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Противники' })).toBeInTheDocument();
  });

  it('бросок с плитки → карточка броска в правой колонке: формула, итог из лога; «скрытый бросок» — следующий бросок скрытый; R — переброс; крестик закрывает до следующего броска', () => {
    const { store } = mount();
    expect(screen.queryByRole('region', { name: /^Бросок/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^DEX/ }));
    const first = lastEvent(store);
    expect(first).toMatchObject({ type: 'DICE_ROLLED', payload: { formula: '1d20+3', hidden: false, label: 'DEX · Bo Tambernack' } });
    const modal = screen.getByRole('region', { name: /^Бросок/ });
    expect(modal).toHaveTextContent('1d20+3');
    expect(modal).toHaveTextContent(String((first.payload as { total: number }).total));

    fireEvent.click(within(modal).getByRole('checkbox', { name: /скрытый бросок/ }));
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { formula: '1d20+3', hidden: true, label: 'DEX · Bo Tambernack' } });
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('скрытый');
    // История — предыдущие броски, без текущего.
    expect(within(screen.getByRole('region', { name: /^Бросок/ })).getAllByText('DEX · Bo Tambernack').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(screen.getByRole('region', { name: /^Бросок/ })).getByRole('button', { name: 'Закрыть бросок' }));
    expect(screen.queryByRole('region', { name: /^Бросок/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^STR/ }));
    expect(screen.getByRole('region', { name: /^Бросок/ })).toHaveTextContent('1d20');
  });
});

describe('живой стол: инициатива, появление противника, концентрация, «Мир спокоен»', () => {
  const editor = () => screen.getByRole('dialog', { name: 'Инициатива' });
  const initField = (name: string) => within(editor()).getByRole('textbox', { name: `Инициатива: ${name}` });
  const spawnDialog = () => screen.getByRole('dialog', { name: 'Добавить противника' });
  const foesStack = () => screen.getByRole('group', { name: 'Противники' });

  it('«Начать бой» открывает редактор с бросками сида; правка и бросок монстру меняют порядок; «Начать бой» в нём — ENCOUNTER_STARTED с этим порядком', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Начать бой' }));
    const list = within(editor()).getByRole('list', { name: 'Броски инициативы' });
    expect(within(list).getAllByRole('listitem').map(li => li.getAttribute('data-actor'))).toEqual(['bo', 'korrin', 'lyra', 'aldric', 'captain', 'bandit-1', 'bandit-2', 'bandit-3']);
    expect(initField('Korrin Battlehammer')).toHaveValue('18');
    expect(within(editor()).getByTitle('В порядке боя')).toHaveTextContent('8 из 8');
    expect(store.getState().state.encounter.active).toBe(false);

    // Игрок назвал 3; капитану бросили заново: d20 при rng → 1 даёт 20, +3 DEX = 23 — и это DICE_ROLLED в логе.
    fireEvent.change(initField('Korrin Battlehammer'), { target: { value: '3' } });
    fireEvent.click(within(editor()).getByRole('button', { name: 'Бросить: Bandit Captain' }));
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { formula: '1d20+3', total: 23, label: 'Инициатива · Bandit Captain', hidden: false } });
    expect(initField('Bandit Captain')).toHaveValue('23');

    fireEvent.click(within(editor()).getByRole('button', { name: 'Начать бой' }));
    expect(lastEvent(store).type).toBe('ENCOUNTER_STARTED');
    const ids = [...bar().querySelectorAll<HTMLElement>('[data-actor]')].map(t => t.dataset.actor);
    expect(ids).toEqual(['captain', 'bo', 'lyra', 'bandit-1', 'aldric', 'bandit-2', 'bandit-3', 'korrin']);
    expect(activeIn(bar())).toBe('captain');
    expect(screen.queryByRole('dialog', { name: 'Инициатива' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Начать бой' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Порядок' })).toBeInTheDocument();
  });

  it('в бою «Порядок» → «Применить» пишет INITIATIVE_SET снимком; ход остаётся у того, чей был; пустая строка выбывает из порядка', () => {
    const { store } = mount();
    startCombat();
    fireEvent.click(screen.getByRole('button', { name: 'Ход' }));
    expect(activeIn(bar())).toBe('bo');
    fireEvent.click(screen.getByRole('button', { name: 'Порядок' }));
    fireEvent.change(initField('Bandit 3'), { target: { value: '25' } });
    fireEvent.change(initField('Lyra Moonwhisper'), { target: { value: '' } });
    fireEvent.click(within(editor()).getByRole('button', { name: 'Применить' }));
    expect(lastEvent(store).type).toBe('INITIATIVE_SET');
    const ids = [...bar().querySelectorAll<HTMLElement>('[data-actor]')].map(t => t.dataset.actor);
    expect(ids).toEqual(['bandit-3', 'korrin', 'bo', 'captain', 'bandit-1', 'aldric', 'bandit-2']);
    expect(activeIn(bar())).toBe('bo');
    expect(store.getState().state.actors.lyra.initiative).toBeUndefined();
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect([...bar().querySelectorAll<HTMLElement>('[data-actor]')]).toHaveLength(8);
  });

  it('«Добавить» вне боя: блок SRD, имя «Bandit 4» по подсказке → ACTOR_SPAWNED bandit-4; он в стопке противников и в слоте карточки; Ctrl+Z убирает', async () => {
    const { store } = mount();
    expect(within(foesStack()).getAllByRole('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    const dlg = spawnDialog();
    // Библиотека — SRD, Black Flag и A5E; поиск «bandit» находит одноимённые блоки всех трёх, первый — Bandit SRD,
    // и имя подсказано по счёту сида. Black Flag и A5E догружаются после первой отрисовки (ROADMAP 0.5).
    await waitFor(() => expect(within(within(dlg).getByRole('group', { name: 'Блок' })).getAllByRole('button').length).toBeGreaterThanOrEqual(1000));
    fireEvent.change(within(dlg).getByRole('searchbox', { name: 'Найти блок' }), { target: { value: 'bandit' } });
    const found = within(within(dlg).getByRole('group', { name: 'Блок' })).getAllByRole('button');
    expect(found.length).toBeGreaterThan(2);
    expect(found[0]).toHaveAttribute('title', 'Bandit (SRD): CR 1/8, AC 12, 11 хитов');
    expect(within(dlg).getByRole('textbox', { name: 'Имя' })).toHaveValue('Bandit 4');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Добавить' }));
    expect(lastEvent(store)).toMatchObject({ type: 'ACTOR_SPAWNED', payload: { actor: { id: 'bandit-4', name: 'Bandit 4', monsterId: 'bandit', hp: { current: 11, max: 11 } } } });
    expect(screen.queryByRole('dialog', { name: 'Добавить противника' })).toBeNull();
    expect(within(foesStack()).getAllByRole('button').map(b => b.getAttribute('title'))).toContain('Bandit 4 · CR 1/8');
    expect(screen.getByRole('region', { name: 'Bandit 4' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Появился: @Bandit 4');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(within(foesStack()).getAllByRole('button')).toHaveLength(4);
    expect(store.getState().state.actors['bandit-4']).toBeUndefined();
  });

  it('«Добавить» в бою: две штуки → два ACTOR_SPAWNED, два броска инициативы и один INITIATIVE_SET; оба на полосе; Ctrl+Z снимает порядок, актёры остаются', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { store } = mount();
    startCombat();
    const before = store.getState().events.length;
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    const dlg = spawnDialog();
    fireEvent.change(within(dlg).getByRole('searchbox', { name: 'Найти блок' }), { target: { value: 'captain' } });
    fireEvent.click(within(dlg).getAllByRole('button', { name: /^Bandit Captain.*SRD/ })[0]);
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Имя' }), { target: { value: 'Атаман' } });
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Сколько' }), { target: { value: '2' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Добавить' }));
    const added = store.getState().events.slice(before).map(e => e.type);
    expect(added).toEqual(['ACTOR_SPAWNED', 'ACTOR_SPAWNED', 'DICE_ROLLED', 'DICE_ROLLED', 'INITIATIVE_SET']);
    // Math.random → 0: на кубе 1, +3 DEX = 4 у обоих — ниже Bandit 3 (6), оба в самом конце; чужие броски не тронуты.
    const ids = [...bar().querySelectorAll<HTMLElement>('[data-actor]')].map(t => t.dataset.actor);
    expect(ids).toEqual(['korrin', 'bo', 'captain', 'lyra', 'bandit-1', 'aldric', 'bandit-2', 'bandit-3', 'bandit-captain-2', 'bandit-captain-3']);
    expect(store.getState().state.actors['bandit-captain-2']).toMatchObject({ name: 'Атаман 2', initiative: 4 });
    expect(store.getState().state.actors['bandit-captain-3'].name).toBe('Атаман 3');
    expect(activeIn(bar())).toBe('korrin');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect([...bar().querySelectorAll<HTMLElement>('[data-actor]')]).toHaveLength(8);
    expect(store.getState().state.actors['bandit-captain-2']).toBeDefined();
  });

  it('«Концентрация» в карточке: Lyra, «Hold Person», 1 мин → CONCENTRATION_STARTED с untilSec = +60 с; чип в корешке; у Bo форма называет, что сменит', () => {
    const { store } = mount();
    const bo = cardOf('Bo Tambernack');
    fireEvent.click(within(bo).getByRole('button', { name: 'Концентрация' }));
    expect(within(screen.getByRole('dialog', { name: 'Концентрация' })).getByText("Сменит: Hunter's Mark")).toBeInTheDocument();
    // Выбор другого актёра закрывает попап: он про того, у кого открыт.
    fireEvent.click(within(rowOf('Lyra Moonwhisper')).getByRole('button'));
    expect(screen.queryByRole('dialog', { name: 'Концентрация' })).toBeNull();
    const lyra = cardOf('Lyra Moonwhisper');
    fireEvent.click(within(lyra).getByRole('button', { name: 'Концентрация' }));
    const dlg = screen.getByRole('dialog', { name: 'Концентрация' });
    expect(within(dlg).queryByText(/^Сменит:/)).toBeNull();
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Заклинание' }), { target: { value: 'Hold Person' } });
    fireEvent.keyDown(within(dlg).getByRole('textbox', { name: 'Заклинание' }), { key: 'Enter' });
    const sec = store.getState().state.time.sec;
    expect(lastEvent(store)).toMatchObject({ type: 'CONCENTRATION_STARTED', payload: { actorId: 'lyra', spell: 'Hold Person', untilSec: sec + 60 } });
    expect(screen.queryByRole('dialog', { name: 'Концентрация' })).toBeNull();
    expect(rowOf('Lyra Moonwhisper')).toHaveTextContent('Hold Person');
    // Урон по Lyra теперь спрашивает про концентрацию — DC 10 при уроне 7.
    damageViaPopover(cardOf('Lyra Moonwhisper'), 7);
    expect(screen.getByRole('dialog', { name: /^Хиты: / })).toHaveTextContent('Hold Person');
    expect(screen.getByRole('dialog', { name: /^Хиты: / })).toHaveTextContent('DC 10');
  });

  it('пустые входящие — «Мир спокоен», ближайший праздник (Midsummer через 76 дней) и святой день; с предложениями строки нет; у игроков нет и её', () => {
    const { store } = mount();
    expect(screen.queryByText(/Мир спокоен/)).toBeNull();
    act(() => { for (const d of Object.values(store.getState().state.deltas)) store.getState().reject(d.id); });
    const calm = screen.getByText(/Мир спокоен/);
    expect(calm).toHaveTextContent('Мир спокоен. Ближайший праздник — Midsummer через 76 дней. Святой день через 35 дней — летнее солнцестояние: Amaunator, Mielikki.');
    expect(screen.getByLabelText('Журнал и отмена', { selector: 'aside' })).toHaveTextContent('Входящие');
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.queryByText(/Мир спокоен/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Концентрация' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Начать бой' })).toBeNull();
  });
});

describe('система предлагает, мастер решает: концентрация', () => {
  const reminders = () => screen.queryByRole('list', { name: 'Напоминания' });

  it('срок Hunter\'s Mark вышел после часа (T): напоминание «срок вышел»; «Позже» прячет и помнит это заклинание', () => {
    mount();
    expect(reminders()).toBeNull();
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    const list = reminders()!;
    expect(list).toHaveTextContent("Bo Tambernack: срок концентрации Hunter's Mark вышел");
    fireEvent.click(within(list).getByRole('button', { name: 'Позже' }));
    expect(reminders()).toBeNull();
    // Второй шаг времени — напоминание не возвращается: «Позже» помнит это заклинание с этим сроком.
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(reminders()).toBeNull();
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(reminders()).toBeNull();
  });

  it('«Снять» по сроку пишет CONCENTRATION_ENDED expired; чип гаснет; Ctrl+Z возвращает чип и напоминание', () => {
    const { store } = mount();
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.click(within(reminders()!).getByRole('button', { name: 'Снять' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONCENTRATION_ENDED', payload: { actorId: 'bo', reason: 'expired' } });
    expect(reminders()).toBeNull();
    expect(rowOf('Bo Tambernack')).not.toHaveTextContent("Hunter's Mark");
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(rowOf('Bo Tambernack')).toHaveTextContent("Hunter's Mark");
    expect(reminders()).toHaveTextContent('срок концентрации');
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(reminders()).toBeNull();
  });

  it('0 хитов при концентрации: в попапе вместо DC — «Без сознания», «Снять» → CONCENTRATION_ENDED unconscious; напоминание в панели о том же', () => {
    const { store } = mount();
    const dialog = damageViaPopover(cardOf('Bo Tambernack'), 41);
    expect(hpOf(store, 'bo').current).toBe(0);
    expect(within(dialog).queryByRole('group', { name: 'Проверка концентрации' })).toBeNull();
    const drop = within(dialog).getByRole('group', { name: 'Концентрация без сознания' });
    expect(drop).toHaveTextContent('Без сознания — концентрация падает');
    expect(reminders()).toHaveTextContent("Bo Tambernack без сознания — концентрация Hunter's Mark падает");
    fireEvent.click(within(drop).getByRole('button', { name: 'Снять' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONCENTRATION_ENDED', payload: { actorId: 'bo', reason: 'unconscious' } });
    expect(within(dialog).queryByRole('group', { name: 'Концентрация без сознания' })).toBeNull();
    expect(reminders()).toBeNull();
  });
});
