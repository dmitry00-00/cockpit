// JournalEntry: сетка 72 | 16 | 1fr, время в три строки (реальное — только если передано), текст из частей
// с @упоминаниями и #нитями (кнопки только при колбэках), метки происхождения и секрета после текста,
// секрет приглушён, погасшая — line-through, компенсация — t2; journalText для aria-label.
// JournalCascade: role=list с левой линией src-sim, стрелки между шагами, иконка по виду шага, пустой не рисуется.
// JournalReminder: group «Напоминание» с глазом и двумя кнопками.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CascadeStep, JournalPart } from '../engine';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { CASCADE_ICON, ENTRY_ORIGIN, JournalCascade, JournalEntry, JournalReminder, journalText } from './JournalEntry';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const PARTS: JournalPart[] = [
  { kind: 'text', text: 'Партия прибыла в ' },
  { kind: 'mention', entity: 'location', id: 'neverwinter', name: 'Neverwinter' },
  { kind: 'text', text: ' через Triboar Trail ' },
  { kind: 'thread', id: 'caravan', name: 'The Missing Caravan' },
];
const TEXT = 'Партия прибыла в Neverwinter через Triboar Trail #The Missing Caravan';

const base = {
  id: 'e1',
  worldDate: '15 Mirtul',
  worldTime: '07:40',
  icon: 'map' as const,
  iconTitle: 'Переход',
  parts: PARTS,
};

const entry = () => screen.getByRole('article', { name: TEXT });

describe('journalText', () => {
  it('упоминание — имя без собаки, нить — «#Имя», текст как есть', () => {
    expect(journalText(PARTS)).toBe(TEXT);
    expect(journalText([])).toBe('');
    expect(journalText([{ kind: 'mention', entity: 'actor', id: 'bo', name: 'Bo' }, { kind: 'text', text: ': крит' }])).toBe('Bo: крит');
  });
});

describe('JournalEntry', () => {
  it('article с aria-label = текст записи, data-entry, сетка 72|16|1fr и нижний шов; время в три строки type-key t3', () => {
    render(<JournalEntry {...base} wallTime="19:12" />);
    const a = entry();
    expect(a.tagName).toBe('ARTICLE');
    expect(a).toHaveAttribute('data-entry', 'e1');
    expect(a).not.toHaveAttribute('data-secret');
    expect(a).not.toHaveAttribute('data-undone');
    expect(a).toHaveClass('grid', 'grid-cols-[72px_16px_1fr]', 'gap-2', 'py-1.5');
    expect(a.className).toContain('inset_0_-1px_0_var(--lo)');
    const time = a.querySelector('[data-part="time"]') as HTMLElement;
    expect(time).toHaveClass('type-key', 'text-t3');
    expect(Array.from(time.querySelectorAll('span')).map(s => s.textContent)).toEqual(['15 Mirtul', '07:40', '19:12']);
    const icon = within(a).getByRole('img', { name: 'Переход' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS.map).filter(Boolean));
    expect(a.textContent).not.toMatch(EMOJI);
  });

  it('без wallTime третьей строки нет — у записей сида реального времени не бывает', () => {
    render(<JournalEntry {...base} />);
    const time = entry().querySelector('[data-part="time"]') as HTMLElement;
    expect(time.querySelectorAll('span')).toHaveLength(2);
    expect(time.querySelector('[data-part="wall"]')).toBeNull();
  });

  it('без колбэков упоминание и нить — span, не кнопки: «@Neverwinter» жирным с гранью t4, «#The Missing Caravan» цветом src-canon', () => {
    render(<JournalEntry {...base} />);
    const a = entry();
    expect(within(a).queryAllByRole('button')).toHaveLength(0);
    const mention = within(a).getByText('@Neverwinter');
    expect(mention.tagName).toBe('SPAN');
    expect(mention).toHaveClass('type-body-bold', 'text-tx');
    expect(mention.className).toContain('inset_0_-1px_0_var(--t4)');
    // t4 — грань-подчёркивание, не текст.
    expect(mention.className).not.toMatch(/text-t4/);
    const thread = within(a).getByText('#The Missing Caravan');
    expect(thread.tagName).toBe('SPAN');
    expect(thread).toHaveClass('text-src-canon');
    expect(a.querySelector('[data-part="body"]')).toHaveClass('type-body', 'text-tx');
    // Видимый текст несёт собаку, journalText — нет: aria-label читается как имя, а не как «собака Neverwinter».
    expect(a.querySelector('[data-part="body"]')).toHaveTextContent('Партия прибыла в @Neverwinter через Triboar Trail #The Missing Caravan');
  });

  it('с колбэками — кнопки «Открыть карточку: Имя» и «Нить: Имя»; клик отдаёт сущность и id', () => {
    const onMention = vi.fn();
    const onThread = vi.fn();
    render(<JournalEntry {...base} onMention={onMention} onThread={onThread} />);
    const a = entry();
    const m = within(a).getByRole('button', { name: 'Открыть карточку: Neverwinter' });
    expect(m).toHaveAttribute('type', 'button');
    expect(m).toHaveTextContent('@Neverwinter');
    expect(m).toHaveClass('type-body-bold', 'text-tx', 'hover:text-gd-hi');
    expect(m.className).toContain('inset_0_-1px_0_var(--t4)');
    expect(m.className).toContain('hover:shadow-[inset_0_-1px_0_var(--gd)]');
    fireEvent.click(m);
    expect(onMention).toHaveBeenCalledWith('location', 'neverwinter');
    const t = within(a).getByRole('button', { name: 'Нить: The Missing Caravan' });
    expect(t).toHaveTextContent('#The Missing Caravan');
    expect(t).toHaveClass('text-src-canon');
    fireEvent.click(t);
    expect(onThread).toHaveBeenCalledWith('caravan');
    expect(within(a).getAllByRole('button')).toHaveLength(2);
  });

  it('только один колбэк — кнопка только у него', () => {
    render(<JournalEntry {...base} onThread={() => {}} />);
    expect(within(entry()).getAllByRole('button')).toHaveLength(1);
    expect(within(entry()).getByText('@Neverwinter').tagName).toBe('SPAN');
  });

  it('origin: метка после текста иконкой src-* своим цветом — dm «Рука мастера», sim «Симуляция», players «Известно игрокам»', () => {
    const { rerender } = render(<JournalEntry {...base} origin="dm" />);
    const marks = () => entry().querySelector('[data-part="marks"]') as HTMLElement;
    let mark = within(marks()).getByRole('img', { name: 'Рука мастера' });
    expect(pathsOf(mark)).toEqual(tonePaths(ICONS['src-dm']).filter(Boolean));
    expect(mark.querySelector('path[fill*="--src-dm"]')).not.toBeNull();
    rerender(<JournalEntry {...base} origin="sim" />);
    mark = within(marks()).getByRole('img', { name: 'Симуляция' });
    expect(mark.querySelector('path[fill*="--src-sim"]')).not.toBeNull();
    rerender(<JournalEntry {...base} origin="players" />);
    mark = within(marks()).getByRole('img', { name: 'Известно игрокам' });
    expect(mark.querySelector('path[fill*="--src-players"]')).not.toBeNull();
    expect(Object.keys(ENTRY_ORIGIN)).toEqual(['dm', 'sim', 'players']);
    // Метки стоят после текста, а не перед ним.
    const body = entry().querySelector('[data-part="body"]') as HTMLElement;
    expect(body.lastElementChild).toHaveAttribute('data-part', 'marks');
  });

  it('без origin и секрета блока меток нет вовсе', () => {
    render(<JournalEntry {...base} />);
    expect(entry().querySelector('[data-part="marks"]')).toBeNull();
    expect(within(entry()).queryByRole('img', { name: 'Скрыто от игроков' })).toBeNull();
  });

  it('секрет: data-secret, текст приглушён op-hidden-from-players, метка hidden цветом src-players стоит вне приглушённого куска', () => {
    render(<JournalEntry {...base} secret origin="dm" />);
    const a = entry();
    expect(a).toHaveAttribute('data-secret', 'true');
    const text = a.querySelector('[data-part="text"]') as HTMLElement;
    expect(text).toHaveClass('opacity-(--op-hidden-from-players)');
    const eye = within(a).getByRole('img', { name: 'Скрыто от игроков' });
    expect(eye.querySelector('path[fill*="--src-players"]')).not.toBeNull();
    expect(pathsOf(eye)).toEqual(tonePaths(ICONS.hidden).filter(Boolean));
    expect(text.contains(eye)).toBe(false);
    // Порядок меток: сначала «скрыто», потом происхождение.
    const marks = a.querySelector('[data-part="marks"]') as HTMLElement;
    expect(Array.from(marks.querySelectorAll('svg')).map(s => s.querySelector('title')?.textContent)).toEqual(['Скрыто от игроков', 'Рука мастера']);
  });

  it('отменённая: data-undone, line-through и t3 на тексте и на кнопках внутри (inline-block не наследует зачёркивание)', () => {
    render(<JournalEntry {...base} undone onMention={() => {}} onThread={() => {}} />);
    const a = entry();
    expect(a).toHaveAttribute('data-undone', 'true');
    expect(a.querySelector('[data-part="body"]')).toHaveClass('line-through', 'text-t3');
    expect(within(a).getByRole('button', { name: 'Открыть карточку: Neverwinter' })).toHaveClass('line-through', 'text-t3');
    expect(within(a).getByRole('button', { name: 'Нить: The Missing Caravan' })).toHaveClass('line-through', 'text-t3');
    expect(within(a).getByRole('button', { name: 'Нить: The Missing Caravan' })).not.toHaveClass('text-src-canon');
  });

  it('компенсация: текст t2 без зачёркивания, data-compensation', () => {
    render(<JournalEntry {...base} compensation="undo" />);
    const body = entry().querySelector('[data-part="body"]') as HTMLElement;
    expect(body).toHaveClass('text-t2');
    expect(body).not.toHaveClass('line-through');
    expect(entry()).toHaveAttribute('data-compensation', 'undo');
  });

  it('iconColor по умолчанию t2, переданный — как есть; className уходит на article', () => {
    const { rerender } = render(<JournalEntry {...base} className="mt-2" />);
    expect(within(entry()).getByRole('img', { name: 'Переход' }).querySelector('path[fill*="--t2"]')).not.toBeNull();
    expect(entry()).toHaveClass('mt-2');
    rerender(<JournalEntry {...base} icon="attack" iconTitle="Атака" iconColor="var(--ab-str-hi)" />);
    expect(within(entry()).getByRole('img', { name: 'Атака' }).querySelector('path[fill*="--ab-str-hi"]')).not.toBeNull();
  });

  it('сторож: нет эмодзи, hex и rounded в классах; у каждой иконки title; t4 в классах — только грань, не текст', () => {
    const { container } = render(<JournalEntry {...base} secret origin="sim" wallTime="19:12" onMention={() => {}} onThread={() => {}} />);
    expect(container.innerHTML).not.toMatch(EMOJI);
    for (const el of [entry(), ...entry().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
    }
    for (const icon of entry().querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});

const STEPS: CascadeStep[] = [
  { kind: 'fact', id: 'f1', label: 'Полнолуние' },
  { kind: 'delta', id: 'd1', label: 'Ликантропы ×2 в Neverwinter Wood' },
  { kind: 'entry', id: 'e9', label: 'Слух в таверне у Old Owl Well' },
];

describe('JournalCascade', () => {
  it('role=list «Каскад» с левой линией src-sim и отступом 104px; шаги — listitem с иконкой по виду и подписью type-body-sm tx; стрелки только между шагами', () => {
    render(<JournalCascade steps={STEPS} />);
    const list = screen.getByRole('list', { name: 'Каскад' });
    expect(list.className).toContain('inset_2px_0_0_var(--src-sim)');
    expect(list).toHaveClass('ml-26');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map(i => i.getAttribute('data-kind'))).toEqual(['fact', 'delta', 'entry']);
    expect(items.map(i => i.textContent)).toEqual(['ФактПолнолуние', 'ПредложениеЛикантропы ×2 в Neverwinter Wood', 'ЗаписьСлух в таверне у Old Owl Well']);
    for (const i of items) expect(i).toHaveClass('type-body-sm', 'text-tx');
    const arrows = Array.from(list.querySelectorAll('[data-part="arrow"]'));
    expect(arrows).toHaveLength(2);
    for (const a of arrows) {
      expect(a).toHaveTextContent('→');
      expect(a).toHaveAttribute('aria-hidden', 'true');
      expect(a).toHaveClass('text-t3');
    }
    // Порядок: шаг, стрелка, шаг, стрелка, шаг.
    expect(Array.from(list.children).map(c => c.getAttribute('data-part') ?? c.getAttribute('data-kind'))).toEqual(['fact', 'arrow', 'delta', 'arrow', 'entry']);
    expect(list.textContent).not.toMatch(EMOJI);
  });

  it('иконка по виду: fact → note, thread → threads, delta → src-sim (цветом src-sim), entry → journal; title — Факт/Нить/Предложение/Запись', () => {
    render(<JournalCascade steps={[...STEPS, { kind: 'thread', id: 't1', label: 'Луна и стая' }]} />);
    expect(CASCADE_ICON).toEqual({ fact: 'note', thread: 'threads', delta: 'src-sim', entry: 'journal' });
    const list = screen.getByRole('list', { name: 'Каскад' });
    const icon = (name: string) => within(list).getByRole('img', { name });
    expect(pathsOf(icon('Факт'))).toEqual(tonePaths(ICONS.note).filter(Boolean));
    expect(pathsOf(icon('Нить'))).toEqual(tonePaths(ICONS.threads).filter(Boolean));
    expect(pathsOf(icon('Предложение'))).toEqual(tonePaths(ICONS['src-sim']).filter(Boolean));
    expect(pathsOf(icon('Запись'))).toEqual(tonePaths(ICONS.journal).filter(Boolean));
    expect(icon('Предложение').querySelector('path[fill*="--src-sim"]')).not.toBeNull();
    expect(icon('Нить').querySelector('path[fill*="--src-canon"]')).not.toBeNull();
    for (const svg of list.querySelectorAll('svg')) expect(svg.querySelector('title')?.textContent).toBeTruthy();
  });

  it('один шаг — без стрелок; пустой каскад не рисуется вовсе', () => {
    const { rerender } = render(<JournalCascade steps={STEPS.slice(0, 1)} />);
    expect(screen.getByRole('list', { name: 'Каскад' }).querySelectorAll('[data-part="arrow"]')).toHaveLength(0);
    rerender(<JournalCascade steps={[]} />);
    expect(screen.queryByRole('list', { name: 'Каскад' })).toBeNull();
  });
});

describe('JournalReminder', () => {
  it('group «Напоминание»: плита cd с фаской и отступом как у каскада, глаз src-players, текст type-body-sm tx, кнопки «Раскрыть» (золото) и «Позже»', () => {
    const onReveal = vi.fn();
    const onLater = vi.fn();
    render(<JournalReminder text="Партия в двух гексах от лагеря Zhentarim — напомнить об агенте?" onReveal={onReveal} onLater={onLater} />);
    const g = screen.getByRole('group', { name: 'Напоминание' });
    expect(g).toHaveClass('bg-cd', 'shadow-bevel', 'ml-26');
    const eye = within(g).getByRole('img', { name: 'Скрыто от игроков' });
    expect(eye.querySelector('path[fill*="--src-players"]')).not.toBeNull();
    expect(within(g).getByText(/напомнить об агенте/)).toHaveClass('type-body-sm', 'text-tx');
    const reveal = within(g).getByRole('button', { name: 'Раскрыть' });
    expect(reveal).toHaveAttribute('title', 'Открыть игрокам: FACT_REVEALED');
    expect(reveal).toHaveClass('type-num-12', 'uppercase', 'bg-cd', 'shadow-bevel', 'text-gd-hi');
    const later = within(g).getByRole('button', { name: 'Позже' });
    expect(later).toHaveAttribute('title', 'Напомнить позже');
    expect(later).toHaveClass('text-t2');
    expect(within(g).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(reveal);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onLater).not.toHaveBeenCalled();
    fireEvent.click(later);
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(g.textContent).not.toMatch(EMOJI);
    for (const el of [g, ...g.querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });
});
