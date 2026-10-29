// Стол (шаг 5): один стор, и корешок с карточкой читают из него одни хиты. Урон через попап виден в обоих
// местах и в State; Ctrl+Z возвращает и даёт тост; состояние из сетки становится чипом на корешке;
// плитки берут числа из листа; вкладка DM есть только на столе мастера; ни одной пиктограммы.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pcActor, seedEngine, seedLog, seedState, sheetViewOf } from '../campaign';
import { KORRIN } from '../campaign/party';
import { createEngineStore, memoryStore, parseLog, serializeLog } from '../engine';
import { actorCardProps } from '../components';
import { DeskPage } from './DeskPage';
import { SKILL_LABEL, d20Formula, deskDollItems, dmFactsOf, isDeskHotkey, splitHarptos, wallTimeOf } from './desk/helpers';
import { readText } from './desk/session';
import { EMOJI, fixed, mount, rowOf, cardOf, hpCellOf, tab, hpOf, lastEvent, damageViaPopover } from './desk/testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
    expect(within(card).getByText('Полурослик · Легконогий · Следопыт')).toBeInTheDocument();
    expect(within(card).getByTitle('Класс доспеха · щелчок — из чего')).toHaveTextContent('16');
    expect(within(card).getByTitle('Пассивная внимательность · щелчок — из чего')).toHaveTextContent('12');
    expect(within(card).getByRole('region', { name: 'Навыки' })).toHaveTextContent('Владение +3');
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

  it('умения класса и черты расы — иконками вида: имя в тултипе, щелчок — текст из компендиума, пустой текст — только имя; Esc закрывает', () => {
    mount();
    const features = screen.getByRole('region', { name: /^Умения класса/ });
    expect(features.querySelectorAll('p')).toHaveLength(0);
    // «Избранный враг» в таблице без текста — по щелчку имя есть, абзаца нет.
    const foe = within(features).getByRole('button', { name: /Избранный враг/ });
    fireEvent.click(foe);
    expect(foe).toHaveAttribute('aria-expanded', 'true');
    expect(within(features).getByRole('region', { name: /Избранный враг/ }).querySelector('p')).toBeNull();
    fireEvent.click(within(features).getByRole('button', { name: /Первозданная осведомленность/ }));
    expect(features.querySelectorAll('p')).toHaveLength(1);
    fireEvent.keyDown(features.querySelector('[data-part="icon-detail"]')!, { key: 'Escape' });
    expect(features.querySelector('[data-part="icon-detail"]')).toBeNull();
    const traits = screen.getByRole('region', { name: 'Черты расы' });
    expect(within(traits).getByRole('button', { name: 'Везучий' })).toBeInTheDocument();
    expect(within(traits).getByRole('button', { name: 'Проворство Полуросликов' })).toBeInTheDocument();
    const brave = within(traits).getByRole('button', { name: 'Храбрый' });
    // Вид особенности «спасбросок» — иконка «спасбросок»: имя иконки в её title.
    expect(brave.querySelector('svg title')?.textContent).toBe('Храбрый');
    fireEvent.click(brave);
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
    expect(within(card).getByTitle('Класс доспеха · щелчок — из чего')).toHaveTextContent('18');
    expect(within(card).getByTitle('Пассивная внимательность · щелчок — из чего')).toHaveTextContent('14');

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

  it('шансы блока (ROADMAP 5.2): под Scimitar — каждый из партии с AC, попаданием и средним уроном; линза «преимущество» поднимает шанс; у Multiattack шансов нет', () => {
    mount();
    fireEvent.click(screen.getByTitle('Bandit Captain · CR 2'));
    tab('Действия');
    const panel = screen.getByRole('tabpanel');
    const table = within(panel).getByRole('table', { name: 'Шансы: Scimitar' });
    const party = within(screen.getByRole('list', { name: 'Партия' })).getAllByRole('button', { name: /^Открыть карточку: / }).map(b => b.getAttribute('aria-label')!.replace('Открыть карточку: ', ''));
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(r => within(r).getByRole('rowheader').textContent)).toEqual(party);
    const hitOf = (r: HTMLElement) => Number(within(r).getAllByRole('cell')[1].textContent!.replace('%', ''));
    const normal = rows.map(hitOf);
    expect(normal.every(n => n > 0 && n < 100)).toBe(true);
    expect(within(rows[0]).getAllByRole('cell')[2].textContent).toMatch(/^\d+(,\d)?$/);
    expect(within(panel).queryByRole('table', { name: 'Шансы: Multiattack' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'преимущество' }));
    const adv = within(within(panel).getByRole('table', { name: 'Шансы: Scimitar' })).getAllByRole('row').slice(1).map(hitOf);
    adv.forEach((n, i) => expect(n).toBeGreaterThan(normal[i]));
  });

  it('шансы листа (ROADMAP 5.3): меч Korrin против блоков на столе — Bandit ×3 одной строкой; у игроков секции нет', () => {
    const state = seedState();
    const korrin = pcActor({ ...KORRIN, equipment: [{ id: 'chain-mail', qty: 1 }, { id: 'longsword', qty: 1 }, { id: 'shield', qty: 1 }] });
    state.actors.korrin = { ...state.actors.korrin, sheet: korrin.sheet };
    const store = createEngineStore(state, { persist: { load: () => seedLog(), save: () => {}, clear: () => {} }, ...fixed() });
    mount(store);
    fireEvent.click(within(screen.getByRole('list', { name: 'Партия' })).getByRole('button', { name: 'Открыть карточку: Korrin Battlehammer' }));
    const section = within(cardOf('Korrin Battlehammer')).getByRole('region', { name: 'Шансы по противникам' });
    const table = within(section).getByRole('table', { name: 'Шансы: Longsword' });
    expect(within(table).getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Bandit Captain', 'Bandit ×3']);
    expect(within(section).getByRole('table', { name: 'Шансы: Longsword · двумя руками' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.queryByRole('region', { name: 'Шансы по противникам' })).toBeNull();
    expect(document.querySelector('[data-part="odds"]')).toBeNull();
  });

  it('дерево вывода (ROADMAP 5.4): AC 18 у Aldric — доспех 14 + DEX 2 + щит 2, строка SRD щелчком; КХ — максимум хитов; Esc закрывает', () => {
    mount();
    fireEvent.click(rowOf('Brother Aldric'));
    const card = cardOf('Brother Aldric');
    const ac = within(card).getByTitle('Класс доспеха · щелчок — из чего');
    expect(ac).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(ac);
    expect(ac).toHaveAttribute('aria-pressed', 'true');
    const panel = within(card).getByRole('region', { name: 'Из чего: AC' });
    expect(panel).toHaveTextContent('AC 18 — из чего');
    expect([...panel.querySelectorAll('li')].map(li => li.querySelector('summary, div')!.textContent)).toEqual([
      '14Scale mail, среднийSRD', '+ 2DEX 15SRD', '+ 2щитSRD',
    ]);
    expect(panel.querySelector('li:last-child p')).toHaveTextContent('Wielding a shield increases your Armor Class by 2.');
    // Другое число — та же панель с другим выводом; повторный щелчок — закрывает.
    fireEvent.click(within(card).getByTitle('Кости хитов d8: осталось 5 из 5 · щелчок — из чего максимум хитов 38'));
    expect(within(card).getByRole('region', { name: 'Из чего: Максимум хитов' })).toHaveTextContent('Максимум хитов 38 — из чего');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(within(card).queryByRole('region', { name: /^Из чего/ })).toBeNull();
    // Навык и атака — выводом в подсказке.
    expect(within(card).getByTitle(/^Медицина \(WIS\) \+6.*\s\+6 = 3 \(WIS 17\) \+ 3 \(владение навыком\)$/)).toBeInTheDocument();
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
    const view = sheetViewOf(state.actors.bo)!;
    const bo = actorCardProps(state.actors.bo, { onHp: () => {}, dmFacts: dmFactsOf(state.actors.bo, state.facts).length, initiative: view.initiative, hitDice: view.hitDice });
    expect(bo.stats?.map(s => s.label)).toEqual(['HP', 'AC', 'ИНИЦ', 'PP', 'КХ']);
    expect(bo.stats?.[0]).toMatchObject({ value: '41/49', mark: 'high' });
    expect(bo.stats?.[0].onClick).toBeTypeOf('function');
    expect(bo.stats?.[2].value).toBe('+3');
    expect(bo.stats?.[4].value).toBe('5/5');
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

    // Портреты: переключение персонажа без раскрытия панели (просьба владельца 28.10).
    fireEvent.click(within(partyRail).getByRole('button', { name: 'Открыть карточку: Lyra Moonwhisper' }));
    expect(within(partyRail).getByRole('button', { name: 'Открыть карточку: Lyra Moonwhisper' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('region', { name: 'Lyra Moonwhisper' })).toBeInTheDocument();
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
