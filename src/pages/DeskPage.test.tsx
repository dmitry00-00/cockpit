// Стол (шаг 5): один стор, и корешок с карточкой читают из него одни хиты. Урон через попап виден в обоих
// местах и в State; Ctrl+Z возвращает и даёт тост; состояние из сетки становится чипом на корешке;
// плитки берут числа из листа; вкладка DM есть только на столе мастера; ни одной пиктограммы.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedEngine, seedLog, seedState } from '../campaign';
import { createEngineStore, memoryStore, parseLog, serializeLog, type EngineStoreApi } from '../engine';
import { actorCardProps } from '../components';
import { DeskPage, SKILL_LABEL, d20Formula, deskDollItems, dmFactsOf, isDeskHotkey, readText, splitHarptos, wallTimeOf } from './DeskPage';

const EMOJI = /\p{Extended_Pictographic}/u;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Детерминированные часы и id: журнал и лог читаются глазами. */
function fixed() {
  let t = 1_000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
}

/** Стор теста — сид с памятью вместо localStorage: jsdom-хранилище на страницу не влияет. */
function mount(store: EngineStoreApi = seedEngine({ persist: memoryStore(), ...fixed() }), dmView?: boolean) {
  const view = render(<DeskPage store={store} dmView={dmView} />);
  return { store, ...view };
}

const rowOf = (name: string) => screen.getByRole('article', { name });
const cardOf = (name: string) => screen.getByRole('region', { name });
/** Ячейка HP в полосе показателей — кнопка с title «Хиты». */
const hpCellOf = (card: HTMLElement) => within(card).getByTitle('Хиты');
const tab = (name: string) => {
  const t = screen.getByRole('tab', { name });
  fireEvent.mouseDown(t);
  fireEvent.click(t);
};
const hpOf = (store: EngineStoreApi, id: string) => store.getState().state.actors[id].hp;
const lastEvent = (store: EngineStoreApi) => store.getState().events.at(-1)!;

/** Урон через попап хитов: клик по ячейке HP, число в поле, «Урон». */
function damageViaPopover(card: HTMLElement, amount: number) {
  fireEvent.click(hpCellOf(card));
  const dialog = screen.getByRole('dialog', { name: /^Хиты: / });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Величина' }), { target: { value: String(amount) } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Урон' }));
  return dialog;
}

describe('стол на сиде', () => {
  it('часы, партия из state.party по порядку, карточка Bo по умолчанию: 41/49 в корешке и в карточке', () => {
    mount();
    expect(screen.getByTitle('Дата и время мира')).toHaveTextContent('15 Mirtul 1492 DR, 08:00');

    const list = screen.getByRole('list', { name: 'Партия' });
    const ids = within(list).getAllByRole('listitem').map(li => li.querySelector('[data-actor]')?.getAttribute('data-actor'));
    expect(ids).toEqual(['bo', 'korrin', 'lyra', 'aldric']);

    expect(within(rowOf('Bo Tambernack')).getByText('41/49')).toBeInTheDocument();
    expect(rowOf('Bo Tambernack')).toHaveAttribute('aria-current', 'true');

    const card = cardOf('Bo Tambernack');
    expect(card).toHaveAttribute('data-entity-type', 'pc');
    expect(hpCellOf(card)).toHaveTextContent('41/49');
    const badges = within(card).getAllByText(/./, { selector: '[data-part="badge"]' }).map(b => b.textContent);
    expect(badges).toEqual(['5 ур.', 'Следопыт']); // раса — строкой в обзоре, третий бейдж обрезал имя
    expect(within(card).getByText('Полурослик · Легконогий')).toBeInTheDocument();
    expect(within(card).getByTitle('Класс доспеха')).toHaveTextContent('16');
    expect(within(card).getByTitle('Пассивная внимательность')).toHaveTextContent('12');
    expect(within(card).getByTitle('Бонус мастерства')).toHaveTextContent('+3');
  });

  it('урон 8 через попап: 33/49 в корешке, в карточке и в попапе; в State одно число, и это оно', () => {
    const { store } = mount();
    const dialog = damageViaPopover(cardOf('Bo Tambernack'), 8);

    expect(hpOf(store, 'bo').current).toBe(33);
    expect(within(rowOf('Bo Tambernack')).getByText('33/49')).toBeInTheDocument();
    expect(hpCellOf(cardOf('Bo Tambernack'))).toHaveTextContent('33/49');
    expect(within(dialog).getByText('33/49')).toBeInTheDocument();
    expect(lastEvent(store)).toMatchObject({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 8 } });
    // Журнал — проекция лога: концентрация и два удара сида (предложения в журнал не идут) плюс этот урон.
    const journal = screen.getByRole('list', { name: 'Записи журнала' });
    const rows = within(journal).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    // Имя актёра в записи — @упоминание.
    expect(rows[4]).toHaveTextContent('Урон 8 по @Bo Tambernack');
  });

  it('Ctrl+Z после урона: 41/49 в обоих местах, тост «Отменено: …», запись журнала гаснет; Ctrl+Shift+Z возвращает', () => {
    const { store } = mount();
    damageViaPopover(cardOf('Bo Tambernack'), 8);
    expect(screen.getByRole('status')).toBeEmptyDOMElement(); // живой регион есть всегда, текст — только при тосте

    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(hpOf(store, 'bo').current).toBe(41);
    expect(within(rowOf('Bo Tambernack')).getByText('41/49')).toBeInTheDocument();
    expect(hpCellOf(cardOf('Bo Tambernack'))).toHaveTextContent('41/49');
    expect(screen.getByRole('status')).toHaveTextContent('Отменено: Урон 8 по Bo Tambernack');

    const journal = screen.getByRole('list', { name: 'Записи журнала' });
    const rows = within(journal).getAllByRole('listitem');
    expect(rows[4]).toHaveAttribute('data-undone', 'true');
    expect(rows[5]).toHaveTextContent('Отменено: Урон 8 по @Bo Tambernack');

    // Русская раскладка: код клавиши тот же, буква другая.
    fireEvent.keyDown(window, { key: 'я', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    expect(hpOf(store, 'bo').current).toBe(33);
    expect(screen.getByRole('status')).toHaveTextContent('Повторено: Урон 8 по Bo Tambernack');

    // Тост живёт до следующего действия: любой dispatch его снимает.
    act(() => { store.getState().heal('bo', 1); });
    expect(screen.getByRole('status')).toBeEmptyDOMElement(); // живой регион есть всегда, текст — только при тосте
  });

  it('кнопки «Отменить» и «Повторить» — то же, что клавиши; «Повторить» недоступна, пока нечего повторять', () => {
    const { store } = mount();
    const undo = screen.getByRole('button', { name: 'Отменить' });
    const redo = screen.getByRole('button', { name: 'Повторить' });
    expect(undo).toBeEnabled(); // сид — тоже лог: два удара отменяемы с первой секунды
    expect(redo).toBeDisabled();
    expect(undo).toHaveAttribute('title', expect.stringContaining('Ctrl+Z'));
    expect(redo).toHaveAttribute('title', expect.stringContaining('Ctrl+Shift+Z'));

    fireEvent.click(undo);
    expect(hpOf(store, 'captain').current).toBe(65);
    expect(redo).toBeEnabled();
    fireEvent.click(redo);
    expect(hpOf(store, 'captain').current).toBe(45);
    // Скрыть тост — не действие домена: лог не растёт.
    const len = store.getState().events.length;
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть тост' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement(); // живой регион есть всегда, текст — только при тосте
    expect(store.getState().events).toHaveLength(len);
  });

  it('вспышка полосы в корешке — 200 мс от последнего события лога, не от клика', () => {
    vi.useFakeTimers();
    const { store } = mount();
    const meter = () => within(rowOf('Bo Tambernack')).getByRole('meter', { name: 'Хиты Bo Tambernack' });
    expect(meter()).toHaveClass('shadow-bevel-in');

    act(() => { store.getState().damage('bo', 5); });
    expect(meter()).toHaveClass('shadow-flash-damage');
    act(() => { vi.advanceTimersByTime(199); });
    expect(meter()).toHaveClass('shadow-flash-damage');
    act(() => { vi.advanceTimersByTime(1); });
    expect(meter()).toHaveClass('shadow-bevel-in');

    // Отмена урона поднимает хиты — вспышка лечения.
    act(() => { store.getState().undo(); });
    expect(meter()).toHaveClass('shadow-flash-heal');
    act(() => { vi.advanceTimersByTime(200); });
    expect(meter()).toHaveClass('shadow-bevel-in');
  });

  it('«Ослеплён» в сетке состояний → CONDITION_ADDED в логе, ячейка нажата, чип на корешке; снятие чипом → CONDITION_REMOVED', () => {
    const { store } = mount();
    tab('Состояния');
    const cell = screen.getByRole('button', { name: 'Ослеплён' });
    expect(cell).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(cell);

    expect(lastEvent(store)).toMatchObject({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'blinded' } });
    expect(lastEvent(store).payload).not.toHaveProperty('level');
    expect(screen.getByRole('button', { name: 'Ослеплён' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rowOf('Bo Tambernack')).getByText('Ослеплён', { selector: 'span' })).toBeInTheDocument();

    // Истощение — уровнями: «+» дважды → уровень 2 в ячейке и в чипе корешка.
    fireEvent.click(screen.getByRole('button', { name: /^Истощение: повысить уровень/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Истощение: повысить уровень/ }));
    expect(store.getState().state.actors.bo.conditions.exhaustion?.level).toBe(2);
    expect(screen.getByRole('group', { name: 'Истощение' })).toHaveAttribute('data-level', '2');
    const chip = within(rowOf('Bo Tambernack')).getByText('Истощение', { selector: 'span' }).closest('[data-kind]') as HTMLElement;
    expect(within(chip).getByTitle('Уровень истощения')).toHaveTextContent('2');

    // Чип в обзоре снимает состояние одним кликом; истощение — на уровень ниже, а не в ноль.
    tab('Обзор');
    fireEvent.click(screen.getByRole('button', { name: 'Снять: Ослеплён' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'blinded' } });
    expect(within(rowOf('Bo Tambernack')).queryByText('Ослеплён', { selector: 'span' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Снять: Истощение' }));
    expect(store.getState().state.actors.bo.conditions.exhaustion?.level).toBe(1);
  });

  it('плитки обзора считаются из листа: Bo DEX +3 (16), CHA −1 (U+2212), Скрытность +6 с владением; клик — DICE_ROLLED 1d20+3', () => {
    const { store } = mount();
    const dex = screen.getByRole('button', { name: /^DEX/ });
    expect(dex).toHaveTextContent('+3');
    expect(within(dex).getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^CHA/ })).toHaveTextContent('−1');
    expect(screen.getByRole('button', { name: /^CHA/ }).textContent).not.toContain('-');

    const stealth = screen.getByRole('button', { name: /^Скрытность/ });
    expect(stealth).toHaveTextContent('+6');
    expect(within(stealth).getByRole('img', { name: 'владение' })).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^Внимательность/ })).queryByRole('img', { name: 'владение' })).toBeNull();
    // Все 18 навыков по-русски и все шесть характеристик кодами.
    for (const label of Object.values(SKILL_LABEL)) expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();

    fireEvent.click(dex);
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { formula: '1d20+3', label: 'DEX · Bo Tambernack', hidden: false } });
    fireEvent.click(stealth);
    expect(lastEvent(store).payload).toMatchObject({ formula: '1d20+6', label: 'Скрытность · Bo Tambernack' });
    // Бросок state не меняет, но в журнале виден сразу: страница подписана на события, а не только на state.
    const journal = screen.getByRole('list', { name: 'Записи журнала' });
    expect(within(journal).getAllByRole('listitem').at(-1)).toHaveTextContent(/^15 Mirtul08:00\d\d:\d\dБросокСкрытность · @Bo Tambernack: 1d20\+6 = /);
  });

  it('умения класса и черты расы — по id из компендиума с текстом; пустой текст — только имя', () => {
    mount();
    const features = screen.getByRole('region', { name: /^Умения класса/ });
    // «Избранный враг» в таблице без текста — имя есть, абзаца нет.
    expect(within(features).getByText(/Избранный враг/)).toBeInTheDocument();
    expect(features.querySelectorAll('p').length).toBeGreaterThan(0);
    expect(features.querySelectorAll('p').length).toBeLessThan(5);
    expect(within(features).getByText(/Первозданная осведомленность/)).toBeInTheDocument();
    const traits = screen.getByRole('region', { name: 'Черты расы' });
    expect(within(traits).getByText('Везучий')).toBeInTheDocument();
    expect(within(traits).getByText('Проворство Полуросликов')).toBeInTheDocument();
    expect(within(traits).getByText(/спасброски от испуга/)).toBeInTheDocument();
  });

  it('клик по строке корешка выбирает карточку: Korrin — «5 ур.» · Воин · Дварф, AC 18, PP 14; снаряжение — кольчуга и щит в кистях', () => {
    mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    expect(rowOf('Korrin Battlehammer')).toHaveAttribute('aria-current', 'true');
    expect(rowOf('Bo Tambernack')).not.toHaveAttribute('aria-current');
    const card = cardOf('Korrin Battlehammer');
    const badges = within(card).getAllByText(/./, { selector: '[data-part="badge"]' }).map(b => b.textContent);
    expect(badges).toEqual(['5 ур.', 'Воин']);
    expect(within(card).getByTitle('Класс доспеха')).toHaveTextContent('18');
    expect(within(card).getByTitle('Пассивная внимательность')).toHaveTextContent('14');

    tab('Снаряжение');
    expect(screen.getByRole('button', { name: 'Доспех: Chain mail' })).toHaveAttribute('data-filled', 'true');
    expect(screen.getByRole('button', { name: 'Кисти: Shield · AC +2' })).toHaveAttribute('data-filled', 'true');
    expect(screen.getByRole('button', { name: 'Голова: пусто' })).toHaveAttribute('data-filled', 'false');
    expect(screen.getAllByRole('button', { name: /: пусто$/ })).toHaveLength(7);
  });

  it('вкладка DM появляется только при секретах об актёре и только на столе мастера; без секретов её нет вовсе', () => {
    // В сиде dm-факт один и про локацию: у Bo секретов нет — и вкладки нет (пустая секция не показывается).
    const { unmount } = mount();
    expect(screen.queryByRole('tab', { name: 'DM' })).toBeNull();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Обзор', 'Состояния', 'Снаряжение']);
    unmount();

    const withSecret = seedState();
    withSecret.facts['f-bo-secret'] = { id: 'f-bo-secret', text: 'Bo тайно должен Zhentarim 200 золотых', visibility: 'dm', subjectId: 'bo' };
    expect(dmFactsOf(withSecret.actors.bo, withSecret.facts)).toHaveLength(1);
    const { unmount: unmount2 } = mount(createEngineStore(withSecret, { persist: memoryStore(), ...fixed() }));
    tab('DM');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Bo тайно должен Zhentarim');
    unmount2();

    // Режим игроков: вкладки нет в DOM даже при секрете — не скрыта, а отсутствует.
    mount(createEngineStore(withSecret, { persist: memoryStore(), ...fixed() }), false);
    expect(screen.queryByRole('tab', { name: 'DM' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Обзор' })).toBeInTheDocument();
  });

  it('промпт концентрации после урона Bo: «Потерял» → CONCENTRATION_ENDED, чип гаснет в корешке и карточке, Ctrl+Z возвращает', () => {
    const { store } = mount();
    expect(within(rowOf('Bo Tambernack')).getAllByText("Hunter's Mark").length).toBeGreaterThan(0);
    const dialog = damageViaPopover(cardOf('Bo Tambernack'), 8);
    const prompt = within(dialog).getByRole('group', { name: 'Проверка концентрации' });
    expect(prompt).toHaveTextContent("Hunter's Mark");
    expect(prompt).toHaveTextContent('DC 10');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Потерял' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONCENTRATION_ENDED', payload: { actorId: 'bo', reason: 'save' } });
    expect(store.getState().state.actors.bo.concentration).toBeUndefined();
    expect(within(rowOf('Bo Tambernack')).queryAllByText("Hunter's Mark")).toHaveLength(0);
    expect(within(cardOf('Bo Tambernack')).queryAllByText("Hunter's Mark")).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByRole('status')).toHaveTextContent("Отменено: Концентрация потеряна на спасброске: Hunter's Mark — Bo Tambernack");
    expect(within(rowOf('Bo Tambernack')).getAllByText("Hunter's Mark").length).toBeGreaterThan(0);
  });

  it('чип концентрации в карточке снимается кнопкой — CONCENTRATION_ENDED по решению мастера; чип эффекта (Mage Armor) кнопки не имеет', () => {
    const { store } = mount();
    const card = cardOf('Bo Tambernack');
    fireEvent.click(within(card).getByRole('button', { name: /^Снять: Hunter's Mark/ }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONCENTRATION_ENDED', payload: { actorId: 'bo', reason: 'dm' } });
    fireEvent.click(rowOf('Lyra Moonwhisper'));
    expect(within(cardOf('Lyra Moonwhisper')).getAllByText('Mage Armor').length).toBeGreaterThan(0);
    expect(within(cardOf('Lyra Moonwhisper')).queryByRole('button', { name: /^Снять: Mage Armor/ })).toBeNull();
  });

  it('стопка противников — монстры, что не выбыли; клик открывает карточку монстра: CR 2 · Medium, SPD 30, действия из SRD', () => {
    mount();
    const stack = screen.getByRole('group', { name: 'Противники' });
    const rows = within(stack).getAllByRole('button');
    expect(rows.map(r => r.getAttribute('title'))).toEqual(['Bandit Captain · CR 2', 'Bandit 1 · CR 1/8', 'Bandit 2 · CR 1/8', 'Bandit 3 · CR 1/8']);
    fireEvent.click(rows[0]);
    const card = cardOf('Bandit Captain');
    expect(card).toHaveAttribute('data-entity-type', 'monster');
    const badges = within(card).getAllByText(/./, { selector: '[data-part="badge"]' }).map(b => b.textContent);
    expect(badges).toEqual(['CR 2', 'Medium']);
    expect(within(card).getByTitle('Скорость, футов')).toHaveTextContent('30');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Обзор', 'Действия', 'Состояния']);
    expect(screen.getByRole('button', { name: /^STR/ })).toHaveTextContent('+2');
    tab('Действия');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Multiattack');
  });

  it('кнопка «Хиты» в карточке открывает тот же попап; повторный клик по ячейке HP его не закрывает; Esc закрывает', async () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    const opener = screen.getByRole('button', { name: 'Хиты' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' });
    expect(within(dialog).getByRole('textbox', { name: 'Величина' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Хиты' })).toHaveAttribute('aria-expanded', 'true');

    // Ячейка HP — открывающий элемент, а не «клик вне»: pointerdown по ней попап не гасит.
    fireEvent.pointerDown(hpCellOf(cardOf('Bo Tambernack')), { pointerType: 'mouse' });
    fireEvent.click(hpCellOf(cardOf('Bo Tambernack')));
    expect(screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Попап открыт не Popover.Trigger, поэтому фокус после Esc возвращаем в ячейку HP сами (Radix делает это в setTimeout 0).
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(hpCellOf(cardOf('Bo Tambernack'))).toHaveFocus();
  });

  it('в разметке стола нет эмодзи', () => {
    const { container } = mount();
    expect(container.textContent ?? '').not.toMatch(EMOJI);
    expect(container.innerHTML).not.toMatch(EMOJI);
  });
});

/* ---------- Бой (шаг 6): сценарий F2 мышью — урон → промпт концентрации → следующий ход → отмена ---------- */

// Полоса инициативы — <footer aria-label="Бой">; иконки с тем же aria-label в ней нет (у сетки и зоны — свои подписи).
const bar = () => screen.getByLabelText('Бой', { selector: 'footer' });
const grid = () => screen.getByRole('group', { name: 'Боевая сетка' });
const tokenIn = (zone: HTMLElement, id: string) => zone.querySelector<HTMLElement>(`[data-actor="${id}"]`);
const activeIn = (zone: HTMLElement) => zone.querySelector<HTMLElement>('[data-actor][aria-current="true"]')?.dataset.actor;
/** «Начать бой» открывает редактор инициативы (броски сида предзаполнены); «Начать бой» в нём пишет ENCOUNTER_STARTED. */
const startCombat = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Начать бой' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Инициатива' })).getByRole('button', { name: 'Начать бой' }));
};

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

/* ---------- Журнал и нити (шаг 7): принятая дельта в журнале связана с породившим её фактом по causeId ---------- */

const journalView = () => screen.getByRole('region', { name: 'Журнал сессии' });
const inbox = () => screen.getByRole('list', { name: 'Входящие' });
const deltaCard = (subject: string) => screen.getByRole('article', { name: `Предложение: ${subject}` });
const openJournal = () => fireEvent.keyDown(window, { key: 'j', code: 'KeyJ' });

describe('журнал и нити', () => {
  it('J открывает журнал сессии: четыре записи сида, фильтр по нити «The Missing Caravan» оставляет заметку о прибытии; карточка нити выбрана; Esc возвращает стол', () => {
    mount();
    expect(screen.queryByRole('region', { name: 'Журнал сессии' })).toBeNull();
    openJournal();
    const view = journalView();
    expect(within(view).getByText('Записей: 4 из 4')).toBeInTheDocument();
    expect(within(view).getAllByRole('article')).toHaveLength(4);
    fireEvent.click(within(view).getByRole('button', { name: /#The Missing Caravan/ }));
    expect(within(view).getByText('Записей: 1 из 4')).toBeInTheDocument();
    const entry = within(view).getByRole('article');
    expect(entry).toHaveAttribute('aria-label', 'Партия прибыла в Neverwinter через Triboar Trail #The Missing Caravan');
    expect(entry).toHaveTextContent('Партия прибыла в @Neverwinter через @Triboar Trail #The Missing Caravan');
    expect(within(entry).getByRole('button', { name: 'Открыть карточку: Neverwinter' })).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: 'Нить: The Missing Caravan' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Нить: The Missing Caravan' })).toHaveAttribute('data-thread', 'thr-missing-caravan');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Журнал сессии' })).toBeNull();
    expect(cardOf('Bo Tambernack')).toBeInTheDocument();
  });

  it('заметка — NOTE_ADDED с нитями фильтра и масштабом; упоминание актёра в записи открывает его карточку', () => {
    const { store } = mount();
    openJournal();
    const view = journalView();
    fireEvent.click(within(view).getByRole('button', { name: /#Old Owl Well/ }));
    const input = within(view).getByRole('textbox', { name: 'Заметка' });
    fireEvent.change(input, { target: { value: 'Korrin Battlehammer расспрашивает о Zhentarim' } });
    fireEvent.submit(input.closest('form')!);
    expect(lastEvent(store)).toMatchObject({ type: 'NOTE_ADDED', payload: { text: 'Korrin Battlehammer расспрашивает о Zhentarim', threadIds: ['thr-old-owl-well'], scale: 'settlement' } });
    expect(input).toHaveValue('');
    const entry = within(view).getAllByRole('article').at(-1)!;
    expect(within(entry).getByRole('button', { name: 'Открыть карточку: Zhentarim' })).toBeInTheDocument();
    fireEvent.click(within(entry).getByRole('button', { name: 'Открыть карточку: Korrin Battlehammer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Стол' }));
    expect(cardOf('Korrin Battlehammer')).toBeInTheDocument();
  });

  it('входящие: «Принять» слух → WORLD_DELTA_ACCEPTED в журнале стола; в журнале сессии запись несёт каскад «факт → предложение»; карточка нити показывает каскад; Ctrl+Z возвращает предложение во входящие', () => {
    const { store } = mount();
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(4);
    const rumor = deltaCard('Слух в таверне · Neverwinter');
    expect(rumor).toHaveTextContent('тишина');
    fireEvent.click(within(rumor).getByRole('button', { name: 'Принять' }));
    expect(lastEvent(store)).toMatchObject({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd-owl-well-rumor', causeId: 'f-owl-well-undead', was: 'тишина' } });
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Принято: Слух в таверне · @Neverwinter — тишина → у @Old Owl Well видели восставших мертвецов');

    openJournal();
    const view = journalView();
    const cascade = within(view).getByRole('list', { name: 'Каскад' });
    const steps = within(cascade).getAllByRole('listitem').map(li => li.textContent);
    expect(steps[0]).toContain('У Old Owl Well видели восставших мертвецов');
    expect(steps[1]).toContain('Слух в таверне · Neverwinter: тишина → у Old Owl Well видели восставших мертвецов');
    const thread = screen.getByRole('region', { name: 'Нить: Old Owl Well' });
    expect(thread).toHaveTextContent('каскад');
    expect(thread).toHaveTextContent('У Old Owl Well видели восставших мертвецов → Слух в таверне');

    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('Отменено: Принято: Слух в таверне · Neverwinter');
    expect(store.getState().state.deltas['d-owl-well-rumor'].status).toBe('pending');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('«Отклонить» — секрет мастера: запись есть на столе мастера и отсутствует в журнале игроков; «Переброс» — следующий вариант', () => {
    const { store } = mount();
    fireEvent.click(within(deltaCard('Zhentarim · Triboar Trail')).getByRole('button', { name: 'Переброс' }));
    expect(lastEvent(store)).toMatchObject({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId: 'd-zhentarim-trail', variantId: 'v2' } });
    expect(deltaCard('Zhentarim · Triboar Trail')).toHaveTextContent('Harpers перехватили курьера');
    expect(within(deltaCard('Цены на железо и оружие · Neverwinter')).queryByRole('button', { name: 'Переброс' })).toBeNull();

    fireEvent.click(within(deltaCard('Цены на железо и оружие · Neverwinter')).getByRole('button', { name: 'Отклонить' }));
    expect(lastEvent(store).type).toBe('WORLD_DELTA_REJECTED');
    openJournal();
    const secret = within(journalView()).getAllByRole('article').at(-1)!;
    expect(secret).toHaveAttribute('data-secret');
    expect(secret).toHaveTextContent('Отклонено');
    cleanup();

    mount(store, false);
    openJournal();
    expect(within(journalView()).queryAllByRole('article').some(a => a.hasAttribute('data-secret'))).toBe(false);
    expect(within(journalView()).getByText(/Записей: 4 из 4/)).toBeInTheDocument();
  });

  it('напоминания о секретах: «Позже» прячет до перезагрузки, «Раскрыть» → FACT_REVEALED и запись «Открыто игрокам»', () => {
    const { store } = mount();
    openJournal();
    const view = journalView();
    expect(within(view).getAllByRole('group', { name: 'Напоминание' })).toHaveLength(2);
    const agent = within(view).getAllByRole('group', { name: 'Напоминание' }).find(g => g.textContent?.includes('Агент Zhentarim'))!;
    fireEvent.click(within(agent).getByRole('button', { name: 'Позже' }));
    expect(within(view).getAllByRole('group', { name: 'Напоминание' })).toHaveLength(1);
    fireEvent.click(within(view).getByRole('button', { name: 'Раскрыть' }));
    expect(lastEvent(store)).toMatchObject({ type: 'FACT_REVEALED', payload: { factId: 'f-owl-well-undead', audience: 'players' } });
    expect(within(view).queryAllByRole('group', { name: 'Напоминание' })).toHaveLength(0);
    expect(within(view).getAllByRole('article').at(-1)).toHaveTextContent('Открыто игрокам: У @Old Owl Well видели восставших мертвецов');
  });

  it('масштаб: урон в бою — «Бой»; фильтр по уровню оставляет только записи боя', () => {
    const { store } = mount();
    startCombat();
    act(() => store.getState().damage('bandit-1', 3));
    openJournal();
    const view = journalView();
    fireEvent.click(within(view).getByRole('button', { name: /Бой/ }));
    const texts = within(view).getAllByRole('article').map(a => a.getAttribute('aria-label'));
    expect(texts.some(t => t?.startsWith('Бой начался'))).toBe(true);
    expect(texts.some(t => t?.startsWith('Урон 3'))).toBe(true);
    expect(texts.some(t => t?.startsWith('Партия прибыла'))).toBe(false);
  });
});

/* ---------- Шаг времени (шаг 8): сценарий F6 — темп, фаза суток, небесные тела, сводка, решения, отмена ---------- */

const tempoGroup = () => screen.getByRole('group', { name: 'Темп времени' });
const timeView = () => screen.getByRole('region', { name: 'Шаг времени' });
const step = () => fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Шаг' }));

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
    const types = store.getState().events.slice(-3).map(e => e.type);
    expect(types).toEqual(['TIME_ADVANCED', 'WORLD_DELTA_PROPOSED', 'WORLD_DELTA_PROPOSED']);
    expect(screen.getByLabelText('Мировые часы')).toHaveTextContent('25 Mirtul 1492 DR');
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(6);

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
    // Ещё раз назад — переброс; ещё раз — принятие пачкой возвращает влияние.
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(deltaCard('Zhentarim · Triboar Trail')).toHaveTextContent('караван всё ещё не найден');
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

/* ---------- Глазами игроков (шаг 9): секретов нет в DOM — не скрыты стилями, а отсутствуют ---------- */

/** Стол со всеми видами секретов: скрытый бросок, отклонённое и принятое предложения, ждущие предложения, факты мастера. */
function storeWithSecrets() {
  const state = seedState();
  // Секрет об актёре — иначе вкладки DM у карточки не бывает вовсе (факты сида привязаны к местам).
  state.facts['f-bo-secret'] = { id: 'f-bo-secret', text: 'Bo должен Zhentarim двести золотых', visibility: 'dm', subjectId: 'bo' };
  const store = createEngineStore(state, { persist: { load: () => seedLog(), save: () => {}, clear: () => {} }, ...fixed() });
  const api = store.getState();
  api.rollDice('1d20+9', { label: 'Скрытность · Bo Tambernack', hidden: true });
  api.reject('d-lycanthropes', 'не верю');
  api.accept('d-owl-well-rumor');
  api.reveal('f-zhentarim-agent');
  api.undo(); // открыто и тут же отменено — факт снова секрет, и обе записи о нём тоже
  return store;
}

/** Секреты и инструменты мастера — строки, которых на столе игроков быть не должно нигде: ни в тексте, ни в title/aria/data. */
const SECRET_TEXTS = [
  'Скрытность · Bo Tambernack', 'скрытый', 'Отклонено', 'Принято', 'Симуляция', 'Входящие', 'Что изменилось',
  'Zhentarim · Triboar Trail', 'Цены на железо', 'Встречи с ликантропами', 'Слух в таверне',
  'У Old Owl Well видели восставших мертвецов', 'Агент Zhentarim замечен у ворот', 'Bo должен Zhentarim', 'Открыто игрокам',
  'Напоминание', 'Раскрыть', 'секрет', 'каскад', 'без внимания',
  'Темп времени', 'Начать бой', 'Закончить бой', 'Отменить', 'Повторить', 'Заметка мастера', 'Записать', 'Снять:', 'Убрать из боя', '· Space', '· Enter',
  'Добавить противника', 'Начать концентрацию', 'вписать новичка', 'Мир спокоен', 'Отдых: короткий', 'Новая сессия',
  'срок концентрации', 'концентрация падает', 'Напоминания', 'Файл сессии', 'Сохранить журнал',
  'Потратить:', 'Вернуть:', 'Срок состояния', 'срок состояния',
];

/** Проверяется весь документ — порталы Radix (попап хитов, тултипы) живут вне контейнера. */
function expectNoSecrets() {
  const html = document.body.innerHTML;
  const text = document.body.textContent ?? '';
  for (const t of SECRET_TEXTS) {
    expect(text, `текст «${t}»`).not.toContain(t);
    expect(html, `разметка «${t}»`).not.toContain(t);
  }
  expect(document.body.querySelectorAll('[data-secret], [data-delta], [role="dialog"], input[type="checkbox"]')).toHaveLength(0);
  expect(screen.queryAllByRole('tab').map(t => t.textContent)).not.toContain('DM');
  expect(screen.queryAllByRole('tab').map(t => t.textContent)).not.toContain('Состояния');
}

describe('глазами игроков', () => {
  it('P включает режим: рамка и бирка есть, стол назван столом игроков; P возвращает мастера — обёртки нет вовсе', () => {
    const { container } = mount();
    expect(container.querySelector('[data-player-view]')).toBeNull();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    const frame = container.querySelector('[data-player-view]')!;
    expect(frame).not.toBeNull();
    expect(frame.querySelector('[data-part="ring"]')).not.toBeNull();
    expect(frame).toHaveTextContent('Глазами игроков · P');
    expect(screen.getByRole('main', { name: 'Стол игроков' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(container.querySelector('[data-player-view]')).toBeNull();
    expect(screen.getByRole('main', { name: 'Стол' })).toBeInTheDocument();
    // Кнопка «Игроки» — тот же переключатель; на столе игроков её нет, назад — только P.
    fireEvent.click(screen.getByRole('button', { name: 'Игроки' }));
    expect(container.querySelector('[data-player-view]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Игроки' })).toBeNull();
  });

  it('на столе игроков ни один секрет не присутствует в DOM — в столе, в журнале сессии, в бою и во времени', () => {
    const { container, store } = mount(storeWithSecrets());
    // У мастера секреты на месте — иначе проверка ниже ничего не доказывает.
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toContain('DM');
    expect(document.body.textContent).toContain('Отклонено');
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expectNoSecrets();
    // Что видно: партия, карточка Bo без вкладки DM, журнал без секретов, хроника с открытыми нитями, обычный бросок.
    expect(screen.getByRole('region', { name: 'Bo Tambernack' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).not.toContain('DM');
    expect(screen.getByLabelText('Хроника похода', { selector: 'aside' })).toHaveTextContent('The Missing Caravan');
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Партия прибыла');

    openJournal();
    expectNoSecrets();
    expect(within(journalView()).getByText(/Записей: 4 из 4/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    // Вид «Время» игрокам недоступен; T, R и Space — клавиши мастера, здесь молчат; бросок с плитки виден без переключателя скрытости.
    expect(screen.queryByRole('button', { name: 'Время' })).toBeNull();
    const before = store.getState().events.length;
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
    expect(store.getState().events).toHaveLength(before);
    fireEvent.click(screen.getByRole('button', { name: /^DEX/ }));
    const modal = screen.getByRole('region', { name: /^Бросок/ });
    expect(modal).toHaveTextContent('DEX · Bo Tambernack');
    expect(within(modal).queryByRole('checkbox')).toBeNull();
    expectNoSecrets();
    expect(container.querySelector('[data-player-view]')).not.toBeNull();
  });

  it('стол, поднятый с dmView=false, — сразу стол игроков; бой на нём тоже без секретов', () => {
    const store = storeWithSecrets();
    const { container } = mount(store, false);
    expect(container.querySelector('[data-player-view]')).not.toBeNull();
    act(() => store.getState().startEncounter());
    expectNoSecrets();
    expect(bar()).toBeInTheDocument();
    // Токен выбирает актёра, но попап хитов не открывает; Space ход не делает.
    fireEvent.click(tokenIn(grid(), 'captain')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(store.getState().state.encounter.turnIndex).toBe(0);
    expectNoSecrets();
    // Мастер вернулся — ничего не потерял: вкладка DM, входящие, тост.
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    fireEvent.click(rowOf('Bo Tambernack'));
    fireEvent.click(screen.getByRole('button', { name: 'Карточка' })); // в бою карточка — по кнопке
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toContain('DM');
    expect(inbox()).toBeInTheDocument();
  });
});

/* ---------- Лестница масштабов (шаг 10): `[` и `]` двигают уровень, точка фокуса сохраняется ---------- */

const ladderNav = () => screen.getByRole('navigation', { name: 'Лестница масштабов' });
const stepOf = (scale: string) => ladderNav().querySelector<HTMLElement>(`[data-scale="${scale}"]`)!;
const currentStep = () => ladderNav().querySelector<HTMLElement>('[aria-current="true"]')!.dataset.scale;
const worldView = () => screen.getByRole('region', { name: 'Мир' });
const levelHead = () => worldView().querySelector<HTMLElement>('[data-part="level"]')!;
const here = () => screen.queryByRole('group', { name: 'Здесь' });
const up = () => fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
const down = () => fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
const tempoOn = () => within(tempoGroup()).getByRole('radio', { checked: true }).textContent;

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

  it('«Добавить» вне боя: блок SRD, имя «Bandit 4» по подсказке → ACTOR_SPAWNED bandit-4; он в стопке противников и в слоте карточки; Ctrl+Z убирает', () => {
    const { store } = mount();
    expect(within(foesStack()).getAllByRole('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    const dlg = spawnDialog();
    // Библиотека — 45 блоков SRD; поиск «bandit» оставляет двоих, первый — Bandit, и имя подсказано по счёту сида.
    expect(within(within(dlg).getByRole('group', { name: 'Блок SRD' })).getAllByRole('button').length).toBeGreaterThanOrEqual(45);
    fireEvent.change(within(dlg).getByRole('searchbox', { name: 'Найти блок' }), { target: { value: 'bandit' } });
    expect(within(within(dlg).getByRole('group', { name: 'Блок SRD' })).getAllByRole('button')).toHaveLength(2);
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
    fireEvent.click(within(dlg).getByRole('button', { name: /^Bandit Captain/ }));
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

  it('пустые входящие — «Мир спокоен» и ближайший праздник (Midsummer через 76 дней); с предложениями строки нет; у игроков нет и её', () => {
    const { store } = mount();
    expect(screen.queryByText(/Мир спокоен/)).toBeNull();
    act(() => { for (const d of Object.values(store.getState().state.deltas)) store.getState().reject(d.id); });
    const calm = screen.getByText(/Мир спокоен/);
    expect(calm).toHaveTextContent('Мир спокоен. Ближайший праздник — Midsummer через 76 дней.');
    expect(screen.getByLabelText('Журнал и отмена', { selector: 'aside' })).toHaveTextContent('Входящие');
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.queryByText(/Мир спокоен/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Концентрация' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Начать бой' })).toBeNull();
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

describe('лист персонажа: ресурсы, сроки состояний, ход (решение владельца 21.09.2026)', () => {
  const resourcesOf = (card: HTMLElement) => within(card).getByRole('region', { name: 'Ресурсы' });
  const reminders = () => screen.queryByRole('list', { name: 'Напоминания' });

  it('шапка листа по карточке владельца: раса, класс, мировоззрение, скорость, тело; спасброски следопыта — STR и DEX с владением', () => {
    mount();
    const card = cardOf('Bo Tambernack');
    const header = card.querySelector('[data-part="pc-header"]')!;
    expect(header).toHaveTextContent('РасаПолурослик · ЛегконогийКлассСледопыт · 5 ур.МировоззрениеНейтральныйСкорость25 фтТело97 см · 17 кг · 26 лет');
    expect(within(card).getByTitle('Strength: +1 · спасбросок +4 (владение)')).toBeInTheDocument();
    expect(within(card).getByTitle('Dexterity: +3 · спасбросок +6 (владение)')).toBeInTheDocument();
    expect(within(card).getByTitle('Wisdom: +2 · спасбросок +2')).toBeInTheDocument();
    // У Korrin на листе нет мировоззрения и тела — строк нет, пустых подписей не бывает.
    fireEvent.click(rowOf('Korrin Battlehammer'));
    const k = cardOf('Korrin Battlehammer').querySelector('[data-part="pc-header"]')!;
    expect(k).not.toHaveTextContent('Мировоззрение');
    expect(k).toHaveTextContent('Скорость25 фт');
  });

  it('ресурсы из таблицы класса и умений SRD: у Bo ячейки 4 и 2, у Korrin второе дыхание и всплеск; пипка тратит и возвращает — события с max, журнал «3 из 4», Ctrl+Z', () => {
    const { store } = mount();
    const bo = resourcesOf(cardOf('Bo Tambernack'));
    expect(within(bo).getByRole('group', { name: 'Ячейки 1-го круга: 4 из 4' })).toBeInTheDocument();
    expect(within(bo).getByRole('group', { name: 'Ячейки 2-го круга: 2 из 2' })).toBeInTheDocument();
    fireEvent.click(within(bo).getAllByRole('button', { name: 'Потратить: Ячейки 1-го круга' })[0]);
    expect(lastEvent(store)).toMatchObject({ type: 'RESOURCE_SPENT', payload: { actorId: 'bo', resourceId: 'slot-1', amount: 1, max: 4 } });
    expect(store.getState().state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 1 });
    expect(within(resourcesOf(cardOf('Bo Tambernack'))).getByRole('group', { name: 'Ячейки 1-го круга: 3 из 4' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Ячейки 1-го круга −1: @Bo Tambernack (3 из 4)');
    fireEvent.click(within(resourcesOf(cardOf('Bo Tambernack'))).getByRole('button', { name: 'Вернуть: Ячейки 1-го круга' }));
    expect(lastEvent(store)).toMatchObject({ type: 'RESOURCE_RESTORED', payload: { actorId: 'bo', resourceId: 'slot-1', amount: 1, max: 4 } });
    expect(store.getState().state.actors.bo.resourcesSpent).toBeUndefined();
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(store.getState().state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 1 });
    fireEvent.click(rowOf('Korrin Battlehammer'));
    const korrin = resourcesOf(cardOf('Korrin Battlehammer'));
    expect(within(korrin).getByRole('group', { name: 'Второе дыхание: 1 из 1' })).toHaveAttribute('title', 'Второе дыхание: 1 из 1 · вернёт короткий отдых');
    expect(within(korrin).getByRole('group', { name: 'Всплеск действий: 1 из 1' })).toBeInTheDocument();
  });

  it('короткий отдых возвращает потраченное с правилом «короткий» (форма показывает), долгий — всё; у монстра секции «Ресурсы» нет', () => {
    const { store } = mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    fireEvent.click(within(resourcesOf(cardOf('Korrin Battlehammer'))).getByRole('button', { name: 'Потратить: Второе дыхание' }));
    fireEvent.click(rowOf('Bo Tambernack'));
    fireEvent.click(within(resourcesOf(cardOf('Bo Tambernack'))).getAllByRole('button', { name: 'Потратить: Ячейки 2-го круга' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Отдых' }));
    const dlg = screen.getByRole('dialog', { name: 'Отдых' });
    expect(dlg.querySelector('[data-actor="korrin"] [data-part="short-note"]')).toHaveTextContent('второе дыхание');
    expect(dlg.querySelector('[data-actor="bo"] [data-part="short-note"]')).toBeNull(); // ячейки — только долгий
    fireEvent.click(within(dlg).getByRole('button', { name: 'Отдохнуть' }));
    expect(lastEvent(store)).toMatchObject({ type: 'REST_TAKEN', payload: { kind: 'short', resources: [{ actorId: 'korrin', resourceId: 'second-wind' }] } });
    expect(store.getState().state.actors.korrin.resourcesSpent).toBeUndefined();
    expect(store.getState().state.actors.bo.resourcesSpent).toEqual({ 'slot-2': 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Отдых' }));
    const dlg2 = screen.getByRole('dialog', { name: 'Отдых' });
    fireEvent.click(within(dlg2).getByRole('radio', { name: 'Долгий · 8 ч' }));
    expect(dlg2.querySelector('[data-actor="bo"] [data-part="long-note"]')).toHaveTextContent('ячейки 2-го круга');
    fireEvent.click(within(dlg2).getByRole('button', { name: 'Отдохнуть' }));
    expect(store.getState().state.actors.bo.resourcesSpent).toBeUndefined();
    fireEvent.click(within(screen.getByRole('group', { name: 'Противники' })).getAllByRole('button')[0]);
    expect(within(cardOf('Bandit Captain')).queryByRole('region', { name: 'Ресурсы' })).toBeNull();
  });

  it('срок состояния: «10 мин» перед кликом по сетке → CONDITION_ADDED с untilSec, чип «10 мин»; через два шага — «истекло» и напоминание «Снять / Позже»', () => {
    const { store } = mount();
    tab('Состояния');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Срок состояния' })).getByRole('radio', { name: '10 мин' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отравлен' }));
    const sec = store.getState().state.time.sec;
    expect(lastEvent(store)).toMatchObject({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned', untilSec: sec + 600 } });
    expect(rowOf('Bo Tambernack')).toHaveTextContent('Отравлен10 мин');
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Отравлен: @Bo Tambernack на 10 мин');
    expect(reminders()).toBeNull();
    // Темп 10 минут, два шага: срок вышел — система напоминает, не снимает.
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Темп' })).getByRole('radio', { name: '10 мин' }));
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(store.getState().state.actors.bo.conditions.poisoned).toBeDefined();
    expect(rowOf('Bo Tambernack')).toHaveTextContent('Отравленистекло');
    const list = reminders()!;
    expect(list).toHaveTextContent('Bo Tambernack: срок состояния «Отравлен» вышел');
    fireEvent.click(within(list).getByRole('button', { name: 'Снять' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
    expect(reminders()).toBeNull();
  });

  it('в бою карточка следует за ходом: «Ход» → карточка Bo с ресурсами; на столе игроков пипки без кнопок', () => {
    mount();
    startCombat();
    fireEvent.click(screen.getByRole('button', { name: 'Карточка' }));
    expect(cardOf('Korrin Battlehammer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Ход/ }));
    expect(screen.queryByRole('region', { name: 'Korrin Battlehammer' })).toBeNull();
    expect(within(resourcesOf(cardOf('Bo Tambernack'))).getByRole('group', { name: 'Ячейки 1-го круга: 4 из 4' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    const bo = resourcesOf(cardOf('Bo Tambernack'));
    expect(within(bo).getByRole('group', { name: 'Ячейки 1-го круга: 4 из 4' })).toBeInTheDocument();
    expect(within(bo).queryByRole('button')).toBeNull();
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

describe('файл сессии', () => {
  it('«Сохранить» скачивает dm-cockpit-<дата>.json с журналом целиком — тем же конвертом, что localStorage', async () => {
    let blob: Blob | null = null;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((b: Blob) => { blob = b; return 'blob:session'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^dm-cockpit-\d{4}-\d{2}-\d{2}\.json$/);
      expect(this.href).toBe('blob:session');
    });
    const { store } = mount();
    damageViaPopover(cardOf('Bo Tambernack'), 5);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:session');
    expect(parseLog(await readText(blob!))).toEqual(store.getState().events);
  });

  it('«Открыть…» с файлом другой сессии — стол из неё (Bo 33/49) и заметка с числом событий; битый файл сессию не трогает и объясняет', async () => {
    const other = seedEngine({ persist: memoryStore(), ...fixed() });
    other.getState().damage('bo', 8);
    const file = new File([serializeLog(other.getState().events)], 'вчера.json', { type: 'application/json' });
    const persist = memoryStore();
    render(<DeskPage store={seedEngine({ persist, ...fixed() })} persist={persist} />);
    expect(within(rowOf('Bo Tambernack')).getByText('41/49')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Файл сессии'), { target: { files: [file] } });
      await new Promise(r => setTimeout(r, 20));
    });
    expect(within(rowOf('Bo Tambernack')).getByText('33/49')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(`Открыт файл вчера.json: ${other.getState().events.length} событий.`);
    expect(persist.load()).toEqual(other.getState().events);

    const bad = new File(['не журнал'], 'мусор.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Файл сессии'), { target: { files: [bad] } });
      await new Promise(r => setTimeout(r, 20));
    });
    expect(within(rowOf('Bo Tambernack')).getByText('33/49')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Файл мусор.json не открылся: это не JSON. Сессия осталась прежней.');
    expect(persist.load()).toEqual(other.getState().events);
  });
});

describe('F9: планшет — панели в полосы 40px', () => {
  /** jsdom без matchMedia: подставляем узкий экран на время теста. */
  function narrowScreen(initial: boolean) {
    const listeners: (() => void)[] = [];
    const mql = { matches: initial, media: '', addEventListener: (_: string, fn: () => void) => { listeners.push(fn); }, removeEventListener: vi.fn() };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => mql) });
    return { fire: () => listeners.forEach(fn => fn()), setMatches: (m: boolean) => { mql.matches = m; } };
  }
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

  it('на узком экране обе панели — полосы иконок; клик по иконке раскрывает панель оверлеем, Esc и повторный клик закрывают; «Закрепить» ставит панель на стол', () => {
    narrowScreen(true);
    mount();
    expect(screen.queryByLabelText('Партия', { selector: 'aside' })).toBeNull();
    expect(screen.queryByLabelText('Журнал и отмена', { selector: 'aside' })).toBeNull();
    const partyRail = screen.getByRole('navigation', { name: 'Партия' });
    const toolsRail = screen.getByRole('navigation', { name: 'Инструменты' });
    expect(within(toolsRail).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Действия', 'Входящие · 4', 'Журнал']);
    expect(within(toolsRail).getByText('4', { selector: '[data-part="badge"]' })).toBeInTheDocument();

    fireEvent.click(within(partyRail).getByRole('button', { name: 'Партия' }));
    const party = screen.getByLabelText('Партия', { selector: 'aside' });
    expect(party).toHaveAttribute('data-overlay', 'true');
    expect(within(party).getByRole('article', { name: 'Bo Tambernack' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByLabelText('Партия', { selector: 'aside' })).toBeNull();

    fireEvent.click(within(toolsRail).getByRole('button', { name: 'Входящие · 4' }));
    const tools = screen.getByLabelText('Журнал и отмена', { selector: 'aside' });
    expect(tools).toHaveAttribute('data-overlay', 'true');
    expect(within(tools).getByRole('list', { name: 'Входящие' })).toBeInTheDocument();
    expect(within(toolsRail).getByRole('button', { name: 'Входящие · 4' })).toHaveAttribute('aria-pressed', 'true');
    // Оверлей один: раскрыть партию — инструменты закрываются.
    fireEvent.click(within(partyRail).getByRole('button', { name: 'Партия' }));
    expect(screen.queryByLabelText('Журнал и отмена', { selector: 'aside' })).toBeNull();
    fireEvent.click(within(partyRail).getByRole('button', { name: 'Партия' }));
    expect(screen.queryByLabelText('Партия', { selector: 'aside' })).toBeNull();

    fireEvent.click(within(toolsRail).getByRole('button', { name: 'Журнал' }));
    fireEvent.click(within(screen.getByLabelText('Журнал и отмена', { selector: 'aside' })).getByRole('button', { name: 'Закрепить' }));
    expect(screen.queryByRole('navigation', { name: 'Инструменты' })).toBeNull();
    expect(screen.getByLabelText('Журнал и отмена', { selector: 'aside' })).not.toHaveAttribute('data-overlay');
  });

  it('полоса часов на узком экране: дата без года, луна без подписей, виды иконками с теми же именами; у игроков полоса — хроника и журнал без счётчика', () => {
    narrowScreen(true);
    mount();
    expect(screen.getByTitle(/^Дата и время мира/)).toHaveTextContent('15 Mirtul, 08:00');
    expect(screen.getByTitle(/^Дата и время мира/)).toHaveAttribute('title', 'Дата и время мира: 15 Mirtul 1492 DR, 08:00');
    expect(screen.queryByText('Selûne растёт', { selector: 'span' })).toBeNull(); // подпись ушла; title иконки остался
    expect(screen.getByRole('group', { name: 'Небесные тела' })).toHaveTextContent('через 3 дня');
    const viewsGroup = screen.getByRole('group', { name: 'Вид главной зоны' });
    const desk = within(viewsGroup).getByRole('button', { name: 'Стол' });
    expect(desk.querySelector('svg')).not.toBeNull();
    expect(within(viewsGroup).getByRole('button', { name: 'Журнал' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    const rail = screen.getByRole('navigation', { name: 'Хроника' });
    expect(within(rail).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Хроника похода', 'Журнал']);
    expect(rail.querySelector('[data-part="badge"]')).toBeNull();
    fireEvent.click(within(rail).getByRole('button', { name: 'Хроника похода' }));
    expect(screen.getByLabelText('Хроника похода', { selector: 'aside' })).toHaveTextContent('The Missing Caravan');
  });

  it('на широком экране панели на столе; «Свернуть» — в полосу, из полосы — оверлей, «Закрепить» — обратно; смена ширины сворачивает обе', () => {
    const mq = narrowScreen(false);
    mount();
    const rails = () => screen.queryAllByRole('navigation').filter(n => n.hasAttribute('data-side'));
    expect(rails()).toHaveLength(0);
    expect(screen.getByTitle('Дата и время мира')).toHaveTextContent('15 Mirtul 1492 DR, 08:00');
    fireEvent.click(within(screen.getByLabelText('Партия', { selector: 'aside' })).getByRole('button', { name: 'Свернуть' }));
    const rail = screen.getByRole('navigation', { name: 'Партия' });
    expect(screen.queryByLabelText('Партия', { selector: 'aside' })).toBeNull();
    fireEvent.click(within(rail).getByRole('button', { name: 'Партия' }));
    fireEvent.click(within(screen.getByLabelText('Партия', { selector: 'aside' })).getByRole('button', { name: 'Закрепить' }));
    expect(rails()).toHaveLength(0);
    expect(screen.getByLabelText('Партия', { selector: 'aside' })).not.toHaveAttribute('data-overlay');
    // Экран стал узким — обе панели в полосы.
    mq.setMatches(true);
    act(() => mq.fire());
    expect(rails()).toHaveLength(2);
  });
});

describe('оверлей карточки 720px (F3)', () => {
  it('«Развернуть» открывает ту же карточку в две колонки внутри главной зоны: навыки Bo — во второй колонке; вкладка общая; Esc закрывает; партия и часы не накрыты', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));
    const dialog = screen.getByRole('dialog', { name: 'Bo Tambernack: карточка' });
    const overlay = within(dialog).getByRole('region', { name: 'Bo Tambernack' });
    expect(overlay.className).toContain('w-card-overlay');
    expect(overlay.className).toContain('var(--frame)');
    // Оверлей — внутри главной зоны, не поверх партии и часов.
    expect(screen.getByLabelText('Мир', { selector: 'section' })).toContainElement(dialog);
    expect(within(overlay).getByRole('heading', { name: 'Навыки' })).toBeInTheDocument();
    expect(within(overlay).queryByRole('button', { name: 'Хиты' })).toBeNull(); // оверлей — для чтения
    // Вкладка общая: переключение в оверлее меняет и одиночную карточку.
    const gear = within(overlay).getByRole('tab', { name: 'Снаряжение' });
    fireEvent.mouseDown(gear);
    fireEvent.click(gear);
    expect(within(overlay).getByRole('tab', { name: 'Снаряжение' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Bo Tambernack: карточка' })).toBeNull();
    expect(within(cardOf('Bo Tambernack')).getByRole('tab', { name: 'Снаряжение' })).toHaveAttribute('aria-selected', 'true');
  });

  it('монстр в оверлее: действия SRD — второй колонкой; у игроков оверлей есть, вкладки DM нет', () => {
    mount(storeWithSecrets());
    fireEvent.click(within(screen.getByRole('group', { name: 'Противники' })).getAllByRole('button')[0]); // Bandit Captain
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));
    const overlay = within(screen.getByRole('dialog', { name: 'Bandit Captain: карточка' })).getByRole('region', { name: 'Bandit Captain' });
    expect(within(overlay).getByRole('heading', { name: 'Действия' })).toBeInTheDocument();
    expect(within(overlay).getByText('Multiattack')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    fireEvent.click(within(rowOf('Bo Tambernack')).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));
    const players = within(screen.getByRole('dialog', { name: 'Bo Tambernack: карточка' })).getByRole('region', { name: 'Bo Tambernack' });
    expect(within(players).queryAllByRole('tab').map(t => t.textContent)).not.toContain('DM');
    expect(within(players).queryByRole('button', { name: 'Концентрация' })).toBeNull();
  });
});

describe('проекции стола', () => {
  it('splitHarptos и wallTimeOf: дата без года, время; у сида реального времени нет', () => {
    expect(splitHarptos(seedState().time.sec)).toEqual({ date: '15 Mirtul', time: '08:00' });
    expect(wallTimeOf(0)).toBeUndefined();
    expect(wallTimeOf(new Date(2026, 8, 19, 19, 5).getTime())).toBe('19:05');
  });

  it('isDeskHotkey: по коду клавиши, без модификаторов, не из поля, кнопки и диалога', () => {
    const on = (target: Element | null, extra: Partial<KeyboardEvent> = {}) =>
      isDeskHotkey({ key: ' ', code: 'Space', ctrlKey: false, metaKey: false, altKey: false, target, ...extra }, 'Space');
    expect(on(document.body)).toBe(true);
    expect(on(null)).toBe(true);
    expect(on(document.createElement('input'))).toBe(false);
    expect(on(document.createElement('button'))).toBe(false);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inner = document.createElement('span');
    dialog.appendChild(inner);
    expect(on(inner)).toBe(false);
    expect(on(document.body, { ctrlKey: true })).toBe(false);
    expect(on(document.body, { code: 'KeyR' })).toBe(false);
  });

  it('карточка стола — та же проекция, что у компонентов: HP первая у персонажа и у монстра, DM только при секретах', () => {
    const state = seedEngine().getState().state;
    const bo = actorCardProps(state.actors.bo, { onHp: () => {}, dmFacts: dmFactsOf(state.actors.bo, state.facts).length });
    expect(bo.stats?.map(s => s.label)).toEqual(['HP', 'AC', 'PP', 'БМ']);
    expect(bo.stats?.[0]).toMatchObject({ value: '41/49', mark: 'high' });
    expect(bo.stats?.[0].onClick).toBeTypeOf('function');
    expect(bo.stats?.[3].value).toBe('+3');
    expect(bo.badges).toEqual(['5 ур.', 'Следопыт']);
    expect(bo.tabs?.map(t => t.id)).toEqual(['overview', 'conditions', 'gear']);
    const captain = actorCardProps(state.actors.captain, { dmFacts: 0 });
    expect(captain.badges).toEqual(['CR 2', 'Medium']);
    expect(captain.stats?.map(s => s.label)).toEqual(['HP', 'AC', 'SPD']);
    expect(captain.tabs?.map(t => t.id)).toEqual(['overview', 'actions', 'conditions']);
  });

  it('deskDollItems: доспех в слот доспеха, щит — в кисти; без листа и без доспеха — пусто', () => {
    const state = seedEngine().getState().state;
    expect(deskDollItems(state.actors.korrin.sheet)).toEqual({ armor: { name: 'Chain mail' }, hands: { name: 'Shield', note: 'AC +2' } });
    expect(deskDollItems(state.actors.bo.sheet)).toEqual({ armor: { name: 'Scale mail' } });
    expect(deskDollItems(state.actors.lyra.sheet)).toEqual({});
    expect(deskDollItems(undefined)).toEqual({});
  });

  it('d20Formula: знак у модификатора, без модификатора — голый d20', () => {
    expect(d20Formula(3)).toBe('1d20+3');
    expect(d20Formula(-1)).toBe('1d20-1');
    expect(d20Formula(0)).toBe('1d20');
  });
});
