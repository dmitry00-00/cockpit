// Общая карточка по ссылке (ROADMAP 0.3): умение, черта, заклинание с листа открываются одной карточкой с
// источником; связи в ней открывают следующие карточки; щелчок по персонажу партии возвращает его карточку.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardOf, mount, rowOf } from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Раскрыть плитку ряда иконок и нажать «Карточка» в раскрытом тексте. */
function openTile(tile: HTMLElement) {
  fireEvent.click(tile);
  const name = tile.getAttribute('aria-label')!.split(' · ')[0];
  fireEvent.click(within(screen.getByRole('region', { name })).getByRole('button', { name: 'Карточка' }));
  return name;
}

describe('общая карточка по ссылке', () => {
  it('умение класса с листа → карточка «Умение класса» с текстом и источником; связь «Следопыт» → карточка класса', async () => {
    mount();
    const name = openTile(within(screen.getByRole('list', { name: 'Умения класса' })).getAllByRole('button')[0]);
    const card = await screen.findByRole('region', { name });
    expect(card).toHaveTextContent('Умение класса');
    expect(card.querySelector('[data-part="source"]')!.textContent).toMatch(/SRD 5\.1|книги|хоумбрю/);
    fireEvent.click(within(card).getByRole('button', { name: 'Следопыт' }));
    const cls = await screen.findByRole('region', { name: 'Ranger' });
    expect(within(cls).getByRole('list', { name: 'Связи' })).toBeInTheDocument();
  });

  it('черта расы Bo → карточка «Особенность расы» со связью на расу; щелчок по Bo в партии возвращает его карточку', async () => {
    mount();
    const name = openTile(within(screen.getByRole('list', { name: 'Черты расы' })).getAllByRole('button')[0]);
    const card = await screen.findByRole('region', { name });
    expect(card).toHaveTextContent('Особенность расы');
    expect(within(card).getByRole('button', { name: 'Полурослик' })).toBeInTheDocument();
    fireEvent.click(rowOf('Bo Tambernack'));
    expect(await screen.findByRole('region', { name: 'Bo Tambernack' })).toBeInTheDocument();
  });

  it("журнал: «Hunter's Mark» в записи концентрации — ссылка на заклинание, щелчок открывает его карточку", async () => {
    mount();
    fireEvent.keyDown(window, { key: 'j', code: 'KeyJ' });
    fireEvent.click(within(screen.getByRole('region', { name: 'Журнал сессии' })).getAllByRole('button', { name: "Открыть карточку: Hunter's Mark" })[0]);
    const card = await screen.findByRole('region', { name: "Hunter's Mark" });
    expect(within(card).getByText('Длительность')).toBeInTheDocument();
    expect(card).toHaveTextContent('CC-BY-4.0');
  });
});

/* ---------- Остаток 0.3: чип состояния, карточка места на карте, тела и сферы космоса ведут в общую карточку ---------- */

describe('общая карточка: чипы и космос (ROADMAP 0.3)', () => {
  const toLevel = (lvl: string) => fireEvent.click(screen.getByRole('navigation', { name: 'Лестница масштабов' }).querySelector(`[data-scale="${lvl}"]`)!);

  it('чип состояния — карточка состояния SRD с источником; чип концентрации — карточка заклинания', async () => {
    const { store } = mount();
    act(() => { store.getState().dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'prone' } }); });
    const chips = cardOf('Bo Tambernack').querySelector('[data-part="chips"]') as HTMLElement;
    fireEvent.click(within(chips).getByRole('button', { name: 'Карточка: Сбит с ног' }));
    const prone = await screen.findByRole('region', { name: 'Prone' });
    expect(prone).toHaveTextContent('Состояние');
    expect(prone.querySelector('[data-part="source"]')!.textContent).toMatch(/SRD/);
    fireEvent.click(rowOf('Bo Tambernack'));
    fireEvent.click(within(cardOf('Bo Tambernack').querySelector('[data-part="chips"]') as HTMLElement).getByRole('button', { name: "Карточка: Hunter's Mark" }));
    expect(await screen.findByRole('region', { name: "Hunter's Mark" })).toHaveTextContent('Заклинание');
  });

  it('планетарий: «Карточка» тела — Selûne небесным телом; Флогистон: «Карточка» сферы; событий нет', async () => {
    const { store } = mount();
    const before = store.getState().events.length;
    toLevel('system');
    fireEvent.click(screen.getByRole('img', { name: /^Планетарий Realmspace/ }).querySelector('[data-body="selune"]')!);
    fireEvent.click(within(document.querySelector('[data-part="body-info"]') as HTMLElement).getByRole('button', { name: 'Карточка' }));
    expect(await screen.findByRole('region', { name: 'Selûne' }, { timeout: 10000 })).toHaveTextContent('Небесное тело');
    toLevel('plane');
    fireEvent.click(within(document.querySelector('[data-part="sphere-info"]') as HTMLElement).getByRole('button', { name: 'Карточка' }));
    expect(await screen.findByRole('region', { name: 'Realmspace' }, { timeout: 10000 })).toHaveTextContent('Хрустальная сфера');
    expect(store.getState().events.length).toBe(before);
  }, 20000);
});

