// Напряжения на столе (Д3, ROADMAP 7.2–7.3): в «Пульсе» — панель по весу, кампания по умолчанию, «весь мир»
// переключателем; факты раскрываются ссылками; «Сделать нитью» — предложение во входящие, «Принять» — нить в мире,
// Ctrl+Z — нити нет. На карте мастера у Neverwinter — значок напряжений; у игроков — нигде (справочник не грузится).
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cardOf, down, mount, tab } from './testkit';

const openPulse = () => fireEvent.keyDown(window, { key: 'w', code: 'KeyW' });

describe('напряжения (Д3)', () => {
  it('«Пульс»: кампания — Zhentarim растёт первым, в Neverwinter — враги по вики; «весь мир» шире; факты — ссылками', async () => {
    mount();
    openPulse();
    const panel = await screen.findByRole('region', { name: 'Напряжения' });
    const list = await within(panel).findByRole('list', { name: 'Напряжения' });
    const rows = () => within(list).getAllByRole('listitem').filter(li => li.hasAttribute('data-tension'));
    const campaign = rows().length;
    expect(rows()[0]).toHaveAttribute('data-tension', 'rising:fac-zhentarim:fac-harpers');
    expect(list).toHaveTextContent("Ashmadai и Neverwinter's Rangers · Neverwinter");
    fireEvent.click(within(panel).getByRole('button', { name: /^весь мир/ }));
    expect(rows().length).toBeGreaterThan(campaign);
    fireEvent.click(within(panel).getByRole('button', { name: 'кампания' }));
    fireEvent.click(within(rows()[0]).getByRole('button', { name: /Zhentarim растёт/ }));
    const facts = within(rows()[0]).getByRole('list', { name: /^Факты/ });
    expect(facts).toHaveTextContent('Агент Zhentarim замечен у ворот Neverwinter');
    fireEvent.click(within(facts).getByRole('button', { name: 'Партию знают в Harpers: известность 5' }));
    expect(cardOf('Harpers')).toBeInTheDocument();
  });

  it('«Сделать нитью» → во входящих; «Принять» — нить в мире; Ctrl+Z — нити нет, кнопка снова «Сделать нитью»', async () => {
    const { store } = mount();
    openPulse();
    const panel = await screen.findByRole('region', { name: 'Напряжения' });
    const row = () => panel.querySelector<HTMLElement>('[data-tension="rising:fac-zhentarim:fac-harpers"]')!;
    await within(panel).findByRole('list', { name: 'Напряжения' });
    fireEvent.click(within(row()).getByRole('button', { name: 'Сделать нитью' }));
    expect(within(row()).getByRole('button', { name: 'во входящих' })).toBeDisabled();
    const d = Object.values(store.getState().state.deltas).find(x => x.patch?.kind === 'newThread')!;
    expect(d).toMatchObject({ status: 'pending', causeId: 'f-zhentarim-agent', subject: 'Нить · Zhentarim растёт, партию знают в Harpers' });
    act(() => { store.getState().accept(d.id); });
    const threadId = d.patch?.kind === 'newThread' ? d.patch.thread.id : '';
    expect(store.getState().state.world.threads[threadId]).toMatchObject({ status: 'open' });
    expect(within(row()).getByRole('button', { name: 'нить есть' })).toBeDisabled();
    act(() => { store.getState().undo(); });
    expect(store.getState().state.world.threads[threadId]).toBeUndefined();
  });

  it('карта мастера: у Neverwinter — значок напряжений с их заголовками', async () => {
    mount();
    const nw = document.querySelector<HTMLElement>('[data-pin="loc-neverwinter"]')!;
    const badge = await within(nw).findByTitle(/^Напряжения: /);
    expect(badge.title).toMatch(/Zhentarim растёт, партию знают в Harpers/);
  });

  it('сцена Neverwinter: секция «Напряжения» — вид и вес строкой, строка открывает первую сторону', async () => {
    mount();
    down();
    tab('Сейчас');
    const sec = await within(cardOf('Neverwinter')).findByRole('region', { name: 'Напряжения' });
    expect(sec).toHaveTextContent(/Zhentarim растёт, партию знают в Harpers\s*сила растёт · фактов \d/);
    expect(sec).toHaveTextContent(/Blackriver Bandits и Bloodsailors · Neverwinter\s*враги в одном месте/);
  });

  it('слой «Влияние»: по кнопке — базы фракций по вики и места напряжений; у места с пином кампании — только на пине', async () => {
    mount();
    const map = () => document.querySelector<HTMLElement>('[data-part="world-map"]')!;
    const toggle = await within(map()).findByRole('button', { name: 'Влияние' });
    expect(map().querySelector('[data-influence]')).toBeNull();
    fireEvent.click(toggle);
    const titles = [...map().querySelectorAll<HTMLElement>('[data-influence]')].map(e => e.title);
    expect(titles).toEqual(expect.arrayContaining(['Silverymoon · база: Harpers (по вики)', expect.stringMatching(/^Waterdeep · напряжения: /)]));
    // Neverwinter — пин кампании: его напряжения на пине, слой их не повторяет.
    expect(map().querySelector('[data-influence="7e243b80-8918-42fa-b60e-03cec8bdb184"]')).toBeNull();
    fireEvent.click(toggle);
    expect(map().querySelector('[data-influence]')).toBeNull();
  });

  it('игрокам: на пинах значка нет, кнопки «Влияние» нет', () => {
    mount(undefined, false);
    expect(document.querySelector('[data-part="pin-tensions"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Влияние' })).toBeNull();
  });
});
