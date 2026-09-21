// WorldDelta: article «Предложение: предмет» на плите cd с бирюзовой гранью src-sim; шапка — иконка масштаба
// с подписью и метка «Симуляция · ждёт решения»; предмет type-h-17; «было» t3 зачёркнутое → «стало»
// type-num-15 gd-hi; причина — текст или кнопка, раскрывающая цепочку (единственное собственное состояние);
// «Переброс» только при onReroll и variants > 1, «Править» только при onEdit; конфликт с каноном — строка
// st-conflict и пара «Принять изменение / Оставить канон»; worldDeltaProps из дельты состояния.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorldDelta as WorldDeltaState } from '../engine';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { WorldDelta, worldDeltaProps, type WorldDeltaProps } from './WorldDelta';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const base: WorldDeltaProps = {
  id: 'd1',
  scale: 'region',
  subject: 'Zhentarim · Triboar Trail',
  was: 'влияние 2',
  now: 'влияние 3',
  cause: 'караван всё ещё не найден',
  onAccept: () => {},
  onReject: () => {},
};

const delta = () => screen.getByRole('article', { name: 'Предложение: Zhentarim · Triboar Trail' });
const buttons = () => within(delta().querySelector('[data-part="actions"]') as HTMLElement).getAllByRole('button').map(b => b.textContent);

describe('worldDeltaProps', () => {
  it('берёт из дельты состояния id, масштаб, предмет, было/стало, причину и число вариантов; без вариантов — undefined', () => {
    const d: WorldDeltaState = {
      id: 'd1', scale: 'settlement', subject: 'Цены: железо и оружие', was: 'базовые', now: '+10%', cause: 'тот же пропавший караван',
      causeId: 'f1', status: 'pending',
      variants: [{ id: 'v1', now: '+10%', cause: 'караван' }, { id: 'v2', now: '+5%', cause: 'слух' }, { id: 'v3', now: '+15%', cause: 'налёт' }],
      variantId: 'v1',
    };
    expect(worldDeltaProps(d)).toEqual({
      id: 'd1', scale: 'settlement', subject: 'Цены: железо и оружие', was: 'базовые', now: '+10%', cause: 'тот же пропавший караван', variants: 3,
    });
    expect(worldDeltaProps({ ...d, variants: undefined }).variants).toBeUndefined();
    // Ни статуса, ни causeId в пропсах нет: карточка показывает только ждущие решения, каскад строит журнал.
    expect(Object.keys(worldDeltaProps(d))).toEqual(['id', 'scale', 'subject', 'was', 'now', 'cause', 'variants']);
  });
});

describe('WorldDelta', () => {
  it('article с data-delta на плите cd с гранью src-sim; шапка — scale-region 16 с подписью «Регион» и метка src-sim «Симуляция · ждёт решения»', () => {
    render(<WorldDelta {...base} />);
    const a = delta();
    expect(a.tagName).toBe('ARTICLE');
    expect(a).toHaveAttribute('data-delta', 'd1');
    expect(a).not.toHaveAttribute('data-conflict');
    expect(a).toHaveClass('bg-cd', 'p-2', 'pl-2.5', 'gap-1');
    expect(a.className).toContain('shadow-[var(--bevel),inset_3px_0_0_var(--src-sim)]');
    const head = a.querySelector('[data-part="head"]') as HTMLElement;
    const scale = within(head).getByRole('img', { name: 'Регион' });
    expect(scale).toHaveAttribute('width', '16');
    expect(pathsOf(scale)).toEqual(tonePaths(ICONS['scale-region']).filter(Boolean));
    expect(within(head).getByText('Регион', { selector: 'span' })).toHaveClass('type-body-sm', 'text-t2');
    const sim = within(head).getByRole('img', { name: 'Симуляция · ждёт решения' });
    expect(sim.querySelector('path[fill*="--src-sim"]')).not.toBeNull();
    expect(pathsOf(sim)).toEqual(tonePaths(ICONS['src-sim']).filter(Boolean));
    expect(a.textContent).not.toMatch(EMOJI);
  });

  it('предмет type-h-17 tx; «было» type-body-sm t3 зачёркнутое, стрелка t3 скрыта от ассистивной технологии, «стало» type-num-15 gd-hi', () => {
    render(<WorldDelta {...base} />);
    const a = delta();
    const subject = a.querySelector('[data-part="subject"]') as HTMLElement;
    expect(subject).toHaveTextContent('Zhentarim · Triboar Trail');
    expect(subject).toHaveClass('type-h-17', 'text-tx', 'truncate');
    expect(subject).toHaveAttribute('title', 'Zhentarim · Triboar Trail');
    const was = a.querySelector('[data-part="was"]') as HTMLElement;
    expect(was).toHaveTextContent('влияние 2');
    expect(was).toHaveClass('type-body-sm', 'text-t3', 'line-through');
    const now = a.querySelector('[data-part="now"]') as HTMLElement;
    expect(now).toHaveTextContent('влияние 3');
    expect(now).toHaveClass('type-num-15', 'text-gd-hi');
    expect(now).not.toHaveClass('line-through');
    const arrow = within(a.querySelector('[data-part="change"]') as HTMLElement).getByText('→');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
    expect(arrow).toHaveClass('text-t3');
  });

  it('без цепочки причина — текст t2, не кнопка; без onEdit и onReroll — только «Принять» (золото, title «Принять · Enter») и «Отклонить»', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<WorldDelta {...base} onAccept={onAccept} onReject={onReject} />);
    const a = delta();
    const cause = a.querySelector('[data-part="cause"]') as HTMLElement;
    expect(cause.tagName).toBe('DIV');
    expect(cause).toHaveTextContent('караван всё ещё не найден');
    expect(cause).toHaveClass('type-body-sm', 'text-t2');
    expect(buttons()).toEqual(['Принять', 'Отклонить']);
    const accept = within(a).getByRole('button', { name: 'Принять' });
    expect(accept).toHaveAttribute('title', 'Принять · Enter');
    expect(accept).toHaveClass('type-num-12', 'uppercase', 'bg-cd', 'shadow-bevel', 'text-gd-hi', 'px-2', 'py-1');
    const reject = within(a).getByRole('button', { name: 'Отклонить' });
    expect(reject).toHaveAttribute('title', 'Отклонить');
    expect(reject).toHaveClass('text-t2');
    fireEvent.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(reject);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Править' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Переброс' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Цепочка причин' })).toBeNull();
  });

  it('цепочка: кнопка «▸ причина» с aria-expanded раскрывает список «→ шаг» (t3), второй клик прячет; пустая цепочка = нет цепочки', () => {
    const { rerender } = render(<WorldDelta {...base} chain={['полнолуние Selûne', 'ликантропы ×2 в Neverwinter Wood']} />);
    const cause = () => within(delta()).getByRole('button', { name: /караван всё ещё не найден/ });
    expect(cause()).toHaveAttribute('aria-expanded', 'false');
    expect(cause()).toHaveAttribute('title', 'Показать цепочку причин');
    expect(cause()).toHaveTextContent('▸ караван всё ещё не найден');
    expect(cause()).toHaveClass('type-body-sm', 'text-t2', 'cursor-pointer');
    expect(screen.queryByRole('list', { name: 'Цепочка причин' })).toBeNull();
    fireEvent.click(cause());
    expect(cause()).toHaveAttribute('aria-expanded', 'true');
    expect(cause()).toHaveAttribute('title', 'Скрыть цепочку причин');
    expect(cause()).toHaveTextContent('▾ караван всё ещё не найден');
    const list = screen.getByRole('list', { name: 'Цепочка причин' });
    expect(list).toHaveClass('type-body-sm', 'text-t3', 'pl-3');
    expect(list.className).toContain('inset_1px_0_0_var(--lo)');
    expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual(['→ полнолуние Selûne', '→ ликантропы ×2 в Neverwinter Wood']);
    fireEvent.click(cause());
    expect(screen.queryByRole('list', { name: 'Цепочка причин' })).toBeNull();
    expect(cause()).toHaveAttribute('aria-expanded', 'false');
    rerender(<WorldDelta {...base} chain={[]} />);
    expect(within(delta()).queryByRole('button', { name: /караван/ })).toBeNull();
    expect((delta().querySelector('[data-part="cause"]') as HTMLElement).tagName).toBe('DIV');
  });

  it('«Переброс» только при onReroll и variants > 1; «Править» только при onEdit; порядок кнопок — принять · править · переброс · отклонить', () => {
    const onReroll = vi.fn();
    const onEdit = vi.fn();
    const { rerender } = render(<WorldDelta {...base} onReroll={onReroll} />);
    expect(buttons()).toEqual(['Принять', 'Отклонить']);
    rerender(<WorldDelta {...base} onReroll={onReroll} variants={1} />);
    expect(buttons()).toEqual(['Принять', 'Отклонить']);
    rerender(<WorldDelta {...base} variants={3} />);
    expect(buttons()).toEqual(['Принять', 'Отклонить']);
    rerender(<WorldDelta {...base} onReroll={onReroll} variants={3} />);
    expect(buttons()).toEqual(['Принять', 'Переброс', 'Отклонить']);
    const reroll = screen.getByRole('button', { name: 'Переброс' });
    expect(reroll).toHaveAttribute('title', 'Перебросить · вариантов: 3');
    expect(reroll).toHaveClass('text-t2');
    fireEvent.click(reroll);
    expect(onReroll).toHaveBeenCalledTimes(1);
    rerender(<WorldDelta {...base} onReroll={onReroll} variants={3} onEdit={onEdit} />);
    expect(buttons()).toEqual(['Принять', 'Править', 'Переброс', 'Отклонить']);
    const edit = screen.getByRole('button', { name: 'Править' });
    expect(edit).toHaveAttribute('title', 'Править');
    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('конфликт с каноном: data-conflict, строка «Канон: …» цветом st-conflict с иконкой src-canon, пара «Принять изменение» (= onAccept) и «Оставить канон» (= onReject)', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<WorldDelta {...base} conflict="Zhentarim не действуют севернее Triboar" onAccept={onAccept} onReject={onReject} onEdit={() => {}} />);
    const a = delta();
    expect(a).toHaveAttribute('data-conflict', 'true');
    const row = a.querySelector('[data-part="conflict"]') as HTMLElement;
    expect(row).toHaveTextContent('Канон: Zhentarim не действуют севернее Triboar');
    expect(row).toHaveClass('type-body-sm', 'text-st-conflict');
    const book = within(row).getByRole('img', { name: 'Конфликт с каноном' });
    expect(pathsOf(book)).toEqual(tonePaths(ICONS['src-canon']).filter(Boolean));
    expect(book.querySelector('path[fill*="--st-conflict"]')).not.toBeNull();
    expect(buttons()).toEqual(['Принять изменение', 'Править', 'Оставить канон']);
    expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).toBeNull();
    const accept = screen.getByRole('button', { name: 'Принять изменение' });
    expect(accept).toHaveAttribute('title', 'Принять · Enter');
    expect(accept).toHaveClass('text-gd-hi');
    fireEvent.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1);
    const keep = screen.getByRole('button', { name: 'Оставить канон' });
    expect(keep).toHaveAttribute('title', 'Оставить канон');
    fireEvent.click(keep);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('сторож: нет эмодзи, hex, rounded; t3 только у «было», стрелки и цепочки (карточка cd, не плита pl); у каждой иконки title; className уходит на article', () => {
    const { container } = render(
      <WorldDelta {...base} chain={['полнолуние']} conflict="канон" variants={2} onReroll={() => {}} onEdit={() => {}} className="mb-2" />
    );
    fireEvent.click(within(delta()).getByRole('button', { name: /караван/ }));
    expect(container.innerHTML).not.toMatch(EMOJI);
    expect(delta()).toHaveClass('mb-2');
    const t3 = [] as string[];
    for (const el of [delta(), ...delta().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
      if (/(^|\s)text-t3(\s|$)/.test(cls)) t3.push(el.getAttribute('data-part') ?? el.getAttribute('aria-label') ?? el.tagName);
    }
    expect(t3).toEqual(['was', 'SPAN', 'chain']);
    // Ни одна кнопка не стоит на t3 и не несёт пустой title.
    for (const b of within(delta()).getAllByRole('button')) {
      expect(b.className).not.toMatch(/text-t3/);
      expect(b.getAttribute('title')).toBeTruthy();
    }
    for (const icon of delta().querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});
