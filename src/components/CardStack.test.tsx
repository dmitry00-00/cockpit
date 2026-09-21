// CardStack: шапка со счётчиком (t2 на плите, не t3), корешок 40px с иконкой и полосой типа из одной
// карты, хиты числом tx с меткой порога заливкой hp-* (мёртвый остаётся с «0/11» и меткой hp-low),
// бейдж, клик отдаёт элемент; проекция актёра из сида. Со ступени лестницы (шаг 10): своя иконка при цвете
// типа, выбранный — aria-current, имя gd-hi и фон cd, «ждёт решения» — иконка src-sim и суффикс тултипа.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { CardStack, stackItemOf, stackItemTitle, type CardStackItem } from './CardStack';
import { ENTITY, ORIGIN } from './EntityCard';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const ENEMIES: CardStackItem[] = [
  { id: 'captain', name: 'Bandit Captain', type: 'monster', hp: { current: 45, max: 65, temp: 0 }, badge: 'CR 2' },
  { id: 'b1', name: 'Bandit 1', type: 'monster', hp: { current: 11, max: 11, temp: 0 }, badge: 'CR 1/8' },
  { id: 'b2', name: 'Bandit 2', type: 'monster', hp: { current: 8, max: 11, temp: 0 }, badge: 'CR 1/8' },
  { id: 'b3', name: 'Bandit 3', type: 'monster', hp: { current: 0, max: 11, temp: 0 }, badge: 'CR 1/8' },
];

describe('CardStack', () => {
  it('шапка: иконка, заголовок, счётчик равен числу корешков; корешки — кнопки 40px', () => {
    render(<CardStack title="Враги" icon="ent-monster" items={ENEMIES} />);
    const stack = screen.getByRole('group', { name: 'Враги' });
    expect(within(stack).getByTitle('Корешков в стопке')).toHaveTextContent('4');
    const rows = within(stack).getAllByRole('button');
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r).toHaveAttribute('type', 'button');
      expect(r).toHaveClass('h-spine-h', 'type-h-17');
    }
    expect(rows.map(r => r.textContent)).toEqual([
      'ЧудовищеBandit Captain45/65CR 2',
      'ЧудовищеBandit 111/11CR 1/8',
      'ЧудовищеBandit 28/11CR 1/8',
      'ЧудовищеBandit 30/11CR 1/8',
    ]);
    expect(stack.textContent).not.toMatch(EMOJI);
  });

  it('хиты: число всегда tx, порог — меткой-заливкой hp-*; мёртвый остаётся в стопке с «0/11» и меткой hp-low', () => {
    render(<CardStack items={[...ENEMIES, { id: 'b4', name: 'Bandit 4', type: 'monster', hp: { current: 4, max: 11, temp: 0 } }]} />);
    const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    const hp = (name: string) => within(rowOf(name)).getByTitle('Хиты');
    const mark = (name: string) => rowOf(name).querySelector('[data-part="hp"] [data-hp]') as HTMLElement;
    expect(hp('Bandit 3')).toHaveTextContent('0/11');
    expect(hp('Bandit 3')).toHaveClass('text-tx', 'type-num-12');
    // hp-* — заливки (ab-str текстом 3.1:1): числу они не достаются ни у кого.
    for (const name of ['Bandit Captain', 'Bandit 1', 'Bandit 2', 'Bandit 3', 'Bandit 4']) {
      expect(hp(name).className, name).not.toMatch(/text-hp-/);
      expect(hp(name), name).toHaveClass('text-tx');
      expect(mark(name).className, name).not.toMatch(/text-/);
      expect(mark(name), name).toHaveClass('size-2');
      expect(mark(name), name).toHaveAttribute('aria-hidden', 'true');
    }
    expect(mark('Bandit 3')).toHaveClass('bg-hp-low');
    expect(mark('Bandit 3')).toHaveAttribute('title', 'Хиты ниже четверти');
    expect(mark('Bandit 4')).toHaveClass('bg-hp-mid'); // 4/11 — между четвертью и половиной
    expect(mark('Bandit 1')).toHaveClass('bg-hp-high');
    expect(mark('Bandit 2')).toHaveClass('bg-hp-high');
    expect(mark('Bandit Captain')).toHaveClass('bg-hp-high');
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('сторож: t3 на плите не ставится (4.0:1) — в стопке нет ни одного text-t3; счётчик шапки — t2', () => {
    render(<CardStack title="Враги" icon="ent-monster" items={ENEMIES} />);
    const stack = screen.getByRole('group', { name: 'Враги' });
    for (const el of [stack, ...stack.querySelectorAll('*')]) expect(el.getAttribute('class') ?? '').not.toMatch(/(^|\s)text-t3(\s|$)/);
    expect(within(stack).getByTitle('Корешков в стопке')).toHaveClass('text-t2', 'type-key');
    expect(stack.querySelector('[data-part="head"]')?.className).toContain('from-pl');
  });

  it('тип задаёт полосу и иконку вместе: pc — ent-pc, location — ent-loc с иконкой ent-location; без hp числа нет', () => {
    render(
      <CardStack
        title="Neverwinter"
        items={[
          { id: 'bo', name: 'Bo Tambernack', type: 'pc', hp: { current: 41, max: 49, temp: 0 }, badge: '5' },
          { id: 'nw', name: 'Neverwinter', type: 'location', badge: 'Город' },
        ]}
      />
    );
    const bo = screen.getByRole('button', { name: /Bo Tambernack/ });
    const nw = screen.getByRole('button', { name: /Neverwinter/ });
    expect(bo.className).toContain('inset_3px_0_0_var(--ent-pc)');
    expect(nw.className).toContain('inset_3px_0_0_var(--ent-loc)');
    expect(bo.className).not.toMatch(/#[0-9a-f]/i);
    expect(pathsOf(within(bo).getByRole('img', { name: ENTITY.pc.label }))).toEqual(tonePaths(ICONS['ent-pc']).filter(Boolean));
    expect(pathsOf(within(nw).getByRole('img', { name: ENTITY.location.label }))).toEqual(tonePaths(ICONS['ent-location']).filter(Boolean));
    expect(within(nw).queryByTitle('Хиты')).toBeNull();
    expect(within(nw).getByText('Город')).toBeInTheDocument();
  });

  it('клик по корешку отдаёт элемент; title — «имя · бейдж»', () => {
    const onOpen = vi.fn();
    render(<CardStack items={ENEMIES} onOpen={onOpen} />);
    const row = screen.getByRole('button', { name: /Bandit Captain/ });
    expect(row).toHaveAttribute('title', 'Bandit Captain · CR 2');
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(ENEMIES[0]);
    expect(stackItemTitle({ id: 'x', name: 'Слух', type: 'event' })).toBe('Слух');
    expect(stackItemTitle({ id: 'nw', name: 'Neverwinter', type: 'location', badge: 'Поселение', pending: true })).toBe('Neverwinter · Поселение · ждёт решения');
    expect(stackItemTitle({ id: 'x', name: 'Слух', type: 'event', pending: true })).toBe('Слух · ждёт решения');
  });

  it('лестница: icon подменяет иконку типа при цвете типа; selected — aria-current, имя gd-hi, фон cd; pending — иконка src-sim и суффикс тултипа', () => {
    const items: CardStackItem[] = [
      { id: 'faerun', name: 'Faerûn', type: 'location', badge: 'Континент', icon: 'scale-continent' },
      { id: 'scn', name: 'Sword Coast North', type: 'location', badge: 'Регион', icon: 'scale-region', selected: true },
      { id: 'nw', name: 'Neverwinter', type: 'location', badge: 'Поселение', icon: 'scale-settlement', pending: true },
      { id: 'zh', name: 'Zhentarim', type: 'faction' },
    ];
    render(<CardStack title="Здесь" icon="scale-region" items={items} />);
    const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    const nameOf = (name: string) => within(row(name)).getByText(name);
    // Иконка — уровня, title и цвет — типа: полоса и иконка по-прежнему из одной карты ENTITY.
    const faerun = within(row('Faerûn')).getByRole('img', { name: ENTITY.location.label });
    expect(pathsOf(faerun)).toEqual(tonePaths(ICONS['scale-continent']).filter(Boolean));
    expect(pathsOf(faerun)).not.toEqual(tonePaths(ICONS['ent-location']).filter(Boolean));
    expect(row('Faerûn').className).toContain('inset_3px_0_0_var(--ent-loc)');
    expect(pathsOf(within(row('Zhentarim')).getByRole('img', { name: ENTITY.faction.label }))).toEqual(tonePaths(ICONS['ent-faction']).filter(Boolean));
    // Выбранный: атрибут, золото на имени (не на кнопке целиком — хиты и бейдж остаются своими), фон cd без hover.
    expect(row('Sword Coast North')).toHaveAttribute('aria-current', 'true');
    expect(row('Sword Coast North')).toHaveAttribute('data-selected', 'true');
    expect(nameOf('Sword Coast North')).toHaveClass('text-gd-hi');
    expect(nameOf('Sword Coast North')).not.toHaveClass('text-tx');
    expect(row('Sword Coast North')).toHaveClass('bg-cd');
    expect(row('Sword Coast North')).not.toHaveClass('bg-pn', 'hover:bg-cd');
    for (const name of ['Faerûn', 'Neverwinter', 'Zhentarim']) {
      expect(row(name), name).not.toHaveAttribute('aria-current');
      expect(nameOf(name), name).toHaveClass('text-tx');
      expect(nameOf(name), name).not.toHaveClass('text-gd-hi');
      expect(row(name), name).toHaveClass('bg-pn', 'hover:bg-cd');
    }
    // Ждёт решения: иконка src-sim справа от бейджа с подписью, тултип с суффиксом; у остальных иконки нет.
    const sim = within(row('Neverwinter')).getByRole('img', { name: ORIGIN.sim.label });
    expect(pathsOf(sim)).toEqual(tonePaths(ICONS['src-sim']).filter(Boolean));
    expect(sim).toHaveAttribute('width', '16');
    expect(sim.compareDocumentPosition(within(row('Neverwinter')).getByText('Поселение')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(row('Neverwinter')).toHaveAttribute('title', 'Neverwinter · Поселение · ждёт решения');
    expect(row('Neverwinter')).toHaveAttribute('data-pending', 'true');
    for (const name of ['Faerûn', 'Sword Coast North', 'Zhentarim']) {
      expect(within(row(name)).queryByRole('img', { name: ORIGIN.sim.label }), name).toBeNull();
      expect(row(name).getAttribute('title'), name).not.toContain('ждёт решения');
    }
    expect(screen.getByRole('group', { name: 'Здесь' }).textContent).not.toMatch(EMOJI);
    for (const el of screen.getByRole('group', { name: 'Здесь' }).querySelectorAll('*')) expect(el.getAttribute('class') ?? '').not.toMatch(/(^|\s)text-t3(\s|$)/);
  });

  it('без title шапки нет, корешки есть', () => {
    render(<CardStack items={ENEMIES.slice(0, 2)} />);
    expect(document.querySelector('[data-part=head]')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('stackItemOf', () => {
  it('партия из сида: pc с уровнем «5» и хитами из State; капитан — monster с «CR 2»; хиты — та же тройка', () => {
    const store = seedEngine();
    const { actors, party } = store.getState().state;
    const items = party.map(id => stackItemOf(actors[id]));
    expect(items.map(i => [i.name, i.type, i.badge, `${i.hp?.current}/${i.hp?.max}`])).toEqual([
      ['Bo Tambernack', 'pc', '5', '41/49'],
      ['Korrin Battlehammer', 'pc', '5', '49/49'],
      ['Lyra Moonwhisper', 'pc', '5', '32/32'],
      ['Brother Aldric', 'pc', '5', '38/38'],
    ]);
    expect(items[0].hp).toBe(actors.bo.hp);
    const captain = stackItemOf(actors.captain);
    expect(captain).toMatchObject({ id: 'captain', type: 'monster', badge: 'CR 2', hp: { current: 45, max: 65 } });
    expect(stackItemOf(actors['bandit-1']).badge).toBe('CR 1/8');
  });

  it('npc без листа — без бейджа', () => {
    const store = seedEngine();
    const bo = store.getState().state.actors.bo;
    expect(stackItemOf({ ...bo, kind: 'npc', sheet: undefined }).badge).toBeUndefined();
    expect(stackItemOf({ ...bo, kind: 'npc', sheet: undefined }).type).toBe('npc');
  });
});
