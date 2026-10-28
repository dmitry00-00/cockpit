// Общая карточка по ссылке (ROADMAP 0.3): умение, черта, заклинание с листа открываются одной карточкой с
// источником; связи в ней открывают следующие карточки; щелчок по персонажу партии возвращает его карточку.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, rowOf } from './testkit';

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
