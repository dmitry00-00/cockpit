import { timeAction } from './testkit';
// Лист персонажа, карточка по макетам, оверлей 720px и экран создания персонажа.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, rowOf, cardOf, tab, lastEvent, startCombat, storeWithSecrets, openTimeControls, tempoGroup } from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const pcHeaderOf = (card: HTMLElement): HTMLElement => {
  const header = card.querySelector<HTMLElement>('[data-part="pc-header"]');
  expect(header).not.toBeNull();
  if (!header) throw new Error('Не найдена шапка листа персонажа');
  return header;
};

describe('лист персонажа: ресурсы, сроки состояний, ход (решение владельца 21.09.2026)', () => {
  const resourcesOf = (card: HTMLElement) => within(card).getByRole('region', { name: 'Ресурсы' });
  const reminders = () => screen.queryByRole('list', { name: 'Напоминания' });

  it('шапка листа по карточке владельца: раса, класс, мировоззрение, скорость, тело; спасброски следопыта — STR и DEX с владением', async () => {
    mount();
    const card = cardOf('Bo Tambernack');
    const header = pcHeaderOf(card);
    await waitFor(() => expect(within(header).getByRole('img', { name: 'Портрет: Bo Tambernack' }).tagName).toBe('IMG'));
    const portrait = within(header).getByRole('img', { name: 'Портрет: Bo Tambernack' });
    expect(portrait).toHaveAttribute('loading', 'lazy');
    expect(portrait).toHaveAttribute('width', '64');
    expect(portrait.getAttribute('srcset')).toContain('256w');
    expect(header).toHaveTextContent('5Раса: Полурослик · ЛегконогийКласс: СледопытПолурослик · Легконогий · СледопытМировоззрениеНейтральныйСкорость25 фтРост97 смВес17 кгВозраст26 лет');
    expect([...header.querySelectorAll('[data-part="emblem"] svg title')].map(t => t.textContent)).toEqual(['Раса: Полурослик · Легконогий', 'Класс: Следопыт']);
    expect(within(card).getByTitle(/^Strength: \+1 · спасбросок \+4 \(владение\)\sспасбросок \+4 = 1 \(STR 12\) \+ 3 \(владение спасброском\)$/)).toBeInTheDocument();
    expect(within(card).getByTitle(/^Dexterity: \+3 · спасбросок \+6 \(владение\)\s/)).toBeInTheDocument();
    expect(within(card).getByTitle(/^Wisdom: \+2 · спасбросок \+2\s/)).toBeInTheDocument();
    // У Korrin на листе нет мировоззрения и тела — строк нет, пустых подписей не бывает.
    fireEvent.click(rowOf('Korrin Battlehammer'));
    const k = pcHeaderOf(cardOf('Korrin Battlehammer'));
    expect(k.querySelector('[title="Мировоззрение"]')).toBeNull();
    expect(k.querySelector('[data-part="bio"]')).toBeNull();
    expect(k.querySelector('[data-part="portrait"] img')).toBeNull();
    expect(k.querySelector('[data-part="portrait"] svg')).not.toBeNull();
    expect(k).toHaveTextContent('25 фт');
  });

  it('ресурсы из таблицы класса и умений SRD: у Bo ячейки 4 и 2, у Korrin второе дыхание и всплеск; пипка тратит и возвращает — события с max, журнал «3 из 4», Ctrl+Z', async () => {
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

  it('короткий отдых возвращает потраченное с правилом «короткий» (форма показывает), долгий — всё; у монстра секции «Ресурсы» нет', async () => {
    const { store } = mount();
    fireEvent.click(rowOf('Korrin Battlehammer'));
    fireEvent.click(within(resourcesOf(cardOf('Korrin Battlehammer'))).getByRole('button', { name: 'Потратить: Второе дыхание' }));
    fireEvent.click(rowOf('Bo Tambernack'));
    fireEvent.click(within(resourcesOf(cardOf('Bo Tambernack'))).getAllByRole('button', { name: 'Потратить: Ячейки 2-го круга' })[0]);
    openTimeControls();
    fireEvent.click(screen.getByRole('button', { name: 'Отдых' }));
    const dlg = screen.getByRole('dialog', { name: 'Отдых' });
    expect(dlg.querySelector('[data-actor="korrin"] [data-part="short-note"]')).toHaveTextContent('второе дыхание');
    expect(dlg.querySelector('[data-actor="bo"] [data-part="short-note"]')).toBeNull(); // ячейки — только долгий
    await timeAction(() => { fireEvent.click(within(dlg).getByRole('button', { name: 'Отдохнуть' })); });
    expect(lastEvent(store)).toMatchObject({ type: 'REST_TAKEN', payload: { kind: 'short', resources: [{ actorId: 'korrin', resourceId: 'second-wind' }] } });
    expect(store.getState().state.actors.korrin.resourcesSpent).toBeUndefined();
    expect(store.getState().state.actors.bo.resourcesSpent).toEqual({ 'slot-2': 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Отдых' }));
    const dlg2 = screen.getByRole('dialog', { name: 'Отдых' });
    fireEvent.click(within(dlg2).getByRole('radio', { name: 'Долгий · 8 ч' }));
    expect(dlg2.querySelector('[data-actor="bo"] [data-part="long-note"]')).toHaveTextContent('ячейки 2-го круга');
    await timeAction(() => { fireEvent.click(within(dlg2).getByRole('button', { name: 'Отдохнуть' })); });
    expect(store.getState().state.actors.bo.resourcesSpent).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть управление временем' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Противники' })).getAllByRole('button')[0]);
    expect(within(cardOf('Bandit Captain')).queryByRole('region', { name: 'Ресурсы' })).toBeNull();
  });

  it('срок состояния: «10 мин» перед кликом по сетке → CONDITION_ADDED с untilSec, чип «10 мин»; через два шага — «истекло» и напоминание «Снять / Позже»', async () => {
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
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('radio', { name: '10 мин' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть управление временем' }));
    await timeAction(() => { fireEvent.keyDown(window, { key: 't', code: 'KeyT' }); });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    await timeAction(() => { fireEvent.keyDown(window, { key: 't', code: 'KeyT' }); });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(store.getState().state.actors.bo.conditions.poisoned).toBeDefined();
    expect(rowOf('Bo Tambernack')).toHaveTextContent('Отравленистекло');
    const list = reminders()!;
    expect(list).toHaveTextContent('Bo Tambernack: срок состояния «Отравлен» вышел');
    fireEvent.click(within(list).getByRole('button', { name: 'Снять' }));
    expect(lastEvent(store)).toMatchObject({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
    expect(reminders()).toBeNull();
  });

  it('в бою карточка следует за ходом: «Ход» → карточка Bo с ресурсами; на столе игроков пипки без кнопок', async () => {
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

describe('карточка по бумажному листу и поверхности из макетов 27.10.2026', () => {
  it('навыки списком с «Владение +3», паспорт данных у мастера: сид, раса книга, класс SRD; у игроков паспорта нет', async () => {
    mount();
    const card = cardOf('Bo Tambernack');
    const skills = within(card).getByRole('region', { name: 'Навыки' });
    expect(skills).toHaveTextContent('Владение +3');
    // Алфавит: первая колонка начинается с «Акробатики», последняя строка — «Ловкость рук» во второй колонке не теряется.
    expect(within(skills).getAllByRole('button')[0]).toHaveAccessibleName('Акробатика +3');
    const passport = within(card).getByLabelText('Паспорт данных');
    expect(passport).toHaveTextContent('сид кампании');
    expect(passport).toHaveTextContent('класс SRD');
    cleanup();
    mount(undefined, false);
    expect(screen.queryByLabelText('Паспорт данных')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /^Выбрать:/ })).toBeNull();
    const playerHeader = pcHeaderOf(cardOf('Bo Tambernack'));
    await waitFor(() => expect(within(playerHeader).getByRole('img', { name: 'Портрет: Bo Tambernack' }).tagName).toBe('IMG'));
    expect(within(playerHeader).getByRole('img', { name: 'Портрет: Bo Tambernack' })).toBeInTheDocument();
    expect(within(cardOf('Bo Tambernack')).queryByRole('tab', { name: 'DM' })).toBeNull();
  });

  it('отметки строк партии → подвал «выбрано 2 из 4» → «Сравнить» открывает лист поверх главной зоны; бросок из ячейки; Esc возвращает, выбор цел', async () => {
    const { store } = mount();
    const compare = () => screen.getByRole('button', { name: 'Сравнить' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Выбрать: Bo Tambernack' }));
    expect(screen.getByText('выбрано 1 из 4')).toBeInTheDocument();
    expect(compare()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Выбрать: Korrin Battlehammer' }));
    expect(screen.getByRole('checkbox', { name: 'Выбрать: Korrin Battlehammer' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(compare());
    const dialog = screen.getByRole('dialog', { name: 'Сравнение персонажей' });
    expect(screen.getByLabelText('Мир', { selector: 'section' })).toContainElement(dialog);
    expect(within(dialog).getAllByRole('columnheader').filter(h => h.getAttribute('scope') !== 'colgroup').map(h => h.textContent)).toEqual(['', 'Bo TambernackСледопыт · 5 ур.', 'Korrin BattlehammerВоин · 5 ур.']);
    // Скрытность: у Bo владение — он лучший в строке.
    const stealth = within(dialog).getByRole('row', { name: /^Скрытность/ });
    expect(within(stealth).getAllByRole('img', { name: 'лучший' })).toHaveLength(1);
    fireEvent.click(within(stealth).getAllByRole('button')[0]);
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { label: 'Скрытность · Bo Tambernack' } });
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Сравнение персонажей' })).toBeNull();
    expect(screen.getByText('выбрано 2 из 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Снять' }));
    expect(screen.queryByText('выбрано 2 из 4')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Выбрать: Bo Tambernack' })).toHaveAttribute('aria-checked', 'false');
  });

  it('сводка партии: лучший во внимательности, запас костей хитов и ячеек; по выбору — только выбранные', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Сводка партии 4' }));
    const dock = screen.getByRole('region', { name: 'Сводка партии 4' });
    expect(within(dock).getByRole('list', { name: 'Лучший в проверке' }).children.length).toBeGreaterThan(4);
    expect(within(dock).getByRole('region', { name: 'Запас' })).toHaveTextContent('Кости хитов20/20');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Выбрать: Korrin Battlehammer' }));
    const one = screen.getByRole('region', { name: 'Сводка выбранных 1' });
    expect(within(one).getByRole('region', { name: 'Запас' })).toHaveTextContent('Кости хитов5/5');
    expect(within(one).getByRole('region', { name: 'Запас' })).not.toHaveTextContent('Ячейки');
  });
});

describe('оверлей карточки 720px (F3)', () => {
  it('«Развернуть» открывает ту же карточку в две колонки внутри главной зоны: навыки Bo — во второй колонке; вкладка общая; Esc закрывает; партия и часы не накрыты', async () => {
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

  it('монстр в оверлее: действия SRD — второй колонкой; у игроков оверлей есть, вкладки DM нет', async () => {
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

describe('экран создания персонажа: «Новый» и «Создать персонажа» в партии', () => {
  it('«Создать персонажа» открывает редактор в главной зоне; воин-солдат 5-го уровня уходит в партию одним ACTOR_SPAWNED, карточка — на него с выборами и снаряжением, журнал «Появился … (в партии)», Ctrl+Z убирает; Esc закрывает без следа', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    fireEvent.click(screen.getByRole('button', { name: /^Создать персонажа/ }));
    const dialog = screen.getByRole('dialog', { name: 'Новый персонаж' });
    expect(screen.getByLabelText('Мир', { selector: 'section' })).toContainElement(dialog);
    const editor = within(dialog);
    const group = (name: string) => editor.getByRole('group', { name });
    const goto = (label: string) => fireEvent.click(within(editor.getByRole('navigation', { name: 'Шаги' })).getByRole('button', { name: label }));
    fireEvent.change(editor.getByRole('textbox', { name: 'Имя' }), { target: { value: 'Sildar Hallwinter' } });
    goto('Раса');
    fireEvent.click(within(group('Навыки расы')).getByRole('button', { name: 'Скрытность' }));
    fireEvent.change(editor.getByRole('combobox', { name: 'Черта расы' }), { target: { value: 'bditel-nyy' } });
    goto('Класс');
    for (let i = 0; i < 4; i++) fireEvent.click(editor.getByRole('button', { name: 'Уровень выше' }));
    fireEvent.click(within(group('Подкласс')).getByRole('button', { name: /^Чемпион/ }));
    goto('Характеристики');
    fireEvent.click(editor.getByTitle('+1 Сила на 4-м уровне'));
    fireEvent.click(editor.getByTitle('+1 Сила на 4-м уровне'));
    goto('Навыки');
    fireEvent.click(within(group('Предыстории')).getByRole('button', { name: /^Солдат/ }));
    fireEvent.click(within(group('Навыки')).getByTitle(/^Внимательность/));
    fireEvent.click(within(group('Навыки')).getByTitle(/^История/));
    goto('Умения класса');
    fireEvent.click(within(group('Боевой стиль')).getByRole('button', { name: /^Оборона/ }));
    goto('Снаряжение');
    fireEvent.click(within(group('Снаряжение: выбор 1')).getByRole('button', { name: /Chain Mail/ }));
    fireEvent.click(within(group('Снаряжение: выбор 2')).getByRole('button', { name: /Shield/ }));
    fireEvent.change(editor.getByRole('combobox', { name: 'любое воинское оружие, 1' }), { target: { value: 'longsword' } });
    fireEvent.click(within(group('Снаряжение: выбор 3')).getByRole('button', { name: /Handaxe/ }));
    fireEvent.click(within(group('Снаряжение: выбор 4')).getByRole('button', { name: /Explorer/ }));
    fireEvent.click(editor.getByRole('button', { name: 'В партию' }));
    expect(screen.queryByRole('dialog', { name: 'Новый персонаж' })).toBeNull();
    expect(store.getState().events.length).toBe(before + 1);
    expect(lastEvent(store)).toMatchObject({ type: 'ACTOR_SPAWNED', payload: { party: true, actor: { id: 'sildar-hallwinter', kind: 'pc', hp: { current: 44, max: 44 }, ac: 19 } } });
    expect(store.getState().state.party).toContain('sildar-hallwinter');
    // Корешок в партии, карточка открылась на новичка: ресурсы воина, выбор стиля, черта, атаки.
    expect(within(rowOf('Sildar Hallwinter')).getByText('44/44')).toBeInTheDocument();
    const card = cardOf('Sildar Hallwinter');
    expect(within(card).getByRole('group', { name: 'Второе дыхание: 1 из 1' })).toBeInTheDocument();
    expect(within(card).getByRole('region', { name: 'Умения класса · Воин' })).toHaveTextContent('Боевой стиль');
    expect(within(card).getByRole('region', { name: 'Выборы умений' })).toHaveTextContent('Оборона');
    expect(within(card).getByRole('region', { name: 'Черты' })).toHaveTextContent('Бдительный');
    expect(within(card).getByRole('list', { name: 'Атаки листа' })).toHaveTextContent('Longsword');
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Появился: @Sildar Hallwinter (в партии)');
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(store.getState().state.party).not.toContain('sildar-hallwinter');
    expect(screen.queryByRole('article', { name: 'Sildar Hallwinter' })).toBeNull();
    // «Новый» в шапке открывает тот же редактор; Esc закрывает пустой — событий не прибавилось.
    fireEvent.click(screen.getByRole('button', { name: 'Новый' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Новый персонаж' }), { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Новый персонаж' })).toBeNull();
    expect(store.getState().events.length).toBe(before + 2); // spawn + компенсирующее удаление
  });

  it('#/desk/new (кнопка «Создать персонажа» на экране компендиума) открывает редактор сразу; закрытие возвращает хэш стола', async () => {
    history.replaceState(null, '', '#/desk/new');
    mount();
    expect(screen.getByRole('dialog', { name: 'Новый персонаж' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Новый персонаж' })).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Новый персонаж' })).toBeNull();
    expect(location.hash).toBe('#/desk');
  });

  it('у игроков ни «Новый», ни «Создать персонажа» нет', async () => {
    mount(undefined, false);
    expect(screen.queryByRole('button', { name: 'Новый' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Создать персонажа/ })).toBeNull();
  });
});
