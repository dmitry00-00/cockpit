// EntityCard: тип задаёт грань и иконку вместе, dm-вкладки нет в DOM без dmView, ширина и рамка
// оверлея, кольца выбора и ожидания решения, вкладки переключают тело, проекция актёра берёт числа
// из State — и урон по стору виден в карточке и в стопке из одного места; проекции места и фракции
// (шаг 10) — из сида §13: Neverwinter 23k · средняя · +10%, Zhentarim 45% · +1 · 0. Ни одной пиктограммы.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FACTION, LOCATION, seedEngine, seedState } from '../campaign';
import { tonePaths } from '../icons/Icon';
import { ICONS, ICON_NAMES } from '../icons/icons.generated';
import { MONSTERS } from '../rules/srd';
import { CardStack, stackItemOf } from './CardStack';
import {
  DANGER_LABELS,
  ENTITY,
  EntityCard,
  ORIGIN,
  actorCardProps, raceLabel,
  cardShadow,
  factionCardProps, placeCardProps, placeEntityType, populationLabel, priceLabel,
  hpStat,
  visibleTabs,
  type EntityCardTab,
  type EntityType,
} from './EntityCard';

const EMOJI = /\p{Extended_Pictographic}/u;
const TABS: EntityCardTab[] = [
  { id: 'stats', label: 'STATS' },
  { id: 'gear', label: 'GEAR' },
  { id: 'dm', label: 'DM', dm: true },
];

/** Пути иконки в разметке — по ним видно, какая именно иконка нарисована. */
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));
const iconPaths = (name: keyof typeof ICONS) => tonePaths(ICONS[name]).filter(Boolean);
const spineOf = (card: HTMLElement) => card.querySelector('[data-part=spine]') as HTMLElement;

describe('ENTITY', () => {
  it('у каждого из десяти типов есть иконка из набора, грань цветом ent-* и ни одного hex', () => {
    const types = Object.keys(ENTITY) as EntityType[];
    expect(types).toHaveLength(10);
    for (const t of types) {
      const e = ENTITY[t];
      expect(ICON_NAMES, t).toContain(e.icon);
      expect(e.edge, t).toMatch(/inset_3px_0_0_var\(--ent-[a-z]+\)/);
      expect(e.color, t).toMatch(/^var\(--ent-[a-z]+\)$/);
      expect(e.edge + e.color, t).not.toMatch(/#[0-9a-f]/i);
    }
    // Токен цвета локации — ent-loc, иконка — ent-location: имена расходятся на одну букву, здесь они сведены.
    expect(ENTITY.location).toMatchObject({ icon: 'ent-location', color: 'var(--ent-loc)' });
    expect(ENTITY.planet.color).toBe(ENTITY.plane.color);
    for (const o of Object.values(ORIGIN)) expect(ICON_NAMES).toContain(o.icon);
  });
});

describe('EntityCard: тип', () => {
  it('pc и monster получают разную грань и разную иконку из одной карты — вместе, не по отдельности', () => {
    render(<EntityCard type="pc" name="Bo Tambernack" />);
    render(<EntityCard type="monster" name="Bandit Captain" />);
    const pc = screen.getByRole('region', { name: 'Bo Tambernack' });
    const monster = screen.getByRole('region', { name: 'Bandit Captain' });
    expect(pc).toHaveAttribute('data-entity-type', 'pc');
    expect(spineOf(pc)).toHaveClass(ENTITY.pc.edge);
    expect(spineOf(pc)).not.toHaveClass(ENTITY.monster.edge);
    expect(spineOf(monster)).toHaveClass(ENTITY.monster.edge);
    const pcIcon = within(spineOf(pc)).getByRole('img', { name: ENTITY.pc.label });
    const mIcon = within(spineOf(monster)).getByRole('img', { name: ENTITY.monster.label });
    expect(pathsOf(pcIcon)).toEqual(iconPaths('ent-pc'));
    expect(pathsOf(mIcon)).toEqual(iconPaths('ent-monster'));
    expect(pathsOf(pcIcon)).not.toEqual(pathsOf(mIcon));
    expect(pcIcon).toHaveAttribute('width', '24');
  });

  it('оверлей: иконка 48 и имя type-h-28; одиночная — 24 в корешке 40px (прототип) и type-h-17', () => {
    const { rerender } = render(<EntityCard type="location" name="Neverwinter" />);
    const card = () => screen.getByRole('region', { name: 'Neverwinter' });
    expect(within(spineOf(card())).getByRole('img', { name: 'Место' })).toHaveAttribute('width', '24');
    expect(within(spineOf(card())).getByText('Neverwinter')).toHaveClass('type-h-17', 'truncate');
    rerender(<EntityCard type="location" name="Neverwinter" overlay />);
    expect(within(spineOf(card())).getByRole('img', { name: 'Место' })).toHaveAttribute('width', '48');
    expect(within(spineOf(card())).getByText('Neverwinter')).toHaveClass('type-h-28');
  });
});

describe('EntityCard: ширина и кольца', () => {
  it('400 на фаске по умолчанию, 720 с бронзовой рамкой в оверлее', () => {
    const { rerender } = render(<EntityCard type="pc" name="Bo" />);
    const card = () => screen.getByRole('region', { name: 'Bo' });
    expect(card()).toHaveClass('w-card-single', 'shadow-bevel');
    expect(card()).not.toHaveClass('w-card-overlay');
    rerender(<EntityCard type="pc" name="Bo" overlay />);
    expect(card()).toHaveClass('w-card-overlay', 'shadow-[var(--bevel),var(--frame)]');
    expect(card()).not.toHaveClass('w-card-single', 'shadow-bevel');
  });

  it('pending — бирюзовое кольцо и пульс; selected — золотое; pending важнее selected', () => {
    const { rerender } = render(<EntityCard type="location" name="Neverwinter" pending />);
    const card = () => screen.getByRole('region', { name: 'Neverwinter' });
    expect(card()).toHaveClass('shadow-[var(--bevel),var(--glow-sim)]', 'card-pending');
    expect(card()).toHaveAttribute('data-pending', 'true');
    rerender(<EntityCard type="location" name="Neverwinter" selected />);
    expect(card()).toHaveClass('shadow-[var(--bevel),var(--glow-gold)]');
    expect(card()).not.toHaveClass('card-pending');
    rerender(<EntityCard type="location" name="Neverwinter" selected pending />);
    expect(card()).toHaveClass('shadow-[var(--bevel),var(--glow-sim)]');
    expect(card()).not.toHaveClass('shadow-[var(--bevel),var(--glow-gold)]');
  });

  it('cardShadow: фаска всегда, рамка только у оверлея, кольцо одно', () => {
    expect(cardShadow(false, false, false)).toBe('shadow-bevel');
    expect(cardShadow(true, true, false)).toBe('shadow-[var(--bevel),var(--frame),var(--glow-gold)]');
    expect(cardShadow(true, false, true)).toBe('shadow-[var(--bevel),var(--frame),var(--glow-sim)]');
    for (const o of [true, false]) for (const s of [true, false]) for (const p of [true, false]) {
      const cls = cardShadow(o, s, p);
      expect(cls).toContain('bevel');
      expect(cls.includes('frame')).toBe(o);
      expect(cls.includes('glow-sim')).toBe(p);
      expect(cls.includes('glow-gold')).toBe(s && !p);
      expect(cls).not.toMatch(/#[0-9a-f]/i);
    }
  });
});

describe('EntityCard: вкладки', () => {
  it('без dmView вкладки DM нет в DOM — не скрыта, а отсутствует; с dmView — есть', () => {
    const { rerender } = render(<EntityCard type="pc" name="Bo" tabs={TABS} dmView={false} />);
    expect(screen.queryByRole('tab', { name: 'DM' })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('DM');
    rerender(<EntityCard type="pc" name="Bo" tabs={TABS} dmView />);
    expect(screen.getByRole('tab', { name: 'DM' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(visibleTabs(TABS, false).map(t => t.id)).toEqual(['stats', 'gear']);
  });

  it('вкладки переключают тело: функция получает id, onTab зовётся, активная помечена', () => {
    const onTab = vi.fn();
    render(
      <EntityCard type="pc" name="Bo" tabs={TABS} dmView onTab={onTab}>
        {tab => <p>тело: {tab}</p>}
      </EntityCard>,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('тело: stats');
    expect(screen.getByRole('tab', { name: 'STATS' })).toHaveAttribute('data-state', 'active');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'GEAR' }));
    fireEvent.click(screen.getByRole('tab', { name: 'GEAR' }));
    expect(onTab).toHaveBeenCalledWith('gear');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('тело: gear');
    expect(screen.getByRole('tab', { name: 'GEAR' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'STATS' })).toHaveAttribute('data-state', 'inactive');
  });

  it('activeTab со страницы главнее своего; активная dm-вкладка при уходе dmView уступает первой видимой', () => {
    const { rerender } = render(
      <EntityCard type="pc" name="Bo" tabs={TABS} dmView activeTab="dm">
        {tab => <p>тело: {tab}</p>}
      </EntityCard>,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('тело: dm');
    rerender(
      <EntityCard type="pc" name="Bo" tabs={TABS} dmView={false} activeTab="dm">
        {tab => <p>тело: {tab}</p>}
      </EntityCard>,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('тело: stats');
    expect(screen.queryByText('тело: dm')).toBeNull();
  });

  it('без вкладок тело — просто узел, вкладок и панели нет', () => {
    render(
      <EntityCard type="item" name="Амулет Mielikki">
        <p>Чудесный предмет</p>
      </EntityCard>,
    );
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Чудесный предмет')).toBeInTheDocument();
  });

  it('оверлей: aside — вторая колонка; в одиночной карточке aside не рисуется', () => {
    const { rerender } = render(
      <EntityCard type="faction" name="Zhentarim" aside={<p>вторая колонка</p>}>
        <p>первая колонка</p>
      </EntityCard>,
    );
    expect(screen.queryByText('вторая колонка')).toBeNull();
    rerender(
      <EntityCard type="faction" name="Zhentarim" overlay aside={<p>вторая колонка</p>}>
        <p>первая колонка</p>
      </EntityCard>,
    );
    expect(screen.getByText('вторая колонка')).toBeInTheDocument();
    expect(screen.getByText('первая колонка').parentElement).not.toHaveClass('col-span-2');
  });
});

describe('EntityCard: корешок и полоса', () => {
  it('бейджей не больше трёх, первый золотой; метка происхождения — иконка с подписью в title', () => {
    render(<EntityCard type="monster" name="Bandit Captain" badges={['CR 2', 'Medium', 'третий', 'лишний']} origin="canon" />);
    const badges = screen.getByRole('region', { name: 'Bandit Captain' }).querySelectorAll('[data-part=badge]');
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent('CR 2');
    expect(badges[0]).toHaveClass('text-gd');
    expect(badges[1]).toHaveClass('text-t2');
    expect(badges[1]).not.toHaveClass('text-gd');
    expect(screen.queryByText('лишний')).toBeNull();
    expect(screen.getByRole('img', { name: 'Канон' })).toBeInTheDocument();
  });

  it('полоса показателей: метка и число моно, цвет — токен по tone, ячейка с колбэком — кнопка', () => {
    const onHp = vi.fn();
    render(
      <EntityCard
        type="pc"
        name="Bo"
        stats={[
          { label: 'AC', value: '16', title: 'Класс доспеха' },
          { label: 'HP', value: '41/49', mark: 'high', onClick: onHp },
        ]}
      />
    );
    expect(screen.getByText('AC')).toHaveClass('type-num-12', 'uppercase');
    expect(screen.getByText('16')).toHaveClass('type-num-24', 'text-tx');
    // Число — всегда tx; порог полосы — меткой-заливкой рядом (hp-* текстом не ставятся: 2.4:1 на плите).
    expect(screen.getByText('41/49')).toHaveClass('type-num-24', 'text-tx');
    expect(screen.getByRole('img', { name: 'хиты выше половины' })).toHaveClass('bg-hp-high');
    expect(screen.getByTitle('Класс доспеха').tagName).toBe('DIV');
    const hp = screen.getByRole('button', { name: /41\/49/ });
    expect(hp).toHaveAttribute('type', 'button');
    fireEvent.click(hp);
    expect(onHp).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('без stats полосы нет', () => {
    render(<EntityCard type="event" name="Полнолуние Selûne" />);
    expect(screen.getByRole('region', { name: 'Полнолуние Selûne' }).querySelector('[data-part=stats]')).toBeNull();
  });
});

describe('actorCardProps', () => {
  it('Bo: pc, «5 ур.» и «Следопыт», HP 41/49 · AC 16 · PP 12 · БМ +3, вкладки Обзор · Состояния · Снаряжение; DM — только при секретах', () => {
    const store = seedEngine();
    const bo = store.getState().state.actors.bo;
    const p = actorCardProps(bo);
    expect(p.type).toBe('pc');
    expect(p.badges).toEqual(['5 ур.', 'Следопыт']); // раса — в обзоре: третий бейдж обрезал имя в 400px
    expect(p.stats?.map(s => [s.label, s.value])).toEqual([['HP', '41/49'], ['AC', '16'], ['PP', '12'], ['БМ', '+3']]);
    expect(p.stats?.[0].mark).toBe('high');
    expect(p.tabs?.map(t => t.label)).toEqual(['Обзор', 'Состояния', 'Снаряжение']);
    expect(actorCardProps(bo, { dmFacts: 1 }).tabs?.map(t => t.label)).toEqual(['Обзор', 'Состояния', 'Снаряжение', 'DM']);
    expect(actorCardProps(bo, { dmFacts: 1 }).tabs?.find(t => t.label === 'DM')?.dm).toBe(true);
    expect(p.origin).toBe('dm');
    expect(raceLabel(bo.sheet!)).toBe('Полурослик · Легконогий');
  });

  it('капитан: monster, «CR 2» и «Medium», HP 45/65 · AC 15 · SPD 30 из блока SRD (HP всегда первая), канон', () => {
    const store = seedEngine();
    const captain = store.getState().state.actors.captain;
    const p = actorCardProps(captain);
    expect(p.type).toBe('monster');
    expect(p.badges).toEqual([`CR ${MONSTERS['bandit-captain'].cr}`, MONSTERS['bandit-captain'].size]);
    expect(p.badges).toEqual(['CR 2', 'Medium']);
    expect(p.stats?.map(s => [s.label, s.value])).toEqual([['HP', '45/65'], ['AC', '15'], ['SPD', '30']]);
    expect(p.tabs?.map(t => t.label)).toEqual(['Обзор', 'Действия', 'Состояния']);
    expect(p.origin).toBe('canon');
  });

  it('hpStat: порог полосы — меткой, не цветом текста; временные — в числе; колбэк идёт в ячейку', () => {
    const onHp = vi.fn();
    expect(hpStat({ current: 32, max: 32, temp: 5 })).toMatchObject({ label: 'HP', value: '32/32 +5', mark: 'high' });
    expect(hpStat({ current: 32, max: 32, temp: 5 }).tone).toBeUndefined();
    expect(hpStat({ current: 5, max: 40, temp: 0 }).mark).toBe('low');
    expect(hpStat({ current: 20, max: 40, temp: 0 }).mark).toBe('mid');
    expect(hpStat({ current: 1, max: 1, temp: 0 }, onHp).onClick).toBe(onHp);
  });
});

describe('placeCardProps', () => {
  const world = () => seedState().world;

  it('Neverwinter из сида: location, бейдж «Поселение», полоса Население 23k · Опасность средняя · Цены +10%, вкладка Обзор, канон; DM — только при секретах', () => {
    const nw = world().locations[LOCATION.neverwinter];
    const p = placeCardProps(nw);
    expect(p.type).toBe('location');
    expect(p.name).toBe('Neverwinter');
    expect(p.badges).toEqual(['Поселение']);
    expect(p.stats?.map(st => [st.label, st.value])).toEqual([['Население', '23k'], ['Опасность', 'средняя'], ['Цены', '+10%']]);
    expect(p.stats?.map(st => st.title)).toEqual(['Население', 'Опасность для партии', 'Надбавка к ценам']);
    expect(p.tabs?.map(t => t.label)).toEqual(['Обзор']);
    expect(p.origin).toBe('canon');
    expect(p.pending).toBeUndefined();
    expect(placeCardProps(nw, { dmFacts: 2 }).tabs?.map(t => t.label)).toEqual(['Обзор', 'DM']);
    expect(placeCardProps(nw, { dmFacts: 2 }).tabs?.find(t => t.label === 'DM')?.dm).toBe(true);
    expect(placeCardProps(nw, { dmFacts: 0 }).tabs?.map(t => t.label)).toEqual(['Обзор']);
    expect(placeCardProps(nw, { pending: true }).pending).toBe(true);
  });

  it('в полосе только то, что у места есть, по порядку; ни одного поля — stats не задаётся (undefined, не [])', () => {
    const region = world().locations[LOCATION.swordCoastNorth];
    const p = placeCardProps(region);
    expect(p.type).toBe('location');
    expect(p.badges).toEqual(['Регион']);
    expect(p.stats).toBeUndefined();
    expect(placeCardProps({ ...region, danger: 'high' }).stats?.map(st => [st.label, st.value])).toEqual([['Опасность', 'высокая']]);
    expect(placeCardProps({ ...region, pricePercent: 0, population: 800 }).stats?.map(st => [st.label, st.value])).toEqual([['Население', '800'], ['Цены', 'базовые']]);
  });

  it('тип по уровню: космология и план — plane, система и планета — planet, остальное — location; сид сверху вниз', () => {
    expect(placeEntityType('cosmology')).toBe('plane');
    expect(placeEntityType('plane')).toBe('plane');
    expect(placeEntityType('system')).toBe('planet');
    expect(placeEntityType('planet')).toBe('planet');
    for (const sc of ['continent', 'region', 'settlement', 'building', 'battle'] as const) expect(placeEntityType(sc), sc).toBe('location');
    const locs = world().locations;
    expect(placeCardProps(locs[LOCATION.greatWheel])).toMatchObject({ type: 'plane', name: 'Великое Колесо', badges: ['Космология'] });
    expect(placeCardProps(locs[LOCATION.material])).toMatchObject({ type: 'plane', badges: ['План'] });
    expect(placeCardProps(locs[LOCATION.realmspace])).toMatchObject({ type: 'planet', badges: ['Система'] });
    expect(placeCardProps(locs[LOCATION.toril])).toMatchObject({ type: 'planet', name: 'Toril', badges: ['Планета'] });
    expect(placeCardProps(locs[LOCATION.faerun])).toMatchObject({ type: 'location', badges: ['Континент'] });
    expect(placeCardProps(locs[LOCATION.southGate])).toMatchObject({ type: 'location', badges: ['Здание'] });
  });

  it('populationLabel, priceLabel, DANGER_LABELS — чистые: 23k · 1.5k · 800; +10% · −5% (U+2212) · базовые', () => {
    expect(populationLabel(23_000)).toBe('23k');
    expect(populationLabel(1_500)).toBe('1.5k');
    expect(populationLabel(1_000)).toBe('1k');
    expect(populationLabel(800)).toBe('800');
    expect(populationLabel(0)).toBe('0');
    expect(populationLabel(1_234)).toBe('1.2k');
    expect(priceLabel(10)).toBe('+10%');
    expect(priceLabel(-5)).toBe('−5%');
    expect(priceLabel(-5)).not.toContain('-');
    expect(priceLabel(0)).toBe('базовые');
    expect(DANGER_LABELS).toEqual({ low: 'низкая', medium: 'средняя', high: 'высокая' });
  });

  it('карточка Neverwinter рендерится: корешок «Neverwinter» с иконкой места, бейдж «Поселение» золотом, плитки 23k · средняя · +10%, канон; pending — card-pending и glow-sim, как у актёров', () => {
    const nw = world().locations[LOCATION.neverwinter];
    const { rerender } = render(<EntityCard {...placeCardProps(nw)} dmView />);
    const card = () => screen.getByRole('region', { name: 'Neverwinter' });
    expect(card()).toHaveAttribute('data-entity-type', 'location');
    expect(within(spineOf(card())).getByText('Neverwinter')).toBeInTheDocument();
    expect(pathsOf(within(spineOf(card())).getByRole('img', { name: 'Место' }))).toEqual(iconPaths('ent-location'));
    const badge = card().querySelector('[data-part=badge]') as HTMLElement;
    expect(badge).toHaveTextContent('Поселение');
    expect(badge).toHaveClass('text-gd');
    expect(within(card()).getByText('23k')).toHaveClass('type-num-24', 'text-tx');
    expect(within(card()).getByText('средняя')).toBeInTheDocument();
    expect(within(card()).getByText('+10%')).toBeInTheDocument();
    expect(within(card()).getByTitle('Опасность для партии')).toBeInTheDocument();
    expect(within(card()).getByRole('img', { name: 'Канон' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Обзор' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'DM' })).toBeNull();
    expect(card()).not.toHaveClass('card-pending');
    rerender(<EntityCard {...placeCardProps(nw, { pending: true, dmFacts: 1 })} dmView />);
    expect(card()).toHaveClass('card-pending', 'shadow-[var(--bevel),var(--glow-sim)]');
    expect(card()).toHaveAttribute('data-pending', 'true');
    expect(screen.getByRole('tab', { name: 'DM' })).toBeInTheDocument();
    expect(card().textContent).not.toMatch(EMOJI);
  });

  it('карточки plane и planet рендерятся с иконками лестницы: Великое Колесо — scale-plane, Toril — scale-planet, без полосы показателей', () => {
    const locs = world().locations;
    render(<EntityCard {...placeCardProps(locs[LOCATION.greatWheel])} />);
    render(<EntityCard {...placeCardProps(locs[LOCATION.toril])} />);
    const wheel = screen.getByRole('region', { name: 'Великое Колесо' });
    const toril = screen.getByRole('region', { name: 'Toril' });
    expect(pathsOf(within(spineOf(wheel)).getByRole('img', { name: 'План' }))).toEqual(iconPaths('scale-plane'));
    expect(pathsOf(within(spineOf(toril)).getByRole('img', { name: 'Планета' }))).toEqual(iconPaths('scale-planet'));
    expect(spineOf(wheel)).toHaveClass(ENTITY.plane.edge);
    expect(wheel.querySelector('[data-part=stats]')).toBeNull();
    expect(toril.querySelector('[data-part=stats]')).toBeNull();
  });
});

describe('factionCardProps', () => {
  it('Zhentarim из сида: faction без бейджей, Влияние 45% · Тренд +1 · Известность 0, вкладка Обзор, канон; pending пробрасывается', () => {
    const z = seedState().world.factions[FACTION.zhentarim];
    const p = factionCardProps(z);
    expect(p.type).toBe('faction');
    expect(p.name).toBe('Zhentarim');
    expect(p.badges).toBeUndefined();
    expect(p.stats?.map(st => [st.label, st.value])).toEqual([['Влияние', '45%'], ['Тренд', '+1'], ['Известность', '0']]);
    expect(p.stats?.map(st => st.title)).toEqual(['Влияние фракции', 'Тренд влияния за десятидневку', 'Известность партии у фракции']);
    expect(p.tabs?.map(t => t.label)).toEqual(['Обзор']);
    expect(p.origin).toBe('canon');
    expect(p.pending).toBeUndefined();
    expect(factionCardProps(z, { pending: true }).pending).toBe(true);
  });

  it('без влияния и тренда — одна известность; тренд −2 — типографский минус, 0 — «0», не «+0»', () => {
    const { factions } = seedState().world;
    expect(factionCardProps(factions[FACTION.harpers]).stats?.map(st => [st.label, st.value])).toEqual([['Известность', '5']]);
    expect(factionCardProps(factions[FACTION.lordsAlliance]).stats?.map(st => [st.label, st.value])).toEqual([['Известность', '12']]);
    const z = factions[FACTION.zhentarim];
    expect(factionCardProps({ ...z, trend: -2 }).stats?.[1].value).toBe('−2');
    expect(factionCardProps({ ...z, trend: 0 }).stats?.[1].value).toBe('0');
  });

  it('карточка Zhentarim рендерится: иконка фракции, плитки 45% · +1 · 0, без бейджей; pending — glow-sim', () => {
    const z = seedState().world.factions[FACTION.zhentarim];
    const { rerender } = render(<EntityCard {...factionCardProps(z)} />);
    const card = () => screen.getByRole('region', { name: 'Zhentarim' });
    expect(card()).toHaveAttribute('data-entity-type', 'faction');
    expect(pathsOf(within(spineOf(card())).getByRole('img', { name: 'Фракция' }))).toEqual(iconPaths('ent-faction'));
    expect(card().querySelectorAll('[data-part=badge]')).toHaveLength(0);
    expect(within(card()).getByText('45%')).toHaveClass('type-num-24', 'text-tx');
    expect(within(card()).getByText('+1')).toBeInTheDocument();
    expect(within(card()).getByTitle('Известность партии у фракции')).toHaveTextContent('0');
    expect(card()).not.toHaveClass('card-pending');
    rerender(<EntityCard {...factionCardProps(z, { pending: true })} />);
    expect(card()).toHaveClass('card-pending', 'shadow-[var(--bevel),var(--glow-sim)]');
    expect(card().textContent).not.toMatch(EMOJI);
  });
});

describe('одно место состояния', () => {
  it('урон по стору виден в карточке и в стопке одновременно, undo возвращает обоим', () => {
    const store = seedEngine();
    const actorsOf = () => store.getState().state.actors;
    const view = () => (
      <>
        <EntityCard {...actorCardProps(actorsOf().bo)} />
        <CardStack title="Партия" items={store.getState().state.party.map(id => stackItemOf(actorsOf()[id]))} />
      </>
    );
    const { rerender, container } = render(view());
    const cardHp = () => within(screen.getByRole('region', { name: 'Bo Tambernack' })).getByText(/^\d+\/49/);
    const stackHp = () => within(screen.getByRole('button', { name: /Bo Tambernack/ })).getByTitle('Хиты');
    expect(cardHp()).toHaveTextContent('41/49');
    expect(stackHp()).toHaveTextContent('41/49');

    store.getState().damage('bo', 10);
    rerender(view());
    expect(actorsOf().bo.hp.current).toBe(31);
    expect(cardHp()).toHaveTextContent('31/49');
    expect(stackHp()).toHaveTextContent('31/49');

    store.getState().undo();
    rerender(view());
    expect(cardHp()).toHaveTextContent('41/49');
    expect(stackHp()).toHaveTextContent('41/49');
    expect(store.getState().toast).toMatch(/^Отменено: /);
    expect(container.textContent).not.toMatch(EMOJI);
  });
});
