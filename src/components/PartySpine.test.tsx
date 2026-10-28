// PartySpine: четыре строки сида в порядке party, числа Bo из State, пипки вместо полосы при 0 HP,
// чип концентрации с таймером от времени мира, открытие карточки кликом по строке и кнопкой имени,
// вспышка — только пропом, один стор — одно число хитов в строке до и после урона и отмены. Строка —
// контейнер (article), а не кнопка: полоса, пипки и чипы видны ассистивной технологии по ролям;
// единственный вход с клавиатуры — кнопка имени со сводкой строки в описании. Ни одной пиктограммы.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useStore } from 'zustand';
import { LOCATION, SEED_SEC, seedEngine } from '../campaign';

/** Состояние сида ПОСЛЕ его лога: концентрация Bo — событие CONCENTRATION_STARTED, в seedState() её нет. */
const seedState = () => seedEngine().getState().state;
import type { Actor, EngineStoreApi } from '../engine';
import { PartySpine } from './PartySpine';
import { partyRowDescription, partyRowOf } from './PartySpineRow';

const EMOJI = /\p{Extended_Pictographic}/u;

// jsdom 26 + nwsapi: floating-ui под Radix спрашивает `:popover-open`/`:modal` и уходит в рекурсию.
// Тултипы здесь не открываются, но чипы с подсказкой рендерятся — страховка от случайного фокуса.
const nativeMatches = Element.prototype.matches;
beforeAll(() => {
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ':popover-open' || selector === ':modal' ? false : nativeMatches.call(this, selector);
  };
});
afterAll(() => {
  Element.prototype.matches = nativeMatches;
});

/** Партия сида в порядке state.party. */
function partyOf(state = seedState()): Actor[] {
  return state.party.map(id => state.actors[id]);
}

const row = (name: string) => screen.getByRole('article', { name });
const openButton = (name: string) => within(row(name)).getByRole('button', { name: `Открыть карточку: ${name}` });
const meterOf = (name: string) => within(row(name)).getByRole('meter', { name: `Хиты ${name}` });

describe('partyRowOf — проекция актёра в строку', () => {
  it('Bo: имя, уровень 5, 41/49, AC 16, PP 12, один чип — концентрация с «38 мин» от времени сида', () => {
    const bo = seedState().actors.bo;
    const r = partyRowOf(bo, SEED_SEC);
    expect(r).toMatchObject({ id: 'bo', name: 'Bo Tambernack', level: 5, ac: 16, pp: 12, down: false });
    expect(r.hp).toEqual({ current: 41, max: 49, temp: 0 }); // после лога сида: удар капитана уже применён
    expect(r.chips.map(c => c.id)).toEqual(['concentration']);
    expect(r.chips[0]).toMatchObject({ label: "Hunter's Mark", kind: 'conc', timer: '38 мин' });
    expect(r.away).toBeUndefined();
  });

  it('место берётся из словаря по locationId; пропавшая запись печатается своим id, а не прячется', () => {
    const s = seedState();
    const lyra: Actor = { ...s.actors.lyra, locationId: LOCATION.neverwinter };
    expect(partyRowOf(lyra, SEED_SEC, s.world.locations).away).toEqual({ label: 'Neverwinter', icon: 'scale-settlement' });
    const lost: Actor = { ...s.actors.lyra, locationId: 'loc-nowhere' };
    expect(partyRowOf(lost, SEED_SEC, s.world.locations).away).toEqual({ label: 'loc-nowhere', icon: 'scale-settlement' });
    expect(partyRowOf(lost, SEED_SEC).away?.label).toBe('loc-nowhere');
  });

  it('0 HP — down; у монстра без листа уровня нет', () => {
    const s = seedState();
    expect(partyRowOf({ ...s.actors.aldric, hp: { current: 0, max: 38, temp: 0 } }, SEED_SEC).down).toBe(true);
    expect(partyRowOf(s.actors.captain, SEED_SEC).level).toBeUndefined();
  });

  it('partyRowDescription: хиты с временными, чипы с уровнем и таймером, «отделился»; при 0 HP — спасброски', () => {
    const s = seedState();
    const bo = partyRowOf({ ...s.actors.bo, hp: { current: 41, max: 49, temp: 5 }, locationId: LOCATION.neverwinter }, SEED_SEC, s.world.locations);
    expect(partyRowDescription(bo)).toBe("хиты 41 из 49, временные 5; Hunter's Mark, 38 мин; отделился: Neverwinter");
    const ex = partyRowOf({ ...s.actors.korrin, conditions: { exhaustion: { level: 2 }, blinded: {} } }, SEED_SEC);
    expect(partyRowDescription(ex)).toBe('хиты 49 из 49; Ослеплён; Истощение 2');
    const down = partyRowOf({ ...s.actors.aldric, hp: { current: 0, max: 38, temp: 0 } }, SEED_SEC);
    expect(partyRowDescription(down, { saves: 1, fails: 2 })).toBe('0 хитов из 38, спасброски от смерти: успехов 1 из 3, провалов 2 из 3');
    expect(partyRowDescription(down)).toBe('0 хитов из 38, спасброски от смерти: успехов 0 из 3, провалов 0 из 3');
  });
});

describe('<PartySpine> на сиде', () => {
  it('четыре строки в порядке party с именами §13; у Bo — 41/49, AC 16, PP 12, уровень 5', () => {
    const store = seedEngine();
    const { container } = render(<PartySpine actors={partyOf(store.getState().state)} worldSec={SEED_SEC} onOpen={() => {}} />);
    const list = screen.getByRole('list', { name: 'Партия' });
    expect(list).toHaveClass('w-rail-party');
    const items = within(list).getAllByRole('listitem');
    expect(items.map(li => li.querySelector('[data-actor]')?.getAttribute('data-actor'))).toEqual(['bo', 'korrin', 'lyra', 'aldric']);
    expect(items.map(li => li.querySelector('article')?.getAttribute('aria-label')))
      .toEqual(['Bo Tambernack', 'Korrin Battlehammer', 'Lyra Moonwhisper', 'Brother Aldric']);

    const bo = row('Bo Tambernack');
    expect(bo).toHaveClass('min-h-spine-party-h', 'border-l-3', 'border-ent-pc');
    // Строка — не кнопка: без role=button и tabindex, полоса и чипы внутри видны по ролям.
    expect(bo).not.toHaveAttribute('role');
    expect(bo).not.toHaveAttribute('tabindex');
    expect(bo).toHaveAccessibleName('Bo Tambernack');
    // Кнопка имени — короткое действие; сводка строки идёт её описанием.
    const open = openButton('Bo Tambernack');
    expect(open.tagName).toBe('BUTTON');
    expect(open).toHaveAttribute('type', 'button');
    expect(open).toHaveAccessibleDescription("хиты 41 из 49; Hunter's Mark, 38 мин");
    expect(within(bo).getByText('41/49')).toHaveClass('type-num-15');
    expect(meterOf('Bo Tambernack')).toHaveAttribute('aria-valuenow', '41');
    expect(within(bo).getByTitle('Класс доспеха')).toHaveTextContent(/^AC16$/);
    expect(within(bo).getByTitle('Пассивная внимательность')).toHaveTextContent(/^PP12$/);
    expect(within(bo).getByTitle('Уровень')).toHaveTextContent('5');
    // Аватар — иконка расы, рядом строка «раса · класс» с иконкой класса (просьба владельца 28.10).
    expect(within(bo).getByRole('img', { name: 'Полурослик · Следопыт' })).toBeInTheDocument();
    expect(bo.querySelector('[data-part="lineage"]')).toHaveTextContent('Полурослик · Следопыт');
    // Имя — Forum 17, обрезается с тултипом; это и есть кнопка открытия.
    const name = within(bo).getByTitle('Bo Tambernack');
    expect(name).toBe(open);
    expect(name).toHaveClass('type-h-17', 'truncate');
    // Сердца в корешке нет: тесно.
    expect(within(bo).queryByRole('img', { name: /^Хиты/ })).toBeNull();

    expect(within(row('Korrin Battlehammer')).getByText('49/49')).toBeInTheDocument();
    expect(within(row('Brother Aldric')).getByTitle('Класс доспеха')).toHaveTextContent(/^AC18$/);
    expect(container.textContent).not.toMatch(EMOJI);
  });

  it('чипы: у Bo концентрация «Hunter\'s Mark · 38 мин», у Lyra бафф «Mage Armor · 7 ч», у Korrin ряда чипов нет', () => {
    render(<PartySpine actors={partyOf()} worldSec={SEED_SEC} onOpen={() => {}} />);
    const boChip = within(row('Bo Tambernack')).getByText("Hunter's Mark", { selector: 'span' }).closest('[data-kind]') as HTMLElement;
    expect(boChip).toHaveAttribute('data-kind', 'conc');
    expect(within(boChip).getByText('38 мин')).toHaveClass('type-key');
    const lyraChip = within(row('Lyra Moonwhisper')).getByText('Mage Armor', { selector: 'span' }).closest('[data-kind]') as HTMLElement;
    expect(lyraChip).toHaveAttribute('data-kind', 'buff');
    expect(within(lyraChip).getByText('7 ч')).toBeInTheDocument();
    expect(row('Korrin Battlehammer').querySelector('[data-part="chips"]')).toBeNull();
  });

  it('таймер считается от времени мира: через 20 минут — «18 мин»', () => {
    render(<PartySpine actors={partyOf()} worldSec={SEED_SEC + 20 * 60} onOpen={() => {}} />);
    expect(within(row('Bo Tambernack')).getByText('18 мин')).toBeInTheDocument();
  });

  it('0 HP: пипки спасбросков вместо полосы, приглушён только портрет (имя — t2), пипки, AC и PP в полную силу', () => {
    const s = seedState();
    const aldric: Actor = { ...s.actors.aldric, hp: { current: 0, max: 38, temp: 0 } };
    render(<PartySpine actors={[aldric]} worldSec={SEED_SEC} onOpen={() => {}} deathSaves={{ aldric: { saves: 1, fails: 2 } }} />);
    const r = row('Brother Aldric');
    expect(r).toHaveAttribute('data-down', 'true');
    expect(r).not.toHaveClass('opacity-55');
    expect(r.querySelector('[data-part="portrait"]')).toHaveClass('opacity-55');
    expect(within(r).getByTitle('Brother Aldric')).toHaveClass('text-t2');
    expect(within(r).getByTitle('Brother Aldric')).not.toHaveClass('text-tx');
    expect(openButton('Brother Aldric')).toHaveAccessibleDescription('0 хитов из 38, спасброски от смерти: успехов 1 из 3, провалов 2 из 3');
    expect(within(r).queryByRole('meter')).toBeNull();
    expect(within(r).queryByText('0/38')).toBeNull();
    const saves = within(r).getByRole('group', { name: 'Спасброски от смерти: успехов 1 из 3, провалов 2 из 3' });
    expect(saves.querySelectorAll('[data-on="true"]')).toHaveLength(3);
    // Статус 0 HP — пипками, не прозрачностью: ни у группы, ни у пипок, ни у чисел нет opacity-*.
    const OPACITY = /(^|\s)opacity-/;
    expect(saves.className).not.toMatch(OPACITY);
    for (const pip of saves.querySelectorAll('[data-on]')) expect(pip.className).not.toMatch(OPACITY);
    expect(within(r).getByTitle('Класс доспеха').className).not.toMatch(OPACITY);
    expect(within(r).getByTitle('Пассивная внимательность').className).not.toMatch(OPACITY);
    expect(within(r).getByTitle('Класс доспеха')).toHaveTextContent(/^AC18$/);
    expect(within(r).getByTitle('Пассивная внимательность')).toHaveTextContent(/^PP13$/);
  });

  it('0 HP без пропса спасбросков — шесть пустых пипок, а не ошибка', () => {
    const s = seedState();
    render(<PartySpine actors={[{ ...s.actors.bo, hp: { current: 0, max: 49, temp: 0 } }]} worldSec={SEED_SEC} onOpen={() => {}} />);
    const saves = within(row('Bo Tambernack')).getByRole('group', { name: /Спасброски от смерти/ });
    expect(saves.querySelectorAll('[data-on="false"]')).toHaveLength(6);
  });

  it('временные HP: «32/32 +5» и штрих с title «Временные HP: 5»', () => {
    const s = seedState();
    render(<PartySpine actors={[{ ...s.actors.lyra, hp: { current: 32, max: 32, temp: 5 } }]} worldSec={SEED_SEC} onOpen={() => {}} />);
    const r = row('Lyra Moonwhisper');
    expect(within(r).getByText('32/32 +5')).toBeInTheDocument();
    expect(within(r).getByTitle('Временные HP: 5')).toBeInTheDocument();
  });

  it('отделился от партии: строка с именем места и иконкой его масштаба; у остальных строки нет', () => {
    const s = seedState();
    const lyra: Actor = { ...s.actors.lyra, locationId: LOCATION.oldOwlWell };
    render(<PartySpine actors={[lyra, s.actors.bo]} worldSec={SEED_SEC} onOpen={() => {}} locations={s.world.locations} />);
    const away = within(row('Lyra Moonwhisper')).getByTitle('Отделился от партии');
    expect(away).toHaveTextContent('Old Owl Well');
    expect(within(away).getByRole('img', { name: 'Место' })).toBeInTheDocument();
    expect(row('Bo Tambernack').querySelector('[data-part="away"]')).toBeNull();
  });

  it('открытие: клик по строке и клик по кнопке имени зовут onOpen с id по одному разу; Enter на чипе строку не открывает', () => {
    const onOpen = vi.fn();
    render(<PartySpine actors={partyOf()} worldSec={SEED_SEC} onOpen={onOpen} />);
    fireEvent.click(row('Lyra Moonwhisper'));
    expect(onOpen).toHaveBeenLastCalledWith('lyra');
    // Клик по кнопке всплывает до строки — обработчик один, вызов один.
    fireEvent.click(openButton('Korrin Battlehammer'));
    expect(onOpen).toHaveBeenLastCalledWith('korrin');
    expect(onOpen).toHaveBeenCalledTimes(2);
    // Клик по числам внутри строки — тоже открытие: мышью кликабельна вся строка.
    fireEvent.click(within(row('Brother Aldric')).getByTitle('Класс доспеха'));
    expect(onOpen).toHaveBeenLastCalledWith('aldric');
    expect(onOpen).toHaveBeenCalledTimes(3);
    // Enter/Space на <button type="button"> даёт click сам браузер; jsdom этого не синтезирует —
    // утверждение в том, что вход с клавиатуры — настоящая кнопка, а строка в порядок табуляции не входит.
    for (const name of ['Bo Tambernack', 'Korrin Battlehammer', 'Lyra Moonwhisper', 'Brother Aldric']) {
      expect(row(name)).not.toHaveAttribute('tabindex');
      expect(row(name)).not.toHaveAttribute('role');
      expect(openButton(name)).not.toHaveAttribute('tabindex');
      expect(within(row(name)).getAllByRole('button')).toHaveLength(1);
    }
    const chip = within(row('Bo Tambernack')).getByText("Hunter's Mark", { selector: 'span' }).closest('[data-kind]') as HTMLElement;
    fireEvent.keyDown(chip, { key: 'Enter' });
    fireEvent.keyDown(openButton('Bo Tambernack'), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('полоса, пипки и чипы видны по ролям: meter у живого, group у выбывшего, чип с тултипом SRD в порядке табуляции', () => {
    const s = seedState();
    const aldric: Actor = { ...s.actors.aldric, hp: { current: 0, max: 38, temp: 0 } };
    render(<PartySpine actors={[s.actors.bo, aldric]} worldSec={SEED_SEC} onOpen={() => {}} />);
    expect(meterOf('Bo Tambernack')).toHaveAttribute('aria-valuetext', '41 из 49'); // после лога сида
    expect(within(row('Brother Aldric')).getByRole('group', { name: /^Спасброски от смерти/ })).toBeInTheDocument();
    // Строка не кнопка — чип с формулировкой SRD фокусируется и здесь, а не только в карточке.
    const chip = within(row('Bo Tambernack')).getByText("Hunter's Mark", { selector: 'span' }).closest('[data-kind]') as HTMLElement;
    expect(chip).toHaveAttribute('tabindex', '0');
    expect(chip).toHaveAttribute('data-state', 'closed');
  });

  it('выбранная строка: aria-current и золотое кольцо; остальные — просто плита; фокус на кнопке имени кольцует всю строку', () => {
    render(<PartySpine actors={partyOf()} worldSec={SEED_SEC} onOpen={() => {}} selectedId="korrin" />);
    expect(row('Korrin Battlehammer')).toHaveAttribute('aria-current', 'true');
    expect(row('Korrin Battlehammer')).toHaveClass('shadow-[var(--plate),var(--glow-gold)]');
    expect(row('Bo Tambernack')).not.toHaveAttribute('aria-current');
    expect(row('Bo Tambernack')).toHaveClass('shadow-plate');
    // Кольцо фокуса — золото, на строке по :has(:focus-visible); у самой кнопки своего кольца нет (легло бы поверх букв).
    expect(row('Bo Tambernack')).toHaveClass('has-focus-visible:shadow-[var(--plate),var(--glow-gold)]');
    expect(openButton('Bo Tambernack')).toHaveClass('focus-visible:shadow-none');
  });
});

describe('вспышка полосы — один источник, лог событий, через проп flash', () => {
  it('проп задан — берётся как есть; пропа нет — полоса спокойна: строка хиты не сравнивает, вспышку даёт лог', () => {
    const { rerender } = render(<PartySpine actors={partyOf()} worldSec={SEED_SEC} onOpen={() => {}} flash={{ bo: 'damage', korrin: null }} />);
    expect(meterOf('Bo Tambernack')).toHaveClass('shadow-flash-damage');
    expect(meterOf('Korrin Battlehammer')).toHaveClass('shadow-bevel-in');
    const s = seedState();
    const bo = s.actors.bo;
    rerender(<PartySpine actors={[{ ...bo, hp: { ...bo.hp, current: 41 } }]} worldSec={SEED_SEC} onOpen={() => {}} />);
    expect(meterOf('Bo Tambernack')).toHaveClass('shadow-bevel-in');
  });

  it('изменение хитов без пропа — вспышки нет; проп heal — вспышка heal при тех же хитах; снятие пропа гасит', () => {
    const s = seedState();
    const bo = s.actors.bo;
    const at = (current: number, flash?: Readonly<Record<string, 'damage' | 'heal' | null>>) => (
      <PartySpine actors={[{ ...bo, hp: { ...bo.hp, current } }]} worldSec={SEED_SEC} onOpen={() => {}} flash={flash} />
    );
    const { rerender } = render(at(49));
    rerender(at(31));
    expect(meterOf('Bo Tambernack')).toHaveAttribute('aria-valuenow', '31');
    expect(meterOf('Bo Tambernack')).toHaveClass('shadow-bevel-in');
    rerender(at(41));
    expect(meterOf('Bo Tambernack')).toHaveClass('shadow-bevel-in');
    rerender(at(41, { bo: 'heal' }));
    expect(meterOf('Bo Tambernack')).toHaveClass('shadow-flash-heal');
    rerender(at(41, {}));
    expect(meterOf('Bo Tambernack')).toHaveClass('shadow-bevel-in');
  });
});

/** Страница в миниатюре: стор один, корешок читает партию из его state. */
function Harness({ store }: { store: EngineStoreApi }) {
  const state = useStore(store, s => s.state);
  return <PartySpine actors={state.party.map(id => state.actors[id])} worldSec={state.time.sec} onOpen={() => {}} />;
}

describe('один стор — одно число', () => {
  it('урон 10 по Bo: 41/49 → 31/49 в строке и в State; отмена возвращает 41/49', () => {
    const store = seedEngine();
    render(<Harness store={store} />);
    expect(within(row('Bo Tambernack')).getByText('41/49')).toBeInTheDocument();
    act(() => store.getState().damage('bo', 10, 'slashing', 'captain'));
    expect(within(row('Bo Tambernack')).getByText('31/49')).toBeInTheDocument();
    expect(store.getState().state.actors.bo.hp.current).toBe(31);
    expect(meterOf('Bo Tambernack')).toHaveAttribute('aria-valuenow', '31');
    act(() => store.getState().undo());
    expect(within(row('Bo Tambernack')).getByText('41/49')).toBeInTheDocument();
    expect(store.getState().toast).toMatch(/^Отменено: /);
  });

  it('временные хиты Lyra и шаг времени: «32/32 +5», чип Bo «18 мин» после двух шагов по 10 минут', () => {
    const store = seedEngine();
    render(<Harness store={store} />);
    act(() => store.getState().tempHp('lyra', 5));
    expect(within(row('Lyra Moonwhisper')).getByText('32/32 +5')).toBeInTheDocument();
    act(() => store.getState().advanceTime('10min', 2));
    expect(within(row('Bo Tambernack')).getByText('18 мин')).toBeInTheDocument();
  });

  it('состояние через dispatch: «Отравлен» появляется чипом перед концентрацией, истощение — с уровнем', () => {
    const store = seedEngine();
    render(<Harness store={store} />);
    act(() => {
      store.getState().dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned', until: 'конец следующего хода' } });
      store.getState().dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
      store.getState().dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
    });
    const chips = row('Bo Tambernack').querySelector('[data-part="chips"]') as HTMLElement;
    const kinds = Array.from(chips.querySelectorAll('[data-kind]')).map(el => el.getAttribute('data-kind'));
    expect(kinds).toEqual(['debuff', 'debuff', 'conc']);
    expect(within(chips).getByText('Отравлен', { selector: 'span' })).toBeInTheDocument();
    expect(within(chips).getByText('конец следующего хода')).toBeInTheDocument();
    expect(within(chips).getByTitle('Уровень истощения')).toHaveTextContent('2');
  });
});
