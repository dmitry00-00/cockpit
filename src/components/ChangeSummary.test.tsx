// ChangeSummary: region «Что изменилось» — группы по уровням: шапка-плита pl→cd с иконкой scale-*, подписью
// type-h-15 uppercase t2 и счётчиком type-key; развёрнутая — список строк «предмет · было → стало» (как
// в WorldDelta) с «Принять»/«Отклонить» только при колбэках; свёрнутая — только шапка и «Принять пачкой»,
// если передан onAcceptAll; без групп — emptyText в утопленной рамке, без него — ничего.
// summaryGroups — проекция дельт: порядок лестницы, collapsed по near, пустые уровни не рисуются.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScaleLevel, WorldDelta } from '../engine';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { ChangeSummary, summaryGroups, type ChangeSummaryGroup } from './ChangeSummary';
import { SCALE_LABELS } from './ThreadFilter';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const delta = (id: string, scale: ScaleLevel, subject: string, was: string, now: string, cause: string): WorldDelta => ({
  id, scale, subject, was, now, cause, causeId: `f-${id}`, status: 'pending',
});

/* Дельты нарочно вперемешку по уровням: проекция обязана выстроить их по лестнице. */
const DELTAS: readonly WorldDelta[] = [
  delta('d3', 'settlement', 'Цены на железо и оружие', 'базовые', '+10%', 'тот же пропавший караван'),
  delta('d1', 'region', 'Zhentarim · влияние на Triboar Trail', '2', '3', 'караван всё ещё не найден'),
  delta('d5', 'planet', 'Selûne', 'растёт', 'полная', 'календарь'),
  delta('d4', 'settlement', 'Слух в таверне', 'нет', 'мертвецы у Old Owl Well', 'полнолуние'),
  delta('d2', 'region', 'Neverwinter Wood · ликантропы в таблице встреч', '×1', '×2', 'полнолуние Selûne'),
];

const labelOf = (s: ScaleLevel) => `${SCALE_LABELS[s]} · X`;

const GROUPS: readonly ChangeSummaryGroup[] = [
  {
    id: 'region', scale: 'region', label: 'Регион · Sword Coast North', collapsed: false,
    items: [
      { id: 'd1', subject: 'Zhentarim · влияние на Triboar Trail', was: '2', now: '3', why: 'караван всё ещё не найден' },
      { id: 'd2', subject: 'Neverwinter Wood · ликантропы в таблице встреч', was: '×1', now: '×2' },
    ],
  },
  {
    id: 'settlement', scale: 'settlement', label: 'Поселение · Neverwinter', collapsed: false,
    items: [{ id: 'd3', subject: 'Цены на железо и оружие', was: 'базовые', now: '+10%', why: 'тот же пропавший караван' }],
  },
  {
    id: 'planet', scale: 'planet', label: 'Планета · Toril', collapsed: true,
    items: [{ id: 'd5', subject: 'Selûne', was: 'растёт', now: 'полная' }],
  },
];

const region = () => screen.getByRole('region', { name: 'Что изменилось' });
const group = (label: string) => screen.getByRole('group', { name: label });
const groups = () => within(region()).getAllByRole('group');

describe('summaryGroups', () => {
  it('группы по уровню в порядке лестницы, только непустые, id = уровень; collapsed = уровень не в near; строки — id, предмет, было, стало, why = причина', () => {
    const out = summaryGroups(DELTAS, labelOf, ['region', 'settlement']);
    expect(out.map(g => g.id)).toEqual(['planet', 'region', 'settlement']);
    expect(out.map(g => g.scale)).toEqual(['planet', 'region', 'settlement']);
    expect(out.map(g => g.label)).toEqual(['Планета · X', 'Регион · X', 'Поселение · X']);
    expect(out.map(g => g.collapsed)).toEqual([true, false, false]);
    expect(out[1].items).toEqual([
      { id: 'd1', subject: 'Zhentarim · влияние на Triboar Trail', was: '2', now: '3', why: 'караван всё ещё не найден' },
      { id: 'd2', subject: 'Neverwinter Wood · ликантропы в таблице встреч', was: '×1', now: '×2', why: 'полнолуние Selûne' },
    ]);
    expect(out[2].items.map(i => i.id)).toEqual(['d3', 'd4']);
    // Колбэков в проекции нет — их добавляет страница.
    for (const g of out) for (const it of g.items) expect(Object.keys(it)).toEqual(['id', 'subject', 'was', 'now', 'why']);
  });

  it('пустые уровни не рисуются; пустой near сворачивает всё; без дельт — пусто', () => {
    expect(summaryGroups(DELTAS, labelOf, []).every(g => g.collapsed)).toBe(true);
    expect(summaryGroups(DELTAS, labelOf, ['cosmology', 'battle']).every(g => g.collapsed)).toBe(true);
    expect(summaryGroups(DELTAS, labelOf, ['planet']).map(g => g.collapsed)).toEqual([false, true, true]);
    expect(summaryGroups([], labelOf, ['region'])).toEqual([]);
    expect(summaryGroups([DELTAS[2]], labelOf, ['planet'])).toEqual([
      { id: 'planet', scale: 'planet', label: 'Планета · X', collapsed: false, items: [{ id: 'd5', subject: 'Selûne', was: 'растёт', now: 'полная', why: 'календарь' }] },
    ]);
  });
});

describe('ChangeSummary', () => {
  it('region «Что изменилось»; группы по порядку пропсов, у каждой шапка-плита pl→cd с иконкой scale-* 16, подписью type-h-15 uppercase t2 и счётчиком type-key', () => {
    render(<ChangeSummary groups={GROUPS} />);
    expect(region()).toBeInTheDocument();
    expect(groups().map(g => g.getAttribute('aria-label'))).toEqual(['Регион · Sword Coast North', 'Поселение · Neverwinter', 'Планета · Toril']);
    const g = group('Регион · Sword Coast North');
    expect(g).toHaveAttribute('data-group', 'region');
    expect(g).toHaveAttribute('data-scale', 'region');
    expect(g).not.toHaveAttribute('data-collapsed');
    expect(g).toHaveClass('bg-cd', 'shadow-bevel');
    const head = g.querySelector('[data-part="head"]') as HTMLElement;
    expect(head).toHaveClass('from-pl', 'to-cd', 'shadow-plate');
    const icon = within(head).getByRole('img', { name: 'Регион' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['scale-region']).filter(Boolean));
    const label = within(head).getByText('Регион · Sword Coast North', { selector: 'span' });
    expect(label).toHaveClass('type-h-15', 'uppercase', 'text-t2', 'truncate');
    expect(label).toHaveAttribute('title', 'Регион · Sword Coast North');
    const count = head.querySelector('[data-part="count"]') as HTMLElement;
    expect(count).toHaveTextContent('2');
    expect(count).toHaveClass('type-key', 'text-t2');
    expect((group('Планета · Toril').querySelector('[data-part="count"]') as HTMLElement).textContent).toBe('1');
    expect(within(group('Планета · Toril')).getByRole('img', { name: 'Планета' })).toBeInTheDocument();
  });

  it('развёрнутая группа — список строк: предмет type-body-sm tx truncate с title = why (или предмет), «было» t3 зачёркнутое → «стало» type-num-15 gd-hi; без колбэков кнопок нет', () => {
    render(<ChangeSummary groups={GROUPS} />);
    const list = within(group('Регион · Sword Coast North')).getByRole('list', { name: 'Изменения: Регион · Sword Coast North' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.getAttribute('data-item'))).toEqual(['d1', 'd2']);
    const subject = rows[0].querySelector('[data-part="subject"]') as HTMLElement;
    expect(subject).toHaveTextContent('Zhentarim · влияние на Triboar Trail');
    expect(subject).toHaveClass('type-body-sm', 'text-tx', 'truncate');
    expect(subject).toHaveAttribute('title', 'караван всё ещё не найден');
    expect(rows[1].querySelector('[data-part="subject"]')).toHaveAttribute('title', 'Neverwinter Wood · ликантропы в таблице встреч');
    const was = rows[0].querySelector('[data-part="was"]') as HTMLElement;
    expect(was).toHaveTextContent('2');
    expect(was).toHaveClass('type-body-sm', 'text-t3', 'line-through');
    const arrow = within(rows[0].querySelector('[data-part="change"]') as HTMLElement).getByText('→');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
    expect(arrow).toHaveClass('text-t3');
    const now = rows[0].querySelector('[data-part="now"]') as HTMLElement;
    expect(now).toHaveTextContent('3');
    expect(now).toHaveClass('type-num-15', 'text-gd-hi');
    expect(now).not.toHaveClass('line-through');
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    expect(rows[0].querySelector('[data-part="actions"]')).toBeNull();
  });

  it('свёрнутая группа — только шапка: ни списка, ни строк; «Принять пачкой» только при onAcceptAll и только у свёрнутых; клик отдаёт id группы', () => {
    const onAcceptAll = vi.fn();
    const { rerender } = render(<ChangeSummary groups={GROUPS} />);
    const planet = () => group('Планета · Toril');
    expect(planet()).toHaveAttribute('data-collapsed', 'true');
    expect(within(planet()).queryByRole('list')).toBeNull();
    expect(within(planet()).queryAllByRole('listitem')).toHaveLength(0);
    expect(planet().textContent).not.toContain('Selûne');
    expect(screen.queryByRole('button', { name: 'Принять пачкой' })).toBeNull();
    rerender(<ChangeSummary groups={GROUPS} onAcceptAll={onAcceptAll} />);
    const all = screen.getAllByRole('button', { name: 'Принять пачкой' });
    expect(all).toHaveLength(1);
    expect(planet().contains(all[0])).toBe(true);
    expect(all[0]).toHaveAttribute('title', 'Принять все изменения этого уровня одной кнопкой');
    expect(all[0]).toHaveClass('type-num-12', 'uppercase', 'bg-cd', 'shadow-bevel', 'text-gd-hi');
    expect(within(group('Регион · Sword Coast North')).queryByRole('button', { name: 'Принять пачкой' })).toBeNull();
    fireEvent.click(all[0]);
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
    expect(onAcceptAll).toHaveBeenLastCalledWith('planet');
    expect(within(planet()).queryByRole('list')).toBeNull();
  });

  it('кнопки строки только при колбэках: «Принять» (золото) при onAccept, «Отклонить» при onReject, по отдельности и вместе; клик зовёт свой колбэк', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const g: ChangeSummaryGroup = {
      id: 'settlement', scale: 'settlement', label: 'Поселение · Neverwinter', collapsed: false,
      items: [
        { id: 'a', subject: 'Оба', was: '1', now: '2', onAccept, onReject },
        { id: 'b', subject: 'Только принять', was: '1', now: '2', onAccept },
        { id: 'c', subject: 'Только отклонить', was: '1', now: '2', onReject },
        { id: 'd', subject: 'Ничего', was: '1', now: '2' },
      ],
    };
    render(<ChangeSummary groups={[g]} onAcceptAll={() => {}} />);
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    const names = (r: HTMLElement) => within(r).queryAllByRole('button').map(b => b.textContent);
    expect(names(rows[0])).toEqual(['Принять', 'Отклонить']);
    expect(names(rows[1])).toEqual(['Принять']);
    expect(names(rows[2])).toEqual(['Отклонить']);
    expect(names(rows[3])).toEqual([]);
    expect(rows[3].querySelector('[data-part="actions"]')).toBeNull();
    const accept = within(rows[0]).getByRole('button', { name: 'Принять' });
    expect(accept).toHaveAttribute('title', 'Принять');
    expect(accept).toHaveClass('text-gd-hi', 'type-num-12', 'uppercase', 'bg-cd', 'shadow-bevel');
    const reject = within(rows[0]).getByRole('button', { name: 'Отклонить' });
    expect(reject).toHaveAttribute('title', 'Отклонить');
    expect(reject).toHaveClass('text-t2');
    fireEvent.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
    fireEvent.click(reject);
    expect(onReject).toHaveBeenCalledTimes(1);
    // Развёрнутая группа «пачкой» не принимается, даже с onAcceptAll.
    expect(screen.queryByRole('button', { name: 'Принять пачкой' })).toBeNull();
  });

  it('без групп — одна строка emptyText type-body-sm t2 в утопленной пунктирной рамке, групп нет; без emptyText — секция не рисуется вовсе', () => {
    const { rerender, container } = render(<ChangeSummary groups={[]} emptyText="Сводка появится после шага времени" />);
    expect(region()).toBeInTheDocument();
    expect(within(region()).queryAllByRole('group')).toHaveLength(0);
    const empty = region().querySelector('[data-part="empty"]') as HTMLElement;
    expect(empty).toHaveTextContent('Сводка появится после шага времени');
    expect(empty).toHaveClass('type-body-sm', 'text-t2', 'shadow-bevel-in');
    rerender(<ChangeSummary groups={GROUPS} emptyText="Сводка появится после шага времени" />);
    expect(region().querySelector('[data-part="empty"]')).toBeNull();
    expect(groups()).toHaveLength(3);
    rerender(<ChangeSummary groups={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('сторож: нет эмодзи, hex, rounded, text-t4; t3 только у «было» и стрелки на карточке cd — на плите шапки его нет; у кнопок title, у иконок title; className уходит на корень', () => {
    const { container } = render(<ChangeSummary groups={GROUPS} onAcceptAll={() => {}} className="mt-2" />);
    expect(region()).toHaveClass('mt-2');
    expect(container.innerHTML).not.toMatch(EMOJI);
    const t3 = [] as string[];
    for (const el of [region(), ...region().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
      if (/(^|\s)text-t3(\s|$)/.test(cls)) t3.push(el.getAttribute('data-part') ?? el.tagName);
    }
    // Три развёрнутые строки → «было» и стрелка в каждой, ничего больше.
    expect(t3).toEqual(['was', 'SPAN', 'was', 'SPAN', 'was', 'SPAN']);
    for (const head of region().querySelectorAll('[data-part="head"]')) {
      for (const el of [head, ...head.querySelectorAll('*')]) expect(el.getAttribute('class') ?? '').not.toMatch(/(^|\s)text-t3(\s|$)/);
    }
    for (const b of within(region()).getAllByRole('button')) expect(b.getAttribute('title')).toBeTruthy();
    for (const icon of region().querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});
