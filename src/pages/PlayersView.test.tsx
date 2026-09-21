// Адверсарный набор для режима «глазами игроков» (шаг 9, HANDOFF §14; CLAUDE.md «Правила экрана»: секреты не
// приглушаются, а отсутствуют в DOM). Стол заводится со ВСЕМИ видами секретов — скрытый бросок, отклонённое,
// принятое, переброшенное и нетронутое предложения, три факта мастера (один — про актёра, чтобы была вкладка DM),
// заметка с нитью, бой с уроном и «Убрать из боя» — и в каждом состоянии экрана проверяется document.body
// целиком: textContent и innerHTML (title, aria-label, data-*, placeholder, sr-only), включая порталы Radix
// (попап хитов, тултипы), которые рендерятся вне контейнера страницы.
//
// Набор независим от expectNoSecrets() в DeskPage.test.tsx и намеренно шире. Красный ассерт здесь — находка,
// а не повод править тест. Три группы:
//   1. секреты — не должны существовать в DOM (скрытые броски, дельты, факты мастера, «секрет»/«каскад»);
//   2. инструменты мастера — по референсу F8 убраны панель темпа и подсказки клавиш; «Убрать из боя», «Ход»,
//      урон в попапе — не секрет, но инструмент, и отмечены отдельно;
//   3. обратная проверка — те же строки ЕСТЬ на столе мастера (иначе проба пустая) и возвращаются после P.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DELTA, FACT, THREAD, seedLog, seedState } from '../campaign';
import { createEngineStore, memoryStore, type EngineStoreApi, type Fact } from '../engine';
import { DeskPage } from './DeskPage';

/* ---------- Стол со всеми видами секретов ---------- */

/** Детерминированные часы и id: журнал и лог читаются глазами. */
function fixed() {
  let t = 1_000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
}

/** Факт мастера про актёра: в сиде факты привязаны к местам, и вкладка DM без него не появляется вовсе. */
const BO_SECRET: Fact = {
  id: 'f-bo-double', text: 'Bo Tambernack тайно докладывает Zhentarim', visibility: 'dm',
  scale: 'settlement', subjectId: 'bo', threadIds: [THREAD.missingCaravan],
};

/**
 * Сид плюс: факт про Bo, скрытый бросок, отклонённое (с причиной), принятое (причина — факт мастера → каскад),
 * переброшенное (ждёт, вариант «Harpers перехватили курьера»), нетронутое (цены), заметка с нитью.
 */
function storeWithSecrets(): EngineStoreApi {
  const initial = seedState();
  initial.facts[BO_SECRET.id] = { ...BO_SECRET };
  const mem = memoryStore();
  const store = createEngineStore(initial, {
    persist: { load: () => mem.load() ?? seedLog(), save: e => mem.save(e), clear: () => mem.clear() },
    ...fixed(),
  });
  const api = store.getState();
  api.rollDice('1d20+9', { label: 'Скрытность · Bo Tambernack', hidden: true, rng: () => 0.5 });
  api.reject(DELTA.lycanthropes, 'не верю');
  api.accept(DELTA.owlWellRumor);
  api.reroll(DELTA.zhentarimTrail);
  api.note('Korrin Battlehammer расспрашивает о Zhentarim', [THREAD.missingCaravan], 'settlement');
  return store;
}

/* ---------- Строки-секреты из сида и откуда они в коде ---------- */

const HIDDEN_ROLL = [
  'Скрытность · Bo Tambernack', // подпись скрытого броска: RollModal (шапка, история), describe() DICE_ROLLED
  '1d20+9',                     // формула скрытого броска: RollModal formula, журнал
  'скрытый',                    // describe(): « · скрытый»; RollModal: «скрытый бросок»
  'Скрытый бросок',             // RollModal: title иконки у итога и в истории
];
const DELTAS = [
  'Zhentarim · Triboar Trail',                       // subject (переброшено, ждёт)
  'Цены на железо и оружие',                          // subject (ждёт)
  'Встречи с ликантропами',                           // subject (отклонено)
  'Слух в таверне',                                   // subject (принято)
  'Harpers перехватили курьера',                      // cause варианта после переброса
  'караван всё ещё не найден',                        // cause
  'не верю',                                          // причина отклонения: describe() WORLD_DELTA_REJECTED
  'у Old Owl Well видели восставших мертвецов',       // delta.now принятого (строчная «у»)
  'Принято',                                          // describe() ACCEPTED; ENTRY_ICON «Принятое предложение»
  'Отклонено',                                        // describe() REJECTED
  'Симуляция',                                        // ENTRY_ORIGIN.sim.label; WorldDelta «Симуляция · ждёт решения»
  'Входящие',                                         // шапка и aria-label входящих
  'Предложения мира',                                 // title иконки входящих
  'Ждут решения',                                     // title счётчика входящих
  'Что изменилось',                                   // сводка шага времени
  'Предложение',                                      // WorldDelta aria-label «Предложение: …», CASCADE_TITLE.delta
  'цепочку причин',                                   // WorldDelta title «Показать/Скрыть цепочку причин»
];
const FACTS = [
  'У Old Owl Well видели восставших мертвецов',       // seedFacts (прописная «У»)
  'Агент Zhentarim замечен у ворот Neverwinter',      // seedFacts
  'Bo Tambernack тайно докладывает Zhentarim',        // BO_SECRET → вкладка DM
  'открыть игрокам?',                                 // JournalReminder text
  'Раскрыть',                                         // JournalReminder
  'Позже',                                            // JournalReminder
  'Напоминание',                                      // JournalReminder aria-label
  'Скрыто от игроков',                                // title перечёркнутого глаза (DmTab, ThreadCard, JournalEntry, Reminder)
  'Только мастеру',                                   // TAB_DM.title
];
const THREAD_ROWS = [
  'секрет',                                           // threadCardRows: label секретной строки
  'каскад',                                           // threadCardRows: label строки каскада
  'Каскад',                                           // JournalCascade aria-label
];
const SECRETS = [...HIDDEN_ROLL, ...DELTAS, ...FACTS, ...THREAD_ROWS];

/** Селекторы секретов — по атрибутам, а не по тексту. */
const SECRET_SELECTORS = [
  '[data-secret]',
  '[data-delta]',
  '[aria-label="Входящие"]',
  '[aria-label="Что изменилось"]',
  '[aria-label="Напоминание"]',
  '[aria-label="Каскад"]',
  '[aria-label^="Предложение: "]',
  '[aria-label="Цепочка причин"]',
  '[role="tab"][title="Только мастеру"]',
  '[aria-label^="Бросок"] input[type="checkbox"]',
  '[data-row^="secret-"]',
  '[data-row="cascade"]',
];

/** Инструменты мастера: HANDOFF §14 шаг 9 и референс F8 («панель темпа времени и подсказки клавиш» убраны). */
const DM_TOOLS = [
  'Темп времени', 'Продвинуть время', 'темп часов',         // TimeTempo и вид «Время»
  'Начать бой',                                              // полоса часов
  'Отмена и повтор', 'Отменить', 'Повторить',               // панель «Действия»
  'скрытый бросок', 'Перебросить',                           // RollModal
  'Игроки', 'Глазами игроков: секреты',                      // кнопка режима
  'Заметка мастера', 'Записать в журнал', 'Enter записывает', // форма заметки в журнале сессии
  'Убрать из боя', 'Выбыл из боя',                           // подвал попапа хитов в бою (не секрет — инструмент)
  'Закончить бой', 'Следующий ход',                          // InitiativeBar
  'Урон на введённое число', 'Лечение на введённое число',   // HpControl
  'Снять: ',                                                 // ConditionChip onRemove
  'Добавить противника', 'Начать концентрацию',              // живой стол: появление противника и концентрация в карточке
  'вписать новичка',                                         // «Порядок» в бою (INITIATIVE_SET)
  'Отдых: короткий', 'Новая сессия',                         // отдых вне боя; сброс сессии в панели «Действия»
  'Потратить: ', 'Вернуть: ', 'Срок состояния',              // ресурсы листа (пипки) и срок состояния из сетки — инструменты мастера
];

/** Подсказки клавиш в title: «· Esc», «· J», «· Enter», «· Space», «· T», «· R», Ctrl+Z. «· P» — по референсу остаётся (P возвращает мастера). */
const KEY_HINT = /[^"<>]{0,48}(?:· (?:Esc|J|Enter|Space|T|R)(?![\p{L}\p{N}])|Ctrl\+(?:Shift\+)?Z)[^"<>]{0,16}/gu;

/* ---------- Помощники ---------- */

const bodyText = () => document.body.textContent ?? '';
const bodyHtml = () => document.body.innerHTML;

/** Какие строки из списка есть в document.body — по тексту или разметке. */
function found(strings: readonly string[]): string[] {
  const text = bodyText();
  const html = bodyHtml();
  return strings.filter(s => text.includes(s) || html.includes(s));
}

/** Мягкие ассерты: один тест сообщает все находки состояния, а не первую. */
function expectNone(strings: readonly string[], where: string) {
  expect.soft(found(strings), `${where}: строки в document.body`).toEqual([]);
}

function expectNoSelectors(where: string) {
  const hit = SECRET_SELECTORS.filter(sel => document.body.querySelector(sel) !== null);
  expect.soft(hit, `${where}: селекторы в document.body`).toEqual([]);
  expect.soft(screen.queryByRole('tab', { name: 'DM' }), `${where}: вкладка DM`).toBeNull();
  expect.soft(bodyText(), `${where}: слово DM в тексте`).not.toMatch(/\bDM\b/);
}

/** Полная проверка секретов одного состояния экрана. */
function expectClean(where: string) {
  expectNone(SECRETS, where);
  expectNoSelectors(where);
}

function keyHints(): string[] {
  return [...bodyHtml().matchAll(KEY_HINT)].map(m => m[0].trim());
}

const P = () => fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
const J = () => fireEvent.keyDown(window, { key: 'j', code: 'KeyJ' });
const T = () => fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
const ESC = () => fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
const SPACE = () => fireEvent.keyDown(window, { key: ' ', code: 'Space' });
const R = () => fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
const UNDO = () => fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
/** Radix (Popover, Tooltip) дорисовывает портал в микротасках и таймерах. */
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

const mount = (store: EngineStoreApi, dmView?: boolean) => render(<DeskPage store={store} dmView={dmView} />);
const clickTab = (name: string) => {
  const t = screen.getByRole('tab', { name });
  fireEvent.mouseDown(t);
  fireEvent.click(t);
};
/** «Начать бой» открывает редактор инициативы (броски сида предзаполнены); «Начать бой» в нём пишет ENCOUNTER_STARTED. */
const startCombat = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Начать бой' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Инициатива' })).getByRole('button', { name: 'Начать бой' }));
};
const grid = () => screen.getByRole('group', { name: 'Боевая сетка' });
const bar = () => screen.getByLabelText('Бой', { selector: 'footer' });
const tokenIn = (zone: HTMLElement, id: string) => zone.querySelector<HTMLElement>(`[data-actor="${id}"]`);
const journalView = () => screen.getByRole('region', { name: 'Журнал сессии' });
const playersMain = () => screen.getByRole('main', { name: 'Стол игроков' });
const lastEvent = (store: EngineStoreApi) => store.getState().events.at(-1)!;

/* ---------- 1. Секреты ---------- */

describe('глазами игроков: секретов нет в document.body', () => {
  it('стол: входящие, карточка скрытого броска, журнал стола — после P ничего из этого нет; хроника и партия есть', () => {
    const store = storeWithSecrets();
    mount(store);
    // Сначала стол мастера полон секретов — иначе проверка ниже ничего не доказывает.
    expect(found(['Входящие', 'Скрытность · Bo Tambernack', 'Принято', 'Отклонено', 'Harpers перехватили курьера'])).toHaveLength(5);
    P();
    expect(playersMain()).toBeInTheDocument();
    expectClean('стол игроков');
    expect(screen.queryByRole('status')).toBeNull(); // тоста и живого региона отмены нет
    expect(screen.getByLabelText('Хроника похода', { selector: 'aside' })).toHaveTextContent('The Missing Caravan');
    expect(screen.getByRole('region', { name: 'Bo Tambernack' })).toBeInTheDocument();
    // Скрытый бросок — последний в логе: карточки броска нет вовсе, а не карточка без подписи.
    expect(screen.queryByRole('region', { name: /^Бросок/ })).toBeNull();
    // Журнал стола — только несекретные записи: заметки, концентрация, удары.
    const journal = screen.getByRole('list', { name: 'Записи журнала' });
    expect(within(journal).getAllByRole('listitem')).toHaveLength(5);
    expect(journal).toHaveTextContent('@Korrin Battlehammer расспрашивает о @Zhentarim');
  });

  it('карточка: вкладка DM открыта у мастера → после P ни вкладки, ни текста факта; карточка на «Обзор»', () => {
    const store = storeWithSecrets();
    mount(store);
    clickTab('DM');
    expect(screen.getByRole('tab', { name: 'DM' })).toHaveAttribute('aria-selected', 'true');
    expect(bodyText()).toContain('Bo Tambernack тайно докладывает Zhentarim');
    P();
    expectClean('карточка после P с открытой вкладкой DM');
    expect(screen.getByRole('tab', { name: 'Обзор' })).toHaveAttribute('aria-selected', 'true');
    // Переключение на другого актёра и обратно — вкладка не возвращается.
    const party = screen.getByRole('list', { name: 'Партия' });
    fireEvent.click(within(party).getByRole('button', { name: 'Открыть карточку: Lyra Moonwhisper' }));
    fireEvent.click(within(party).getByRole('button', { name: 'Открыть карточку: Bo Tambernack' }));
    expectClean('карточка Bo повторно');
  });

  it('журнал сессии: записи, счётчик, фильтр, карточки нитей, клик по #нити и @упоминанию — чисто в каждом шаге', () => {
    const store = storeWithSecrets();
    mount(store);
    P();
    J();
    const view = journalView();
    expectClean('журнал сессии');
    // Счётчик считается по тому же множеству: 4 записи сида + заметка; скрытый бросок и обе дельты — нет.
    expect(within(view).getByText('Записей: 5 из 5')).toBeInTheDocument();
    expect(within(view).getAllByRole('article')).toHaveLength(5);
    // Карточки нитей: три открытые, без строк «секрет» и «каскад».
    for (const name of ['The Missing Caravan', 'Old Owl Well', 'Луна и стая']) {
      expect(screen.getByRole('region', { name: `Нить: ${name}` })).toBeInTheDocument();
    }
    // #нить в записи → фильтр по нити.
    fireEvent.click(within(view).getAllByRole('button', { name: 'Нить: The Missing Caravan' })[0]);
    expectClean('журнал сессии с фильтром по нити');
    expect(within(view).getByText('Записей: 2 из 5')).toBeInTheDocument();
    // Фильтр по масштабу.
    fireEvent.click(within(view).getByRole('button', { name: /^Поселение/ }));
    expectClean('журнал сессии с фильтром по масштабу');
    // @упоминание → карточка Korrin на столе (шаг 10: упоминание открывает карточку, главная зона — стол); J возвращает журнал.
    fireEvent.click(within(view).getByRole('button', { name: 'Открыть карточку: Korrin Battlehammer' }));
    expectClean('стол после клика по упоминанию');
    expect(screen.getByRole('region', { name: 'Korrin Battlehammer' })).toBeInTheDocument();
    J();
    expectClean('журнал после возврата');
    // Клик по карточке нити в правой колонке.
    fireEvent.click(screen.getByRole('button', { name: 'Фильтр по нити: Old Owl Well' }));
    expectClean('журнал после клика по карточке нити');
    ESC();
    expectClean('стол после Esc из журнала');
    expect(screen.getByRole('region', { name: 'Korrin Battlehammer' })).toBeInTheDocument();
  });

  it('бой: сетка, полоса инициативы, попап хитов с токена (портал в document.body), урон и «Убрать из боя» уже в логе', async () => {
    const store = storeWithSecrets();
    mount(store);
    startCombat();
    act(() => { store.getState().damage('bo', 6, 'slashing', 'captain'); });
    act(() => { store.getState().remove('bandit-3', 'dm'); });
    P();
    expectClean('бой на столе игроков');
    expect(bar()).toBeInTheDocument();
    expect(grid()).toBeInTheDocument();
    expect(tokenIn(bar(), 'bandit-3')).toBeNull();
    // Попап хитов — инструмент мастера: на столе игроков токен выбирает актёра, а попап (Radix Portal) не открывается.
    fireEvent.click(tokenIn(grid(), 'captain')!);
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tokenIn(grid(), 'captain')).toHaveAttribute('aria-pressed', 'true');
    expectClean('бой после клика по токену сетки');
    fireEvent.click(tokenIn(bar(), 'bo')!);
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expectClean('бой после клика по токену полосы');
    // Карточка рядом с сеткой.
    fireEvent.click(screen.getByRole('button', { name: 'Карточка' }));
    expectClean('бой с карточкой рядом с сеткой');
    // Журнал боя.
    J();
    expectClean('журнал сессии в бою');
  });

  it('вид «Время»: мастер сделал шаг (T) и нажал P — сводки «что изменилось» и предложений нет', () => {
    const store = storeWithSecrets();
    mount(store);
    T();
    expect(lastEvent(store).type).toMatch(/TIME_ADVANCED|WORLD_DELTA_PROPOSED/);
    expect(screen.getByRole('region', { name: 'Что изменилось' })).toBeInTheDocument();
    P();
    expectClean('вид «Время» после P');
  });

  it('бросок с плитки на столе игроков: карточка без переключателя, история без скрытых, тултип чипа (портал) чист', async () => {
    const store = storeWithSecrets();
    mount(store);
    P();
    fireEvent.click(screen.getByRole('button', { name: /^DEX/ }));
    const modal = screen.getByRole('region', { name: /^Бросок/ });
    expect(modal).toHaveTextContent('DEX · Bo Tambernack');
    expect(within(modal).queryByRole('checkbox')).toBeNull();
    expect(within(modal).queryByRole('list', { name: 'Последние броски' })).toBeNull(); // единственный прошлый бросок — скрытый
    expectClean('карточка обычного броска');
    // Второй обычный бросок — история из одного видимого, без скрытого.
    fireEvent.click(screen.getByRole('button', { name: /^STR/ }));
    const history = within(screen.getByRole('region', { name: /^Бросок/ })).getByRole('list', { name: 'Последние броски' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expectClean('карточка броска с историей');
    // Тултип чипа концентрации (Radix Tooltip, портал в body).
    const chips = screen.getByRole('region', { name: 'Bo Tambernack' }).querySelector('[data-part="chips"]')!;
    const chip = chips.querySelector<HTMLElement>('[data-kind="conc"]')!;
    fireEvent.focus(chip);
    await screen.findByRole('tooltip');
    await settle();
    expectClean('тултип чипа (портал)');
    fireEvent.blur(chip);
  });

  it('раскрытый и тут же отменённый факт: в состоянии он снова секрет — и в DOM игроков его текста быть не должно', () => {
    const store = storeWithSecrets();
    mount(store);
    act(() => { store.getState().reveal(FACT.zhentarimAgent); });
    act(() => { store.getState().undo(); });
    expect(store.getState().state.facts[FACT.zhentarimAgent].visibility).toBe('dm');
    P();
    expectNone(['Агент Zhentarim замечен у ворот Neverwinter'], 'стол игроков после Ctrl+Z раскрытия');
    J();
    expectNone(['Агент Zhentarim замечен у ворот Neverwinter'], 'журнал сессии после Ctrl+Z раскрытия');
  });

  it('стол, поднятый с dmView={false}: чисто сразу и после боя', () => {
    const store = storeWithSecrets();
    mount(store, false);
    expectClean('dmView=false, стол');
    act(() => { store.getState().startEncounter(); });
    expectClean('dmView=false, бой');
    J();
    expectClean('dmView=false, журнал');
  });
});

/* ---------- 2. Инструменты мастера ---------- */

describe('глазами игроков: инструменты мастера (F8: панель темпа и подсказки клавиш убраны)', () => {
  it('стол: ни одного инструмента мастера и ни одной подсказки клавиш, кроме «· P»', () => {
    mount(storeWithSecrets());
    P();
    expectNone(DM_TOOLS, 'стол игроков');
    expect.soft(keyHints(), 'подсказки клавиш в title').toEqual([]);
  });

  it('журнал сессии: форма заметки мастера и её подсказки', () => {
    mount(storeWithSecrets());
    P();
    J();
    expectNone(DM_TOOLS, 'журнал сессии');
    expect.soft(keyHints(), 'подсказки клавиш в title').toEqual([]);
  });

  it('бой: «Ход · Space», «Закончить бой», урон/лечение и «Убрать из боя» в попапе хитов', async () => {
    mount(storeWithSecrets());
    startCombat();
    P();
    fireEvent.click(tokenIn(grid(), 'captain')!);
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull(); // попап хитов на столе игроков не открывается вовсе
    expectNone(DM_TOOLS, 'бой после клика по токену');
    expect.soft(keyHints(), 'подсказки клавиш в title').toEqual([]);
  });

  it('вид «Время» остаётся после P: секция «Шаг времени» и «темп часов» на столе игроков', () => {
    mount(storeWithSecrets());
    T();
    P();
    expect.soft(document.body.querySelector('section[aria-label="Шаг времени"]'), 'секция «Шаг времени»').toBeNull();
    expectNone(['темп часов'], 'вид «Время» после P');
    // Кнопки «Время» нет, вместо него показан стол — и именно его кнопка нажата (не экран-сирота).
    expect(screen.queryByRole('button', { name: 'Время' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Стол' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Мир' })).toBeInTheDocument();
  });

  it('клавиши мастера на столе игроков молчат: T, Space, Ctrl+Z и R не пишут событий — и R не перебрасывает скрытый бросок открыто', () => {
    const store = storeWithSecrets();
    mount(store);
    startCombat();
    P();
    let before = store.getState().events.length;
    T();
    expect.soft(store.getState().events.length, 'T на столе игроков').toBe(before);
    SPACE();
    expect.soft(store.getState().events.length, 'Space на столе игроков').toBe(before);
    before = store.getState().events.length;
    UNDO();
    expect.soft(store.getState().events.length, 'Ctrl+Z на столе игроков').toBe(before);
    // R берёт последний бросок из лога — а он скрытый — и бросает его заново с hidden: false: подпись и формула
    // скрытого броска встают в карточку на столе игроков.
    before = store.getState().events.length;
    R();
    expect.soft(store.getState().events.length, 'R на столе игроков').toBe(before);
    expectClean('стол игроков после R');
  });
});

/* ---------- 3. Обратная проверка: стол мастера ---------- */

describe('стол мастера: те же строки присутствуют, и P назад ничего не теряет', () => {
  it('каждая строка-секрет и каждый селектор встречаются на столе мастера хотя бы в одном состоянии', () => {
    const store = storeWithSecrets();
    mount(store);
    const seen = new Set<string>();
    const seenSel = new Set<string>();
    const collect = () => {
      for (const s of found(SECRETS)) seen.add(s);
      for (const sel of SECRET_SELECTORS) if (document.body.querySelector(sel)) seenSel.add(sel);
    };
    collect(); // стол: входящие, карточка скрытого броска, журнал стола
    fireEvent.click(within(screen.getByRole('article', { name: 'Предложение: Zhentarim · Triboar Trail' })).getByTitle(/цепочку причин/));
    collect(); // раскрытая цепочка причин
    clickTab('DM');
    collect(); // вкладка DM
    J();
    collect(); // журнал сессии: напоминания, карточки нитей с «секрет» и «каскад», каскад под записью
    ESC();
    T();
    collect(); // вид «Время»: «Что изменилось»
    ESC();
    expect(SECRETS.filter(s => !seen.has(s)), 'строки, которых нет на столе мастера — проба пустая').toEqual([]);
    expect(SECRET_SELECTORS.filter(s => !seenSel.has(s)), 'селекторы, которых нет на столе мастера — проба пустая').toEqual([]);
    expect(screen.getByRole('tab', { name: 'DM' })).toBeInTheDocument();
  });

  it('инструменты мастера и подсказки клавиш есть на столе мастера', async () => {
    mount(storeWithSecrets());
    const seen = new Set<string>();
    const collect = () => { for (const s of found(DM_TOOLS)) seen.add(s); };
    collect();
    expect(keyHints().length).toBeGreaterThan(0);
    // Пипка ресурса потрачена — появляется «Вернуть: »; вкладка «Состояния» — «Срок состояния».
    fireEvent.click(screen.getAllByRole('button', { name: 'Потратить: Ячейки 1-го круга' })[0]);
    collect();
    const conditionsTab = screen.getByRole('tab', { name: 'Состояния' });
    fireEvent.mouseDown(conditionsTab);
    fireEvent.click(conditionsTab);
    collect();
    const overviewTab = screen.getByRole('tab', { name: 'Обзор' });
    fireEvent.mouseDown(overviewTab);
    fireEvent.click(overviewTab);
    J();
    collect();
    ESC();
    T();
    collect(); // вид «Время»: «темп часов»
    ESC();
    startCombat();
    // Radix возвращает фокус на «Порядок» через setTimeout(0) после закрытия редактора; в браузере это мгновенно,
    // здесь — только после settle. Иначе возврат фокуса застал бы открытый попап хитов и закрыл его как «фокус ушёл».
    await settle();
    fireEvent.click(tokenIn(grid(), 'captain')!);
    await settle();
    collect();
    expect(DM_TOOLS.filter(s => !seen.has(s)), 'инструменты, которых нет на столе мастера — проба пустая').toEqual([]);
  });

  it('P → P: секреты возвращаются в том же составе — мастер ничего не потерял', () => {
    const store = storeWithSecrets();
    mount(store);
    clickTab('DM');
    J();
    const before = found(SECRETS);
    expect(before.length).toBeGreaterThan(10);
    P();
    expectClean('между двумя P');
    P();
    expect(found(SECRETS)).toEqual(before);
    expect(screen.getByRole('main', { name: 'Стол' })).toBeInTheDocument();
    expect(document.body.querySelector('[data-player-view]')).toBeNull();
    ESC();
    expect(screen.getByRole('tab', { name: 'DM' })).toHaveAttribute('aria-selected', 'true');
    expect(bodyText()).toContain('Bo Tambernack тайно докладывает Zhentarim');
    expect(screen.getByRole('list', { name: 'Входящие' })).toBeInTheDocument();
  });
});
