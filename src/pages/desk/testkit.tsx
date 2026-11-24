// Общие помощники тестов стола: стор на сиде с детерминированными часами, монтирование страницы,
// поиск корешков, карточек и зон по ролям.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import { seedEngine, seedLog, seedState } from '../../campaign';
import { createEngineStore, memoryStore, type EngineStoreApi } from '../../engine';
import { DeskPage } from '../DeskPage';

export const EMOJI = /\p{Extended_Pictographic}/u;

/** Детерминированные часы и id: журнал и лог читаются глазами. */
export function fixed() {
  let t = 1_000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
}

/**
 * Стор теста — сид с памятью вместо localStorage: jsdom-хранилище на страницу не влияет. Персонаж открывается листом
 * целиком: тесты стола проверяют лист, карта на лице (Д9) — свои тесты, `face: 'card'`.
 */
export function mount(store: EngineStoreApi = seedEngine({ persist: memoryStore(), ...fixed() }), dmView?: boolean, face: 'card' | 'sheet' = 'sheet') {
  const view = render(<DeskPage store={store} dmView={dmView} cardFace={face} />);
  return { store, ...view };
}

export const rowOf = (name: string) => screen.getByRole('article', { name });
export const cardOf = (name: string) => screen.getByRole('region', { name });
/** Ячейка HP в полосе показателей — кнопка с title «Хиты». */
export const hpCellOf = (card: HTMLElement) => within(card).getByTitle('Хиты');
export const tab = (name: string) => {
  const t = screen.getByRole('tab', { name });
  fireEvent.mouseDown(t);
  fireEvent.click(t);
};
export const hpOf = (store: EngineStoreApi, id: string) => store.getState().state.actors[id].hp;
export const lastEvent = (store: EngineStoreApi) => store.getState().events.at(-1)!;

/** Урон через попап хитов: клик по ячейке HP, число в поле, «Урон». */
export function damageViaPopover(card: HTMLElement, amount: number) {
  fireEvent.click(hpCellOf(card));
  const dialog = screen.getByRole('dialog', { name: /^Хиты: / });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Величина' }), { target: { value: String(amount) } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Урон' }));
  return dialog;
}

// Полоса инициативы — <footer aria-label="Бой">; иконки с тем же aria-label в ней нет (у сетки и зоны — свои подписи).
export const bar = () => screen.getByLabelText('Бой', { selector: 'footer' });
export const grid = () => screen.getByRole('group', { name: 'Боевая сетка' });
export const tokenIn = (zone: HTMLElement, id: string) => zone.querySelector<HTMLElement>(`[data-actor="${id}"]`);
export const activeIn = (zone: HTMLElement) => zone.querySelector<HTMLElement>('[data-actor][aria-current="true"]')?.dataset.actor;
/** «Начать бой» открывает редактор инициативы (броски сида предзаполнены); «Начать бой» в нём пишет ENCOUNTER_STARTED. */
export const startCombat = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Начать бой' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Инициатива' })).getByRole('button', { name: 'Начать бой' }));
};

export const journalView = () => screen.getByRole('region', { name: 'Журнал сессии' });
export const inbox = () => screen.getByRole('list', { name: 'Входящие' });
export const deltaCard = (subject: string) => screen.getByRole('article', { name: `Предложение: ${subject}` });
export const openJournal = () => fireEvent.keyDown(window, { key: 'j', code: 'KeyJ' });

export const tempoGroup = () => screen.getByRole('group', { name: 'Темп времени' });
export const timeView = () => screen.getByRole('region', { name: 'Шаг времени' });
/** Opens the compact clock controls only for scenarios that exercise time, rest, or calendar UI. */
export const openTimeControls = () => {
  const current = screen.queryByRole('dialog', { name: 'Управление временем' });
  if (current) return current;
  fireEvent.click(screen.getByRole('button', { name: 'Управление временем' }));
  return screen.getByRole('dialog', { name: 'Управление временем' });
};
/** Асинхронные команды ждут настоящей подготовки правил; без моков и таймаутов. */
export async function timeAction(action: () => void) {
  const { prepareSimulation } = await import('../../campaign/prepareSimulation');
  await act(async () => {
    action();
    await prepareSimulation();
  });
  const apply = screen.queryByRole('button', { name: 'Применить шаг' });
  if (apply) await act(async () => { fireEvent.click(apply); });
}
export const step = () => timeAction(() => { fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Шаг' })); });

/** Стол со всеми видами секретов: скрытый бросок, отклонённое и принятое предложения, ждущие предложения, факты мастера. */
export function storeWithSecrets() {
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
export const SECRET_TEXTS = [
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
export function expectNoSecrets() {
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

export const ladderNav = () => screen.getByRole('navigation', { name: 'Лестница масштабов' });
export const stepOf = (scale: string) => ladderNav().querySelector<HTMLElement>(`[data-scale="${scale}"]`)!;
export const currentStep = () => ladderNav().querySelector<HTMLElement>('[aria-current="true"]')!.dataset.scale;
export const worldView = () => screen.getByRole('region', { name: 'Мир' });
export const levelHead = () => worldView().querySelector<HTMLElement>('[data-part="level"]')!;
export const here = () => screen.queryByRole('group', { name: 'Здесь' });
export const up = () => fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
export const down = () => fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
export const tempoOn = () => within(tempoGroup()).getByRole('radio', { checked: true }).textContent;
