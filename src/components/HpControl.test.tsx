// HpControl: величина только целая и больше нуля, Enter — урон, лечение и временные — свои колбэки,
// быстрые кнопки, вспышка 200 мс от последнего события лога (не от клика), пипки при 0 HP, промпт
// концентрации с DC по SRD про последний действующий урон из лога — отмена урона его гасит,
// HpPopover открывается по якорю и закрывается по Esc.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useStore } from 'zustand';
import { seedEngine } from '../campaign';
import type { Actor, EngineStoreApi } from '../engine';
import { HP_FLASH_MS, useHpFlashes } from '../engine/useEngine';
import { ANSWERED_KEEP, HpControl, HpPopover, QUICK_DAMAGE, QUICK_TEMP, digitsOnly, lastDamageOf, parseAmount } from './HpControl';

const EMOJI = /\p{Extended_Pictographic}/u;
const MINUS = '−';

// jsdom 26 + nwsapi 2.2.27: floating-ui под Radix Popper спрашивает `:popover-open` и `:modal`,
// nwsapi на них уходит в рекурсию до RangeError — секунды на каждое открытие. В браузере этого нет.
// Тот же сторож стоит в ConditionChip.test.tsx; место ему — в общем src/test-setup.ts.
const nativeMatches = Element.prototype.matches;
beforeAll(() => {
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ':popover-open' || selector === ':modal' ? false : nativeMatches.call(this, selector);
  };
});
afterAll(() => {
  Element.prototype.matches = nativeMatches;
});
afterEach(() => vi.useRealTimers());

/** Тупые колбэки: компонент не знает про стор. */
function noop() {
  return { onDamage: vi.fn(), onHeal: vi.fn(), onTempHp: vi.fn() };
}

const actorOf = (store: EngineStoreApi, id: string): Actor => store.getState().state.actors[id];

const input = () => screen.getByRole('textbox', { name: 'Величина' });
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('parseAmount и digitsOnly', () => {
  it('целое больше нуля — число; ноль, пусто, дробь, минус, буквы — null', () => {
    expect(parseAmount('8')).toBe(8);
    expect(parseAmount('30')).toBe(30);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('00')).toBeNull();
    expect(parseAmount('1.5')).toBeNull();
    expect(parseAmount('-3')).toBeNull();
    expect(parseAmount(`${MINUS}3`)).toBeNull();
    expect(parseAmount('8a')).toBeNull();
  });
  it('поле оставляет только цифры и не длиннее четырёх', () => {
    expect(digitsOnly('1a2')).toBe('12');
    expect(digitsOnly('-8')).toBe('8');
    expect(digitsOnly('123456')).toBe('1234');
    expect(digitsOnly('')).toBe('');
  });
});

describe('HpControl с тупыми колбэками', () => {
  it('имя, полоса с сердцем «41/49», поле числа, три кнопки действия недоступны при пустом поле', () => {
    const store = seedEngine();
    const { container } = render(<HpControl actor={actorOf(store, 'bo')} {...noop()} />);
    expect(screen.getByText('Bo Tambernack')).toHaveClass('type-h-20');
    expect(screen.getByRole('meter', { name: 'Хиты Bo Tambernack' })).toHaveAttribute('aria-valuenow', '41');
    expect(screen.getByText('41/49')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Хиты Bo Tambernack' })).toBeInTheDocument();
    expect(input()).toHaveAttribute('inputmode', 'numeric');
    expect(btn('Урон')).toBeDisabled();
    expect(btn('Лечение')).toBeDisabled();
    expect(btn('Врем.')).toBeDisabled();
    expect(container.textContent).not.toMatch(EMOJI);
    expect(container.innerHTML).not.toMatch(EMOJI);
  });

  it('ввод 8 + «Урон» → onDamage(8); поле очищается и остаётся в фокусе', () => {
    const store = seedEngine();
    const cb = noop();
    render(<HpControl actor={actorOf(store, 'bo')} {...cb} />);
    type('8');
    expect(btn('Урон')).toBeEnabled();
    fireEvent.click(btn('Урон'));
    expect(cb.onDamage).toHaveBeenCalledTimes(1);
    expect(cb.onDamage).toHaveBeenCalledWith(8);
    expect(cb.onHeal).not.toHaveBeenCalled();
    expect(cb.onTempHp).not.toHaveBeenCalled();
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
    expect(btn('Урон')).toBeDisabled();
  });

  it('Enter в поле — урон по умолчанию; с пустым полем Enter ничего не делает', () => {
    const store = seedEngine();
    const cb = noop();
    render(<HpControl actor={actorOf(store, 'bo')} {...cb} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(cb.onDamage).not.toHaveBeenCalled();
    type('12');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(cb.onDamage).toHaveBeenCalledWith(12);
    expect(cb.onHeal).not.toHaveBeenCalled();
  });

  it('«Лечение» и «Врем.» зовут свои колбэки с введённым числом', () => {
    const store = seedEngine();
    const cb = noop();
    render(<HpControl actor={actorOf(store, 'bo')} {...cb} />);
    type('7');
    fireEvent.click(btn('Лечение'));
    expect(cb.onHeal).toHaveBeenCalledWith(7);
    type('9');
    fireEvent.click(btn('Врем.'));
    expect(cb.onTempHp).toHaveBeenCalledWith(9);
    expect(cb.onDamage).not.toHaveBeenCalled();
  });

  it('0, пусто и мусор — кнопки недоступны, колбэки не зовутся; поле выбрасывает нецифры', () => {
    const store = seedEngine();
    const cb = noop();
    render(<HpControl actor={actorOf(store, 'bo')} {...cb} />);
    type('0');
    expect(input()).toHaveValue('0');
    expect(btn('Урон')).toBeDisabled();
    expect(btn('Лечение')).toBeDisabled();
    expect(btn('Врем.')).toBeDisabled();
    fireEvent.click(btn('Урон'));
    fireEvent.keyDown(input(), { key: 'Enter' });
    type('-5');
    expect(input()).toHaveValue('5');
    type('abc');
    expect(input()).toHaveValue('');
    expect(btn('Урон')).toBeDisabled();
    expect(cb.onDamage).not.toHaveBeenCalled();
    expect(cb.onHeal).not.toHaveBeenCalled();
    expect(cb.onTempHp).not.toHaveBeenCalled();
  });

  it('быстрые кнопки: «−1» «−5» «−10» — урон, «Врем. +5» — временные; минус типографский, дефиса нет', () => {
    const store = seedEngine();
    const cb = noop();
    const { container } = render(<HpControl actor={actorOf(store, 'bo')} {...cb} />);
    for (const n of QUICK_DAMAGE) {
      const b = btn(`Урон ${n}`);
      expect(b).toHaveTextContent(`${MINUS}${n}`);
      fireEvent.click(b);
    }
    expect(cb.onDamage.mock.calls.map(c => c[0])).toEqual([1, 5, 10]);
    fireEvent.click(btn(`Временные хиты ${QUICK_TEMP}`));
    expect(cb.onTempHp).toHaveBeenCalledWith(QUICK_TEMP);
    expect(cb.onHeal).not.toHaveBeenCalled();
    const quick = container.querySelectorAll('button');
    for (const b of quick) expect(b.textContent).not.toContain('-');
  });

  it('все кнопки нативные type="button"', () => {
    const store = seedEngine();
    const { container } = render(<HpControl actor={actorOf(store, 'bo')} {...noop()} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(7);
    for (const b of buttons) expect(b).toHaveAttribute('type', 'button');
  });
});

describe('lastDamageOf — последний действующий урон из лога', () => {
  it('сид: у Bo — seed-1 на 8, у капитана — seed-2 на 20, у Korrin — null; отмена убирает, повтор возвращает', () => {
    const store = seedEngine();
    const events = () => store.getState().events;
    expect(lastDamageOf(events(), 'bo')).toEqual({ id: 'seed-1', amount: 8 });
    expect(lastDamageOf(events(), 'captain')).toEqual({ id: 'seed-2', amount: 20 });
    expect(lastDamageOf(events(), 'korrin')).toBeNull();
    store.getState().damage('bo', 5);
    const e = store.getState().events.at(-1)!;
    expect(lastDamageOf(events(), 'bo')).toEqual({ id: e.id, amount: 5 });
    store.getState().undo();
    expect(lastDamageOf(events(), 'bo')).toEqual({ id: 'seed-1', amount: 8 });
    store.getState().redo();
    expect(lastDamageOf(events(), 'bo')).toEqual({ id: e.id, amount: 5 });
    // Лечение и временные хиты — не урон.
    store.getState().heal('bo', 3);
    expect(lastDamageOf(events(), 'bo')).toEqual({ id: e.id, amount: 5 });
  });
});

describe('промпт концентрации (тупые пропсы)', () => {
  const prompt = () => screen.queryByRole('group', { name: 'Проверка концентрации' });

  it('урон, бывший в логе при открытии, — история: промпта нет; новый урон 8 — DC 10, 30 — DC 15', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const { rerender } = render(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'seed-1', amount: 8 }} />);
    expect(prompt()).toBeNull();
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'e1', amount: 8 }} />);
    expect(prompt()).toHaveTextContent("Hunter's Mark");
    expect(prompt()).toHaveTextContent('Спасбросок Телосложения на концентрацию, DC 10');
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'e2', amount: 30 }} />);
    expect(prompt()).toHaveTextContent('DC 15');
    expect(screen.queryByText(/DC 10/)).toBeNull();
  });

  it('спасбросок CON передан — «удержит с шансом» (ROADMAP 5.5): +3 против DC 10 — 70%, против DC 15 — 45%; без него строки нет', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    // Урон, бывший при открытии, — история; промпт — про новый.
    const { rerender } = render(<HpControl actor={bo} {...noop()} conSave={3} lastDamage={{ id: 'seed-1', amount: 8 }} />);
    rerender(<HpControl actor={bo} {...noop()} conSave={3} lastDamage={{ id: 'e1', amount: 8 }} />);
    const hold = () => prompt()!.querySelector('[data-part="concentration-hold"]');
    expect(hold()).toHaveTextContent('удержит с шансом 70%');
    expect(hold()).toHaveAttribute('title', expect.stringContaining('нужно 7+ на d20'));
    rerender(<HpControl actor={bo} {...noop()} conSave={3} lastDamage={{ id: 'e2', amount: 30 }} />);
    expect(hold()).toHaveTextContent('удержит с шансом 45%');
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'e3', amount: 30 }} />);
    expect(hold()).toBeNull();
  });

  it('«Удержал» и «Потерял» зовут колбэки и гасят промпт; без колбэков — просто гасят; отвеченный урон не спрашивается снова', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const kept = vi.fn();
    const lost = vi.fn();
    const view = (id: string, cb = true) => (
      <HpControl actor={bo} {...noop()} lastDamage={{ id, amount: 5 }} onConcentrationKept={cb ? kept : undefined} onConcentrationLost={cb ? lost : undefined} />
    );
    const { rerender } = render(view('seed-1'));
    rerender(view('e1'));
    fireEvent.click(within(prompt()!).getByRole('button', { name: 'Удержал' }));
    expect(kept).toHaveBeenCalledTimes(1);
    expect(lost).not.toHaveBeenCalled();
    expect(prompt()).toBeNull();

    rerender(view('e2'));
    fireEvent.click(btn('Потерял'));
    expect(lost).toHaveBeenCalledTimes(1);
    expect(prompt()).toBeNull();
    // Урон e2 отменили, а e1 уже отвечен — вопрос не повторяется.
    rerender(view('e1'));
    expect(prompt()).toBeNull();

    rerender(view('e3', false));
    fireEvent.click(btn('Удержал'));
    expect(prompt()).toBeNull();
  });

  it('lastDamage → null (урон отменён) гасит промпт; тот же id без ответа возвращает его (повтор); отвеченный — уже нет', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const view = (d: { id: string; amount: number } | null) => <HpControl actor={bo} {...noop()} lastDamage={d} />;
    const { rerender } = render(view({ id: 'seed-1', amount: 8 }));
    rerender(view({ id: 'e1', amount: 5 }));
    expect(prompt()).toHaveTextContent('DC 10');
    rerender(view(null));
    expect(prompt()).toBeNull();
    rerender(view({ id: 'e1', amount: 5 }));
    expect(prompt()).toHaveTextContent('DC 10');
    fireEvent.click(btn('Удержал'));
    expect(prompt()).toBeNull();
    rerender(view(null));
    rerender(view({ id: 'e1', amount: 5 }));
    expect(prompt()).toBeNull();
    // Нового урона нет — и промпта нет: lastDamage null держится, пока лог молчит.
    rerender(view(null));
    expect(prompt()).toBeNull();
  });

  it('смена актёра начинает список отвеченных заново: последний урон нового актёра — история, следующий — вопрос', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const korrin: Actor = { ...actorOf(store, 'korrin'), concentration: { spell: 'Bless' } };
    const { rerender } = render(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'seed-1', amount: 8 }} />);
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'b1', amount: 5 }} />);
    expect(prompt()).toHaveTextContent("Hunter's Mark");
    // Панель переключили на Korrin: его k1 уже был в логе — вопрос не про него.
    rerender(<HpControl actor={korrin} {...noop()} lastDamage={{ id: 'k1', amount: 12 }} />);
    expect(prompt()).toBeNull();
    rerender(<HpControl actor={korrin} {...noop()} lastDamage={{ id: 'k2', amount: 12 }} />);
    expect(prompt()).toHaveTextContent('Bless');
    expect(prompt()).toHaveTextContent('DC 10');
    // Обратно к Bo: b1, отвеченный не был, но при переключении он — история; вопрос только про новый.
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'b1', amount: 5 }} />);
    expect(prompt()).toBeNull();
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'b2', amount: 5 }} />);
    expect(prompt()).toHaveTextContent("Hunter's Mark");
  });

  it(`список отвеченных не растёт без предела: помнит последние ${ANSWERED_KEEP}, более старый урон спросится снова`, () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const view = (id: string) => <HpControl actor={bo} {...noop()} lastDamage={{ id, amount: 5 }} />;
    const { rerender } = render(view('seed-1'));
    for (let i = 1; i <= ANSWERED_KEEP + 1; i++) {
      rerender(view(`e${i}`));
      fireEvent.click(btn('Удержал'));
      expect(prompt()).toBeNull();
    }
    // e1 вытеснен из памяти — вопрос повторится; e2 ещё помнится.
    rerender(view('e1'));
    expect(prompt()).toHaveTextContent('DC 10');
    rerender(view('e2'));
    expect(prompt()).toBeNull();
    rerender(view(`e${ANSWERED_KEEP + 1}`));
    expect(prompt()).toBeNull();
  });

  it('у актёра без концентрации (Korrin) промпта нет и после урона', () => {
    const store = seedEngine();
    render(<HpControl actor={actorOf(store, 'korrin')} {...noop()} lastDamage={{ id: 'e1', amount: 30 }} />);
    expect(prompt()).toBeNull();
    expect(screen.queryByText(/DC/)).toBeNull();
  });

  it('концентрация ушла из актёра — промпт гаснет без ответа', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const { rerender } = render(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'e1', amount: 5 }} />);
    // Урон появился после открытия панели.
    rerender(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'e2', amount: 5 }} />);
    expect(prompt()).toBeInTheDocument();
    const { concentration: _dropped, ...without } = bo;
    void _dropped;
    rerender(<HpControl actor={without} {...noop()} lastDamage={{ id: 'e2', amount: 5 }} />);
    expect(prompt()).toBeNull();
  });
});

describe('0 HP', () => {
  it('персонаж: полоса остаётся, под ней пипки 0/0 и подпись; с deathSaves — закрашены', () => {
    const store = seedEngine();
    store.getState().damage('aldric', 38);
    const aldric = actorOf(store, 'aldric');
    expect(aldric.hp.current).toBe(0);
    const { rerender } = render(<HpControl actor={aldric} {...noop()} />);
    expect(screen.getByRole('meter', { name: 'Хиты Brother Aldric' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0/38')).toBeInTheDocument();
    const pips = screen.getByRole('group', { name: 'Спасброски от смерти: успехов 0 из 3, провалов 0 из 3' });
    expect(pips.querySelectorAll('[data-on]')).toHaveLength(6);
    expect(pips.querySelectorAll('[data-on="true"]')).toHaveLength(0);
    expect(screen.getByText('Спасброски от смерти')).toBeInTheDocument();
    // Кнопки те же: лечение поднимает с нуля.
    expect(btn('Лечение')).toBeDisabled();
    type('5');
    expect(btn('Лечение')).toBeEnabled();

    rerender(<HpControl actor={aldric} {...noop()} deathSaves={{ saves: 1, fails: 2 }} />);
    const filled = screen.getByRole('group', { name: 'Спасброски от смерти: успехов 1 из 3, провалов 2 из 3' });
    expect(filled.querySelectorAll('[data-part="save"] [data-on="true"]')).toHaveLength(1);
    expect(filled.querySelectorAll('[data-part="fail"] [data-on="true"]')).toHaveLength(2);
  });

  it('при живых хитах пипок нет', () => {
    const store = seedEngine();
    render(<HpControl actor={actorOf(store, 'aldric')} {...noop()} />);
    expect(screen.queryByRole('group', { name: /Спасброски от смерти/ })).toBeNull();
    expect(screen.queryByText('Спасброски от смерти')).toBeNull();
  });

  it('монстр при 0 HP: пипок нет, подпись «Выбыл: 0 хитов» (SRD: монстр по умолчанию умирает)', () => {
    const store = seedEngine();
    store.getState().damage('bandit-1', 11);
    render(<HpControl actor={actorOf(store, 'bandit-1')} {...noop()} />);
    expect(screen.getByText('0/11')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Спасброски от смерти/ })).toBeNull();
    expect(screen.getByText('Выбыл: 0 хитов')).toBeInTheDocument();
  });
});

describe('0 HP при концентрации', () => {
  it('вместо спасброска DC — «Без сознания — концентрация падает»; «Снять» зовёт onConcentrationDropped; без колбэка кнопки нет', () => {
    const store = seedEngine();
    store.getState().damage('bo', 41);
    const bo = actorOf(store, 'bo');
    expect(bo.hp.current).toBe(0);
    expect(bo.concentration?.spell).toBe("Hunter's Mark");
    const dropped = vi.fn();
    const { rerender } = render(<HpControl actor={bo} {...noop()} lastDamage={{ id: 'x', amount: 41 }} onConcentrationDropped={dropped} />);
    expect(screen.queryByRole('group', { name: 'Проверка концентрации' })).toBeNull();
    const drop = screen.getByRole('group', { name: 'Концентрация без сознания' });
    expect(drop).toHaveTextContent("Hunter's Mark");
    expect(drop).toHaveTextContent('Без сознания — концентрация падает');
    fireEvent.click(within(drop).getByRole('button', { name: 'Снять' }));
    expect(dropped).toHaveBeenCalledTimes(1);
    rerender(<HpControl actor={bo} {...noop()} />);
    expect(within(screen.getByRole('group', { name: 'Концентрация без сознания' })).queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(EMOJI);
  });
});

describe('вспышка полосы — только проп flash, из лога', () => {
  it('flash="damage" — вспышка при любых хитах; смена хитов без пропа — полоса спокойна; null гасит', () => {
    const store = seedEngine();
    const bo = actorOf(store, 'bo');
    const at = (current: number, flash?: 'damage' | 'heal' | null) => (
      <HpControl actor={{ ...bo, hp: { ...bo.hp, current } }} {...noop()} flash={flash} />
    );
    const meter = () => screen.getByRole('meter', { name: 'Хиты Bo Tambernack' });
    const { rerender } = render(at(41));
    expect(meter()).toHaveClass('shadow-bevel-in');
    rerender(at(31));
    expect(meter()).toHaveAttribute('aria-valuenow', '31');
    expect(meter()).toHaveClass('shadow-bevel-in');
    rerender(at(31, 'damage'));
    expect(meter()).toHaveClass('shadow-flash-damage');
    rerender(at(41, 'heal'));
    expect(meter()).toHaveClass('shadow-flash-heal');
    rerender(at(41, null));
    expect(meter()).toHaveClass('shadow-bevel-in');
  });
});

describe('сопротивления', () => {
  it('строка есть только с resist; иконка щита с title', () => {
    const store = seedEngine();
    const { rerender } = render(<HpControl actor={actorOf(store, 'bo')} {...noop()} />);
    expect(screen.queryByRole('img', { name: 'Сопротивления и уязвимости' })).toBeNull();
    rerender(<HpControl actor={actorOf(store, 'bo')} {...noop()} resist="Сопротивление: яд" />);
    expect(screen.getByRole('img', { name: 'Сопротивления и уязвимости' })).toBeInTheDocument();
    expect(screen.getByText('Сопротивление: яд')).toBeInTheDocument();
  });
});

/** Страница шага 5 в миниатюре: стор один, актёр, вспышка и последний урон — из стора, колбэки — в стор. */
function Harness({ store, id }: { store: EngineStoreApi; id: string }) {
  const actor = useStore(store, s => s.state.actors[id]);
  const events = useStore(store, s => s.events);
  const flashes = useHpFlashes(store);
  const api = store.getState();
  return (
    <HpControl
      actor={actor}
      flash={flashes[id] ?? null}
      lastDamage={lastDamageOf(events, id)}
      onDamage={n => api.damage(id, n)}
      onHeal={n => api.heal(id, n)}
      onTempHp={n => api.tempHp(id, n)}
    />
  );
}

describe('HpControl над стором', () => {
  it('урон 8 → 33/49 в полосе и в State; undo возвращает 41/49; хиты нигде не хранятся кроме стора', () => {
    const store = seedEngine();
    render(<Harness store={store} id="bo" />);
    type('8');
    fireEvent.click(btn('Урон'));
    expect(store.getState().state.actors.bo.hp.current).toBe(33);
    expect(screen.getByText('33/49')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /Хиты/ })).toHaveAttribute('aria-valuenow', '33');
    act(() => store.getState().undo());
    expect(screen.getByText('41/49')).toBeInTheDocument();
    expect(store.getState().toast).toMatch(/Отменено/);
  });

  it('временные: «Врем. +5» → «41/49 +5» со штрихом; урон 8 съедает временные первыми — «38/49»', () => {
    const store = seedEngine();
    render(<Harness store={store} id="bo" />);
    fireEvent.click(btn(`Временные хиты ${QUICK_TEMP}`));
    expect(screen.getByText('41/49 +5')).toBeInTheDocument();
    expect(screen.getByTitle('Временные HP: 5')).toBeInTheDocument();
    type('8');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(store.getState().state.actors.bo.hp).toEqual({ current: 38, max: 49, temp: 0 });
    expect(screen.getByText('38/49')).toBeInTheDocument();
    expect(screen.queryByTitle(/Временные HP/)).toBeNull();
  });

  it('вспышка: damage на 200 мс после урона, heal после лечения, потом снова bevel-in; событие без изменения хитов тоже вспыхивает', () => {
    vi.useFakeTimers();
    const store = seedEngine();
    render(<Harness store={store} id="korrin" />);
    const meter = () => screen.getByRole('meter', { name: /Хиты/ });
    expect(meter()).toHaveClass('shadow-bevel-in');
    fireEvent.click(btn('Урон 5'));
    expect(meter()).toHaveClass('shadow-flash-damage');
    act(() => { vi.advanceTimersByTime(HP_FLASH_MS - 1); });
    expect(meter()).toHaveClass('shadow-flash-damage');
    act(() => { vi.advanceTimersByTime(1); });
    expect(meter()).toHaveClass('shadow-bevel-in');
    type('3');
    fireEvent.click(btn('Лечение'));
    expect(meter()).toHaveClass('shadow-flash-heal');
    act(() => { vi.advanceTimersByTime(HP_FLASH_MS); });
    expect(meter()).toHaveClass('shadow-bevel-in');
    // Korrin на полных 49/49: лечение хитов не меняет, но событие в логе есть — вспышка по событию, как в корешке.
    type('20');
    fireEvent.click(btn('Лечение'));
    expect(store.getState().state.actors.korrin.hp.current).toBe(49);
    expect(meter()).toHaveClass('shadow-flash-heal');
  });

  it('промпт концентрации над стором: урон 5 → DC 10; Ctrl+Z-отмена урона гасит промпт, повтор возвращает', () => {
    const store = seedEngine();
    render(<Harness store={store} id="bo" />);
    const prompt = () => screen.queryByRole('group', { name: 'Проверка концентрации' });
    expect(prompt()).toBeNull(); // seed-1 — история
    fireEvent.click(btn('Урон 5'));
    expect(prompt()).toHaveTextContent('DC 10');
    act(() => store.getState().undo());
    expect(store.getState().state.actors.bo.hp.current).toBe(41);
    expect(prompt()).toBeNull();
    act(() => store.getState().redo());
    expect(prompt()).toHaveTextContent('DC 10');
    fireEvent.click(btn('Удержал'));
    expect(prompt()).toBeNull();
  });

  it('лечение с полных хитов — редьюсер держит max, компонент не клампит сам', () => {
    const store = seedEngine();
    render(<Harness store={store} id="korrin" />);
    type('20');
    fireEvent.click(btn('Лечение'));
    expect(store.getState().state.actors.korrin.hp.current).toBe(49);
    expect(screen.getByText('49/49')).toBeInTheDocument();
  });
});

describe('HpPopover', () => {
  it('по клику на якорь открывается диалог с панелью, фокус в поле; Esc закрывает', () => {
    const store = seedEngine();
    const cb = noop();
    render(
      <HpPopover actor={actorOf(store, 'bo')} {...cb}>
        <button type="button">41/49</button>
      </HpPopover>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '41/49' }));
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' });
    expect(within(dialog).getByText('Bo Tambernack')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Величина' })).toHaveFocus();
    type('4');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Урон' }));
    expect(cb.onDamage).toHaveBeenCalledWith(4);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
