// Знание как ресурс (Д6): тетрадь партии (N) — узнанное по сущностям с датой и кем; карточка сущности мира у мастера —
// «Узнать» на строке паспорта: проверка ниже Сл ничего не пишет, не ниже — KNOWLEDGE_REVEALED с проверкой, Ctrl+Z
// возвращает; у игроков та же карточка — только узнанное, без текстов блока и без кнопок.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedEngine } from '../../campaign';
import { memoryStore } from '../../engine';
import { fixed, mount } from './testkit';

const CAPTAIN = { ref: 'monster:bandit-captain', name: 'Bandit Captain', fact: { label: 'AC', value: '15 (studded leather)' } } as const;
const openNotebook = () => fireEvent.keyDown(window, { key: 'n', code: 'KeyN' });
const notebook = () => screen.getByRole('region', { name: 'Тетрадь партии' });

describe('знание как ресурс (Д6)', () => {
  it('тетради нет, пока партия ничего не узнала; узнала — N открывает, строка с датой и «волей мастера»', () => {
    const { store } = mount();
    openNotebook();
    expect(screen.queryByRole('region', { name: 'Тетрадь партии' })).toBeNull();
    act(() => { store.getState().revealKnowledge(CAPTAIN); });
    openNotebook();
    const entry = within(notebook()).getByRole('article', { name: 'Тетрадь: Bandit Captain' });
    expect(entry).toHaveTextContent('AC15 (studded leather)');
    expect(entry).toHaveTextContent(/Mirtul 1492 DR · волей мастера/);
  });

  it('мастер: «Узнать» на строке — ниже Сл ничего не пишет, не ниже — событие с проверкой; Ctrl+Z — снова «Узнать»', async () => {
    const { store } = mount();
    act(() => { store.getState().revealKnowledge(CAPTAIN); });
    openNotebook();
    fireEvent.click(within(notebook()).getByRole('button', { name: 'Bandit Captain' }));
    const card = await screen.findByRole('region', { name: 'Bandit Captain' }, { timeout: 10000 });
    expect(card.querySelector('[data-known="AC"]')).not.toBeNull();
    expect(within(card).queryByRole('button', { name: 'Узнать: AC' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Узнать: HP' }));
    const form = screen.getByRole('dialog', { name: 'Проверка знаний: HP' });
    // Тип блока — humanoid: История по правилу стола; Сл по умолчанию — Medium.
    expect(within(form).getByRole('combobox', { name: 'Навык' })).toHaveValue('history');
    expect(within(form).getByRole('combobox', { name: 'Сл' })).toHaveValue('15');
    expect(form).toHaveTextContent('правило стола');
    const by = (within(form).getByRole('combobox', { name: 'Кто' }) as HTMLSelectElement).value;
    const n = store.getState().events.length;
    fireEvent.change(within(form).getByRole('textbox', { name: 'Итог' }), { target: { value: '9' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Проверить' }));
    expect(within(form).getByRole('status')).toHaveTextContent('Не вышло: 9 против Сл 15 — факт не открыт');
    expect(store.getState().events.length).toBe(n);
    fireEvent.change(within(form).getByRole('textbox', { name: 'Итог' }), { target: { value: '18' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Проверить' }));
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'KNOWLEDGE_REVEALED', payload: { ref: CAPTAIN.ref, fact: { label: 'HP' }, by, check: { skill: 'history', dc: 15, total: 18 } } });
    expect(screen.queryByRole('dialog', { name: 'Проверка знаний: HP' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Bandit Captain' }).querySelector('[data-known="HP"]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(within(screen.getByRole('region', { name: 'Bandit Captain' })).getByRole('button', { name: 'Узнать: HP' })).toBeInTheDocument();
  });

  it('игроки: карточка — только узнанное; ни текстов блока, ни подзаголовка с CR, ни кнопок «Узнать»', async () => {
    const store = seedEngine({ persist: memoryStore(), ...fixed() });
    store.getState().revealKnowledge(CAPTAIN);
    mount(store, false);
    openNotebook();
    fireEvent.click(within(notebook()).getByRole('button', { name: 'Bandit Captain' }));
    const card = await screen.findByRole('region', { name: 'Bandit Captain' }, { timeout: 10000 });
    const facts = card.querySelector('[data-part="facts"]')!;
    expect([...facts.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['AC']);
    expect(card).not.toHaveTextContent('CR ');
    expect(card).not.toHaveTextContent('Multiattack');
    expect(within(card).queryByRole('button', { name: /^Узнать/ })).toBeNull();
  });

  it('голоса навыков (Д13): у мастера — кто знает без броска; «пассивно» ставит итог 10 + навык; у игроков строки нет', async () => {
    const { store } = mount();
    act(() => { store.getState().revealKnowledge(CAPTAIN); });
    openNotebook();
    fireEvent.click(within(notebook()).getByRole('button', { name: 'Bandit Captain' }));
    const card = await screen.findByRole('region', { name: 'Bandit Captain' }, { timeout: 10000 });
    const voices = card.querySelector('[data-part="skill-voices"]')!;
    expect(voices).not.toBeNull();
    expect(voices.textContent).toMatch(/История против Сл 15|никто: лучший — .+, История \d+ против Сл 15/);
    fireEvent.click(within(card).getByRole('button', { name: 'Узнать: HP' }));
    const form = screen.getByRole('dialog', { name: 'Проверка знаний: HP' });
    const passive = within(form).getByRole('button', { name: /^пассивно \d+$/ });
    fireEvent.click(passive);
    expect(within(form).getByRole('textbox', { name: 'Итог' })).toHaveValue(passive.textContent!.replace('пассивно ', ''));
  });
});

