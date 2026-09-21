// Paperdoll: девять слотов всегда, пустой — утоплен с именем слота и «: пусто» в title, редкий —
// золотая иконка плюс квадратная метка, оружие и инвентарь только при данных, колбэки по клику,
// доспех и щит из листа персонажа; ни одной пиктограммы.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import { tonePaths } from '../icons/Icon';
import { ICONS, ICON_NAMES } from '../icons/icons.generated';
import { Paperdoll, SLOTS, SLOT_IDS, dollItemsOf, slotTitle, weaponTitle, type Weapon } from './Paperdoll';

const EMOJI = /\p{Extended_Pictographic}/u;
const fillsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('fill') ?? '');
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const WEAPONS: Weapon[] = [
  { name: 'Длинный лук', hit: '+9', dmg: '1d8+5' },
  { name: 'Кинжал', hit: '+9', dmg: '1d4+5' },
];

describe('SLOTS', () => {
  it('девять слотов в порядке сетки прототипа, у каждого иконка slot-* из набора и русская подпись', () => {
    expect(SLOT_IDS).toEqual(['head', 'neck', 'cloak', 'armor', 'hands', 'ring', 'belt', 'feet', 'weapon']);
    for (const id of SLOT_IDS) {
      expect(SLOTS[id].icon, id).toBe(`slot-${id}`);
      expect(ICON_NAMES, id).toContain(SLOTS[id].icon);
      expect(SLOTS[id].label, id).toMatch(/^[А-ЯЁ][а-яё]+$/);
    }
  });
});

describe('Paperdoll: слоты', () => {
  it('без предметов — всё равно девять кнопок, каждая утоплена, с именем слота и «: пусто» в title', () => {
    const { container } = render(<Paperdoll />);
    const grid = screen.getByRole('group', { name: 'Слоты экипировки' });
    const slots = within(grid).getAllByRole('button');
    expect(slots).toHaveLength(9);
    expect(slots.map(s => s.getAttribute('data-slot'))).toEqual([...SLOT_IDS]);
    for (const s of slots) {
      expect(s).toHaveAttribute('type', 'button');
      expect(s).toHaveAttribute('data-filled', 'false');
      expect(s).toHaveClass('shadow-bevel-in', 'text-t3');
      expect(s.title).toMatch(/: пусто$/);
    }
    expect(screen.getByRole('button', { name: 'Голова: пусто' })).toHaveTextContent('Голова');
    // Иконка слота нарисована и в пустом: слот показывается всегда.
    const head = screen.getByRole('button', { name: 'Голова: пусто' });
    expect(pathsOf(within(head).getByRole('img', { name: 'Голова' }))).toEqual(tonePaths(ICONS['slot-head']).filter(Boolean));
    expect(container.querySelector('[role=group][aria-label=Инвентарь]')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.textContent).not.toMatch(EMOJI);
  });

  it('заполненный слот поднят, подпись — имя предмета, title — «Слот: имя · заметка»', () => {
    render(<Paperdoll items={{ neck: { name: 'Амулет Mielikki', note: 'слот шеи' }, armor: { name: 'Scale mail', note: '+ Shield' } }} />);
    const neck = screen.getByRole('button', { name: 'Шея: Амулет Mielikki · слот шеи' });
    expect(neck).toHaveAttribute('data-filled', 'true');
    expect(neck).toHaveClass('shadow-bevel', 'text-t2');
    expect(neck).not.toHaveClass('shadow-bevel-in');
    expect(within(neck).getByText('Амулет Mielikki')).toHaveClass('truncate', 'type-body-xs');
    expect(within(neck).queryByTitle('Редкий предмет')).toBeNull();
    expect(fillsOf(within(neck).getByRole('img', { name: 'Шея' })).join(' ')).toContain('--tx');
    expect(screen.getByRole('button', { name: 'Доспех: Scale mail · + Shield' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter(b => b.getAttribute('data-filled') === 'false')).toHaveLength(7);
    expect(slotTitle('ring', undefined)).toBe('Кольцо: пусто');
    expect(slotTitle('ring', { name: 'Кольцо защиты' })).toBe('Кольцо: Кольцо защиты');
  });

  it('редкий предмет — золотая иконка и квадратная метка: цвет не единственный носитель', () => {
    render(<Paperdoll items={{ neck: { name: 'Амулет Mielikki', rare: true }, cloak: { name: 'Плащ странника' } }} />);
    const neck = screen.getByRole('button', { name: /^Шея:/ });
    const cloak = screen.getByRole('button', { name: /^Плащ:/ });
    expect(neck).toHaveAttribute('data-rare', 'true');
    expect(cloak).not.toHaveAttribute('data-rare');
    expect(within(neck).getByTitle('Редкий предмет')).toHaveClass('bg-gd');
    expect(within(neck).getByRole('img', { name: 'редкий предмет' })).toBeInTheDocument();
    expect(within(cloak).queryByTitle('Редкий предмет')).toBeNull();
    const neckFills = fillsOf(within(neck).getByRole('img', { name: 'Шея' }));
    const cloakFills = fillsOf(within(cloak).getByRole('img', { name: 'Плащ' }));
    expect(neckFills.join(' ')).toContain('var(--gd)');
    expect(neckFills.join(' ')).not.toMatch(/#[0-9a-f]{6}/i);
    expect(cloakFills.join(' ')).not.toContain('--gd');
  });

  it('клик по слоту отдаёт его id — и по пустому тоже', () => {
    const onSlot = vi.fn();
    render(<Paperdoll items={{ armor: { name: 'Scale mail' } }} onSlot={onSlot} />);
    fireEvent.click(screen.getByRole('button', { name: /^Доспех:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Кольцо: пусто' }));
    expect(onSlot.mock.calls).toEqual([['armor'], ['ring']]);
  });
});

describe('Paperdoll: оружие и инвентарь', () => {
  it('оружие — кнопки «имя · +hit dmg» с золотым бонусом; клик отдаёт оружие', () => {
    const onAttack = vi.fn();
    render(<Paperdoll weapons={WEAPONS} onAttack={onAttack} />);
    expect(screen.getByRole('heading', { name: 'Оружие' })).toHaveClass('type-h-15', 'uppercase');
    const bow = screen.getByRole('button', { name: /Длинный лук/ });
    expect(bow).toHaveAttribute('title', 'Длинный лук · +9 к попаданию, 1d8+5');
    expect(within(bow).getByTitle('К попаданию')).toHaveClass('text-gd', 'type-num-12');
    expect(within(bow).getByTitle('Урон')).toHaveTextContent('1d8+5');
    fireEvent.click(bow);
    expect(onAttack).toHaveBeenCalledWith(WEAPONS[0]);
    expect(weaponTitle(WEAPONS[1])).toBe('Кинжал · +9 к попаданию, 1d4+5');
    // Девять слотов плюс два оружия — и ничего больше.
    expect(screen.getAllByRole('button')).toHaveLength(11);
    expect(screen.queryByRole('heading', { name: 'Инвентарь' })).toBeNull();
  });

  it('инвентарь: ячейка на каждую позицию, null — пустая с title «пусто», предмет — иконка с именем', () => {
    render(<Paperdoll inventory={[{ name: 'Верёвка' }, { name: 'Факел', icon: 'dawn' }, null, null]} />);
    const inv = screen.getByRole('group', { name: 'Инвентарь' });
    const cells = inv.querySelectorAll('[data-cell]');
    expect(cells).toHaveLength(4);
    expect(Array.from(cells).map(c => c.getAttribute('data-cell'))).toEqual(['item', 'item', 'empty', 'empty']);
    expect(within(inv).getAllByTitle('пусто')).toHaveLength(2);
    expect(within(inv).getByRole('img', { name: 'Верёвка' })).toBeInTheDocument();
    expect(pathsOf(within(inv).getByRole('img', { name: 'Факел' }))).toEqual(tonePaths(ICONS.dawn).filter(Boolean));
    expect(pathsOf(within(inv).getByRole('img', { name: 'Верёвка' }))).toEqual(tonePaths(ICONS['ent-item']).filter(Boolean));
    expect(screen.getByRole('heading', { name: 'Инвентарь' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Оружие' })).toBeNull();
    for (const c of Array.from(cells)) expect(c).toHaveClass('size-6', 'bg-wl', 'shadow-bevel-in');
  });

  it('пустые массивы — секций нет, как и без пропсов', () => {
    render(<Paperdoll weapons={[]} inventory={[]} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(9);
  });
});

describe('dollItemsOf', () => {
  it('из листа: Aldric — Scale mail с щитом, Korrin — Chain mail с щитом, Bo — без щита, Lyra — пусто', () => {
    const { actors } = seedEngine().getState().state;
    expect(dollItemsOf(actors.aldric.sheet)).toEqual({ armor: { name: 'Scale mail', note: '+ Shield' } });
    expect(dollItemsOf(actors.korrin.sheet)).toEqual({ armor: { name: 'Chain mail', note: '+ Shield' } });
    expect(dollItemsOf(actors.bo.sheet)).toEqual({ armor: { name: 'Scale mail', note: undefined } });
    expect(dollItemsOf(actors.lyra.sheet)).toEqual({});
    expect(dollItemsOf(undefined)).toEqual({});
    expect(dollItemsOf({ shield: true })).toEqual({ armor: { name: 'Shield' } });
    expect(dollItemsOf({ armor: 'не-доспех' })).toEqual({});
  });
});
