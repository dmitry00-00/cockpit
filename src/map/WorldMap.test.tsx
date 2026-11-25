// Карта мира как компонент: тайлы видимого окна, пины-кнопки, знак партии, линейка с днями пути по SRD,
// гексы, кнопки приближения. В jsdom окно не измеряется — компонент берёт запасные 960×540.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MAPS } from './maps';
import { loadJourney } from '../rules/a5e/journey';
import { travelDaysOver } from '../rules/srd/travel';
import { TERRAIN_CODES, routeTerrain, type RoadGrid, type TerrainGrid } from './terrain';
import { WorldMap, milesLabel, rulerSummary, type MapPinItem } from './WorldMap';
import type { GazetteerPlace } from './gazetteer';
import { OpenEntityContext } from '../components/openEntity';

// Мили и дни в проверках — на фиксированном 0,5 мили на пиксель: калибровка паспорта уточняется отдельно (projection.test.ts).
const toril = { ...MAPS.toril, milesPerPixel: 0.5 };
const frame = { x0: 8300, y0: 2250, x1: 9200, y1: 3150 };
const pins: MapPinItem[] = [
  { id: 'nw', name: 'Neverwinter', type: 'location', icon: 'scale-settlement', x: 8522, y: 2610, count: 2, selected: true },
  { id: 'owl', name: 'Old Owl Well', type: 'location', icon: 'scale-building', x: 8700, y: 2668, pending: true },
  { id: 'far', name: 'Calimport', type: 'location', x: 14000, y: 9000 },
];

// Канвас jsdom не рисует (getContext глушит src/test-setup.ts) — гексы проверяются по наличию слоя.
// Указатель jsdom не знает: fireEvent.pointer* без PointerEvent теряет координаты — даём его поверх MouseEvent.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventShim extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal('PointerEvent', PointerEventShim);
  }
});

const ui = (onPin = vi.fn()) => {
  render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={pins} party={{ x: 8522, y: 2610, label: 'Партия' }} onPin={onPin} hexMiles={6} />);
  return { map: screen.getByRole('application', { name: 'Карта Toril' }), onPin };
};
const openLayers = () => fireEvent.click(screen.getByText('Слои'));

describe('WorldMap', () => {
  it('ошибка изображения в режиме игроков не раскрывает команды и пути установки', () => {
    const { container } = render(<WorldMap passport={toril} frame={frame} frameKey="missing" pins={[]} fog={{ explored: { circles: [], paths: [], sight: 1 }, forced: true }} />);
    const images = container.querySelectorAll<HTMLImageElement>('img[data-tile]');
    images.forEach(image => fireEvent.error(image));
    expect(screen.getByRole('status')).toHaveTextContent('Изображение карты Toril недоступно.');
    expect(container).not.toHaveTextContent('tile-map.py');
    expect(container).not.toHaveTextContent('.venv');
    expect(container).not.toHaveTextContent('content/maps');
  });

  it('тайлы — с сервера стола, только уровня под масштабом и подложки на два мельче', () => {
    const { map } = ui();
    const z = Number(map.dataset.zoom);
    const imgs = map.querySelectorAll<HTMLImageElement>('img[data-tile]');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.getAttribute('src')).toMatch(/^\/maps\/tiles\/toril\/\d+\/\d+_\d+\.webp$/);
      expect([z, Math.max(0, z - 2)]).toContain(Number(img.dataset.tile!.split('/')[0]));
    }
  });

  it('пины в окне — кнопки с именем, счётчиком и пометкой «ждёт решения»; дальний пин не рисуется', () => {
    const { map, onPin } = ui();
    const nw = within(map).getByRole('button', { name: /Neverwinter/ });
    expect(nw).toHaveAttribute('aria-current', 'true');
    expect(nw).toHaveTextContent('2');
    expect(within(map).getByRole('button', { name: /Old Owl Well/ })).toHaveAttribute('title', 'Место · Old Owl Well · ждёт решения');
    expect(map.querySelector('[data-pin="far"]')).toBeNull();
    fireEvent.click(nw);
    expect(onPin).toHaveBeenCalledWith('nw');
  });

  it('знак партии — не кнопка, подписан', () => {
    const { map } = ui();
    expect(within(map.querySelector('[data-part="party"]') as HTMLElement).getByRole('img', { name: 'Партия' })).toBeInTheDocument();
  });

  it('в походе показывает пеленг по карте от партии к выбранному пину', () => {
    const onGo = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={pins} party={{ x: 8522, y: 2610, label: 'Партия' }} travel={{ from: { x: 8522, y: 2610 }, onGo, wind: { strength: 'light', from: 'e' } }} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    fireEvent.click(within(map).getByRole('button', { name: 'Поход' }));
    fireEvent.click(within(map).getByRole('button', { name: /Old Owl Well/ }));
    const compass = within(map).getByRole('group', { name: 'Пеленг к цели: Old Owl Well' });
    expect(compass).toHaveTextContent('восток');
    expect(compass).toHaveTextContent('Old Owl Well · прямо по карте');
    expect(compass).toHaveTextContent('Ветер с востока');
  });

  it('кнопки «+» и «−» меняют уровень пирамиды; «Вписать» возвращает рамку', () => {
    const { map } = ui();
    const z0 = Number(map.dataset.zoom);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Отдалить' }));
    const out = Number(map.dataset.zoom);
    expect(out).toBeLessThan(z0);
    fireEvent.click(screen.getByRole('button', { name: 'Приблизить' }));
    expect(Number(map.dataset.zoom)).toBeGreaterThanOrEqual(out);
    fireEvent.click(screen.getByRole('button', { name: 'Вписать' }));
    expect(Number(map.dataset.zoom)).toBe(z0);
  });

  it('гексы по шесть миль: при рамке региона слишком мелкие — слоя нет, после приближения — есть', () => {
    const { map } = ui();
    openLayers();
    expect(map.querySelector('[data-part="hex"]')).toBeNull();
    const plus = screen.getByRole('button', { name: 'Приблизить' });
    for (let i = 0; i < 4; i++) fireEvent.click(plus);
    expect(map.querySelector('[data-part="hex"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Гексы' }));
    expect(map.querySelector('[data-part="hex"]')).toBeNull();
  });

  it('линейка: щелчки по карте ставят точки, путь — в милях и днях по темпу SRD; Esc стирает', () => {
    const { map } = ui();
    fireEvent.click(screen.getByRole('button', { name: 'Линейка' }));
    expect(map.querySelector('[data-part="ruler"]')).toHaveTextContent('Щелчками по карте отметьте путь');
    for (const [x, y] of [[100, 100], [400, 100]]) {
      fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: x, clientY: y });
      fireEvent.pointerUp(map, { button: 0, pointerId: 1, clientX: x, clientY: y });
    }
    expect(map.querySelector('[data-part="ruler"]')!.textContent).toMatch(/^[\d,]+ мил[ьяи]+ · дней пути: быстрый [\d,]+ · обычный [\d,]+ · медленный [\d,]+$/);
    expect(map.querySelectorAll('[data-part="ruler-path"] rect')).toHaveLength(2);
    fireEvent.keyDown(map, { key: 'Escape' });
    expect(map.querySelector('[data-part="ruler-path"]')).toBeNull();
  });

  it('сдвиг рукой — это не щелчок: точки линейки не ставит', () => {
    const { map } = ui();
    fireEvent.click(screen.getByRole('button', { name: 'Линейка' }));
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 180, clientY: 140 });
    fireEvent.pointerUp(map, { button: 0, pointerId: 1, clientX: 180, clientY: 140 });
    expect(map.querySelector('[data-part="ruler-path"]')).toBeNull();
  });
});

describe('поход', () => {
  it('кнопки «Поход» нет без travel (стол игроков)', () => {
    ui();
    expect(screen.queryByRole('button', { name: 'Поход' })).toBeNull();
  });

  it('путь от партии, пин — конец пути (а не переход); темп — кнопкой, маршрут уходит странице и режим закрывается', () => {
    const onGo = vi.fn();
    const onPin = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={pins} party={{ x: 8522, y: 2610, label: 'Партия' }} onPin={onPin} travel={{ from: { x: 8522, y: 2610 }, onGo }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поход' }));
    const panel = screen.getByRole('group', { name: 'Поход' });
    expect(panel).toHaveTextContent('Путь от партии — щелчками по карте, конец — пин места');
    fireEvent.click(screen.getByRole('button', { name: /Old Owl Well/ }));
    expect(onPin).not.toHaveBeenCalled();
    expect(panel).toHaveTextContent(/Партия → Old Owl Well · 93,6 мили/);
    fireEvent.click(within(panel).getByRole('button', { name: /^быстрый · 3,1 дн$/ }));
    expect(onGo).toHaveBeenCalledWith({ toId: 'owl', points: [{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }], miles: 93.6, pace: 'fast', days: 3.1 });
    expect(screen.queryByRole('group', { name: 'Поход' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Поход' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('трудная местность: дни на кнопках вдвое, маршрут помечен difficult', () => {
    const onGo = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} travel={{ from: { x: 8522, y: 2610 }, onGo }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поход' }));
    fireEvent.click(screen.getByRole('button', { name: /Old Owl Well/ }));
    const panel = screen.getByRole('group', { name: 'Поход' });
    fireEvent.click(within(panel).getByRole('checkbox', { name: /трудная местность/ }));
    fireEvent.click(within(panel).getByRole('button', { name: /^обычный · 7,8 дн$/ }));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ pace: 'normal', days: 7.8, difficult: true }));
  });
});

describe('поход по карте местности', () => {
  // Клетки по 8 px: к западу от x = 8611 равнина, к востоку — лес; путь Neverwinter → Old Owl Well пересекает границу.
  const W = 1100;
  const H = 340;
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = TERRAIN_CODES.indexOf(x * 8 >= 8611 ? 'f' : 'g');
  const grid: TerrainGrid = { w: W, h: H, cell: 8, data };
  const pts = [{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }];

  it('панель пишет мили по трудной местности, дни на кнопках — с ними; маршрут несёт difficultMiles', () => {
    const onGo = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} terrain={grid} travel={{ from: pts[0], onGo }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поход' }));
    fireEvent.click(screen.getByRole('button', { name: /Old Owl Well/ }));
    const panel = screen.getByRole('group', { name: 'Поход' });
    const rt = routeTerrain(grid, toril, pts);
    expect(rt.difficult).toBeGreaterThan(40);
    expect(panel.querySelector('[data-part="route-terrain"]')).toHaveTextContent(/^трудная местность: \d+(,\d)? мил[ьи] \(лес \d+\)$/);
    const days = travelDaysOver(93.6, rt.difficult, 'normal');
    fireEvent.click(within(panel).getByRole('button', { name: new RegExp(`^обычный · ${String(days).replace('.', ',')} дн$`) }));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ pace: 'normal', days, difficultMiles: Math.round(rt.difficult * 10) / 10 }));
    expect(onGo.mock.calls[0][0].difficult).toBeUndefined();
  });

  it('поход по A5E: регионы пути с DC по уровню, припасы на путь; «встреча» зовёт страницу с регионом', async () => {
    await loadJourney(); // данные похода — отдельный кусок (ROADMAP 0.5); стол грузит их после первой отрисовки
    const onEncounter = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} terrain={grid} travel={{ from: pts[0], onGo: vi.fn(), journey: { tier: 2, members: 4, onEncounter } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поход' }));
    fireEvent.click(screen.getByRole('button', { name: /Old Owl Well/ }));
    const legs = document.querySelector('[data-part="journey"]')!;
    expect(legs).toHaveTextContent(/Tangled Forest · \d+(,\d)? мил[ьи] · DC 14/);
    expect(legs).toHaveTextContent(/Rolling Grasslands · \d+(,\d)? мил[ьи] · DC 14/);
    expect(legs).toHaveTextContent('A5E SRD §14: мастер обычно задаёт хотя бы одну встречу в каждом регионе; количество и подходящий тип остаются решением мастера.');
    expect(legs).toHaveTextContent(/припасы обычным темпом: \d+/);
    const forest = [...legs.children].find(c => c.textContent?.startsWith('Tangled Forest')) as HTMLElement;
    const encounter = within(forest).getByRole('button', { name: 'встреча' });
    expect(encounter).toHaveAttribute('title', expect.stringContaining('хотя бы одна встреча на регион'));
    fireEvent.click(encounter);
    expect(onEncounter).toHaveBeenCalledWith('tangled-forest');
  });

  it('линейка с местностью: «трудная N (лес N)» и дни уже с ней', () => {
    const rt = routeTerrain(grid, toril, pts);
    expect(rulerSummary(93.6, rt)).toMatch(/^93,6 мили · трудная \d+ \(лес \d+\) · дней пути: быстрый /);
  });
});

describe('поход: дороги, поселения, Подземье (ROADMAP 6.3)', () => {
  // Равнина; дорога — прямая Neverwinter → Old Owl Well по клеткам 4 px; Neverwinter — город справочника.
  const W = 1100;
  const H = 340;
  const grid: TerrainGrid = { w: W, h: H, cell: 8, data: new Uint8Array(W * H).fill(TERRAIN_CODES.indexOf('f')) };
  const roads: RoadGrid = { w: 2200, h: 680, cell: 4, data: new Uint8Array(2200 * 680) };
  const [a, b] = [{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }];
  for (let t = 0; t <= 1; t += 0.002) roads.data[Math.floor((a.y + (b.y - a.y) * t) / 4) * 2200 + Math.floor((a.x + (b.x - a.x) * t) / 4)] = 1;
  const gazetteer: GazetteerPlace[] = [{ id: 'g-nw', name: 'Neverwinter', kind: 'City', x: 8522, y: 2610 }];
  const underdark = [{ id: 'nd', name: 'Northdark', kind: 'Domain', rings: [[8000, 2000, 9000, 2000, 9000, 3000, 8000, 3000]] }];

  it('по дороге — Open Roads, быстрее на милю в час; город на старте — Urban Township; под землёй — Underland Realm', async () => {
    await loadJourney();
    const onGo = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} terrain={grid} roads={roads} gazetteer={gazetteer} underdark={underdark}
      travel={{ from: a, onGo, journey: { tier: 1, members: 4, onEncounter: vi.fn() } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поход' }));
    fireEvent.click(screen.getByRole('button', { name: /Old Owl Well/ }));
    const panel = screen.getByRole('group', { name: 'Поход' });
    expect(panel.querySelector('[data-part="route-road"]')).toHaveTextContent(/^по дороге: \d+(,\d)? мил[ьи] — на милю в час быстрее$/);
    expect(panel.querySelector('[data-part="route-terrain"]')).toHaveTextContent('трудной местности на пути нет');
    const legs = panel.querySelector('[data-part="journey"]')!;
    expect(legs).toHaveTextContent(/Open Roads · \d+(,\d)? мил[ьи] · DC 12/);
    expect(legs).toHaveTextContent(/Urban Township · 2 мили · DC 12/);
    expect(legs).not.toHaveTextContent('Tangled Forest');
    // 93,6 мили: 2 по городу, остальное — дорогой, 32 мили в день обычным темпом.
    const days = Math.round(((2 + (93.6 - 2) * 0.75) / 24) * 10) / 10;
    expect(within(panel).getByRole('button', { name: new RegExp(`^обычный · ${String(days).replace('.', ',')} дн$`) })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('checkbox', { name: 'под землёй — Underland Realm' }));
    expect(panel.querySelector('[data-part="route-road"]')).toBeNull();
    expect(panel.querySelector('[data-part="route-underdark"]')).toHaveTextContent('под путём: Northdark');
    expect([...panel.querySelector('[data-part="journey"]')!.children].filter(c => c.getAttribute('data-part') !== 'encounter-recommendation').map(c => c.textContent?.split(' · ')[0])).toEqual(['Underland Realm', expect.stringMatching(/^припасы/)]);
    fireEvent.click(within(panel).getByRole('button', { name: /^обычный · 3,9 дн$/ }));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ days: 3.9 }));
    expect(onGo.mock.calls[0][0].difficultMiles).toBeUndefined();
  });

  it('линейка с дорогой: «по дороге N», дни уже с ней', () => {
    const rt = routeTerrain(grid, toril, [a, b], { roads });
    expect(rulerSummary(93.6, rt)).toMatch(/^93,6 мили · по дороге 94 · дней пути: быстрый 2,5 · обычный 2,9 · медленный 3,5$/);
  });
});

describe('слои карты: опасность и погода (ROADMAP 6.4)', () => {
  // Окно у Neverwinter: на западе — море, восток — лес.
  const W = 1300;
  const H = 400;
  const grid: TerrainGrid = { w: W, h: H, cell: 8, data: new Uint8Array(W * H).map((_, i) => TERRAIN_CODES.indexOf((i % W) * 8 >= 8560 ? 'f' : 'o')) };
  const wolfPins: MapPinItem[] = [{ ...pins[1], id: 'wood', name: 'Neverwinter Wood', encounters: [{ key: 'Werewolf', weight: 1, pending: 2 }] }];

  it('мастеру: «Опасность» — регионы окна с уровнем и DC, «встреча» по региону, веса встреч на пине; «Погода» — бросок дня или «бросить»', async () => {
    await loadJourney();
    const onEncounter = vi.fn();
    const onRoll = vi.fn();
    const today = new Map([['tangled-forest', { roll: 12, winter: false, weather: 'overcast', hidden: false }]]);
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={wolfPins} terrain={grid}
      layers={{ danger: { tier: 1, onEncounter }, weather: { today, onRoll } }} />);
    expect(document.querySelector('[data-part="pin-danger"]')).toBeNull();
    openLayers();
    fireEvent.click(screen.getByRole('button', { name: 'Опасность' }));
    const danger = await screen.findByRole('group', { name: 'Опасность' });
    expect(danger).toHaveTextContent('Опасность · уровень 1 · DC занятий 12');
    expect([...danger.querySelectorAll('[data-region]')].map(r => r.getAttribute('data-region')).sort()).toEqual(['restless-sea', 'tangled-forest']);
    fireEvent.click(within(danger.querySelector('[data-region="tangled-forest"]') as HTMLElement).getByRole('button', { name: 'встреча' }));
    expect(onEncounter).toHaveBeenCalledWith('tangled-forest');
    const badge = document.querySelector('[data-pin="wood"] [data-part="pin-danger"]')!;
    expect(badge).toHaveTextContent('×1→2');
    expect(badge).toHaveAttribute('title', 'Встречи: Werewolf ×1 → ×2 (ждёт)');

    fireEvent.click(screen.getByRole('button', { name: 'Погода' }));
    expect(screen.queryByRole('group', { name: 'Опасность' })).toBeNull();
    const weather = screen.getByRole('group', { name: 'Погода' });
    expect(weather.querySelector('[data-region="tangled-forest"]')).toHaveTextContent('overcast');
    fireEvent.click(within(weather.querySelector('[data-region="restless-sea"]') as HTMLElement).getByRole('button', { name: 'бросить' }));
    expect(onRoll).toHaveBeenCalledWith('restless-sea');
    expect(document.querySelector('[data-part="pin-danger"]')).toBeNull();
  });

  it('игрокам: опасности нет, погода — без кнопки броска и только под открытым туманом', async () => {
    await loadJourney();
    const explored = { circles: [{ x: 8700, y: 2668, r: 30 }], paths: [], sight: 30 };
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} terrain={grid} fog={{ explored, forced: true }}
      layers={{ weather: { today: new Map() } }} />);
    expect(screen.queryByRole('button', { name: 'Опасность' })).toBeNull();
    openLayers();
    fireEvent.click(screen.getByRole('button', { name: 'Погода' }));
    const weather = await screen.findByRole('group', { name: 'Погода' });
    expect([...weather.querySelectorAll('[data-region]')].map(r => r.getAttribute('data-region'))).toEqual(['tangled-forest']);
    expect(weather).toHaveTextContent('не брошено');
    expect(within(weather).queryByRole('button')).toBeNull();
  });
});

describe('туман знаний и факты', () => {
  const explored = { circles: [{ x: 8522, y: 2610, r: 24 }], paths: [[{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }]], sight: 24 };

  it('стол игроков: туман всегда, кнопки нет; прорези — круг и коридор пути', () => {
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} fog={{ explored, forced: true }} />);
    const fog = document.querySelector('[data-part="fog"]')!;
    expect(fog).toHaveAttribute('data-forced', 'true');
    expect(fog.querySelectorAll('mask circle')).toHaveLength(1);
    expect(fog.querySelectorAll('mask polyline')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Туман' })).toBeNull();
  });

  it('у мастера туман — слой по кнопке', () => {
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={pins} fog={{ explored, forced: false }} />);
    expect(document.querySelector('[data-part="fog"]')).toBeNull();
    openLayers();
    fireEvent.click(screen.getByRole('button', { name: 'Туман' }));
    expect(document.querySelector('[data-part="fog"]')).not.toBeNull();
  });

  it('факты на пине: секрет — перечёркнутый глаз с текстом в подписи, открытое — слух', () => {
    const withFacts: MapPinItem[] = [{ ...pins[0], facts: [{ id: 'f1', text: 'Агент Zhentarim у ворот', secret: true }, { id: 'f2', text: 'Ворота чинят', secret: false }] }];
    render(<WorldMap passport={toril} frame={frame} frameKey="k" pins={withFacts} />);
    const pin = screen.getByRole('button', { name: /Neverwinter/ });
    expect(within(pin).getByRole('img', { name: 'Секрет мастера: Агент Zhentarim у ворот' })).toBeInTheDocument();
    expect(within(pin).getByRole('img', { name: 'Известно игрокам: Ворота чинят' })).toBeInTheDocument();
  });
});

describe('подписи миль', () => {
  it('склонение и дробные мили', () => {
    expect(milesLabel(1)).toBe('1 миля');
    expect(milesLabel(3)).toBe('3 мили');
    expect(milesLabel(11)).toBe('11 миль');
    expect(milesLabel(22)).toBe('22 мили');
    expect(milesLabel(100)).toBe('100 миль');
    expect(milesLabel(2.5)).toBe('2,5 мили');
  });

  it('путь в 72 мили — три дня обычным темпом', () => {
    expect(rulerSummary(72)).toBe('72 мили · дней пути: быстрый 2,4 · обычный 3 · медленный 4');
  });
});

describe('справочник мест (M12)', () => {
  const gazetteer: GazetteerPlace[] = [
    { id: 'pt', name: 'Port Llast', nameRu: 'Порт Ласт', kind: 'Town', x: 8750, y: 2700, sources: ['Toril GIS', 'https://forgottenrealms.fandom.com/wiki/Port_Llast'],
      card: { what: 'Портовый городок на Sword Coast.', ruler: 'совет', summary: 'Городок каменотёсов к югу от Neverwinter.' } },
    { id: 'lr', name: 'Leilon', kind: 'Town', x: 14000, y: 9000 },
    { id: 'kw', name: 'Kryptgarden Forest', kind: 'Temperate Forest', x: 8900, y: 3000, approx: true, sources: ['https://forgottenrealms.fandom.com/wiki/Kryptgarden_Forest'],
      card: { what: 'Старый лес, где живёт зелёный дракон.', danger: 'Claugiyliamatar.' } },
  ];
  const withGaz = () => {
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={[]} gazetteer={gazetteer} />);
    return screen.getByRole('application', { name: 'Карта Toril' });
  };

  it('без справочника (стол игроков) поиска нет', () => {
    ui();
    expect(screen.queryByRole('searchbox', { name: 'Найти место' })).toBeNull();
  });

  it('поиск по латинице и русскому имени GIS; Enter ведёт карту к месту и открывает карточку с источниками', () => {
    const map = withGaz();
    const box = screen.getByRole('searchbox', { name: 'Найти место' });
    fireEvent.change(box, { target: { value: 'порт' } });
    expect(screen.getByRole('listbox', { name: 'Найденные места' })).toHaveTextContent('Port Llast');
    fireEvent.change(box, { target: { value: 'lla' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const info = map.querySelector('[data-part="place-info"]')!;
    expect(info).toHaveTextContent('Port Llast');
    expect(info).toHaveTextContent('городок');
    expect(info).toHaveTextContent('Правит: совет');
    expect(within(info as HTMLElement).getByRole('link', { name: 'Forgotten Realms Wiki · CC BY-SA' })).toHaveAttribute('href', 'https://forgottenrealms.fandom.com/wiki/Port_Llast');
    expect(info).toHaveTextContent('Toril GIS');
    // Карта вписала место: отметка — в середине окна 960×540.
    expect(map.querySelector<HTMLElement>('[data-part="found"]')!.style).toMatchObject({ left: '480px', top: '270px' });
    expect(box).toHaveValue('');
    fireEvent.keyDown(map, { key: 'Escape' });
    expect(map.querySelector('[data-part="place-info"]')).toBeNull();
  });

  it('«Карточка» (ROADMAP 0.3): карточка места под щелчком открывает общую карточку place:id; без входа страницы кнопки нет', () => {
    const open = vi.fn();
    render(<OpenEntityContext.Provider value={open}><WorldMap passport={toril} frame={frame} frameKey="region:card" pins={[]} gazetteer={gazetteer} /></OpenEntityContext.Provider>);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    fireEvent.click(map.querySelector<HTMLElement>('[data-place="pt"]')!);
    fireEvent.click(within(map.querySelector<HTMLElement>('[data-part="place-info"]')!).getByRole('button', { name: 'Карточка' }));
    expect(open).toHaveBeenCalledWith('place:pt');
    cleanup();
    const plain = withGaz();
    fireEvent.click(plain.querySelector<HTMLElement>('[data-place="pt"]')!);
    expect(within(plain.querySelector<HTMLElement>('[data-part="place-info"]')!).queryByRole('button', { name: 'Карточка' })).toBeNull();
  });

  it('«Сейчас здесь» (Д2): кнопка в карточке места под щелчком отдаёт id места; без колбэка кнопки нет', () => {
    const onScene = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={[]} gazetteer={gazetteer} onScene={onScene} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    fireEvent.click(map.querySelector<HTMLElement>('[data-place="pt"]')!);
    fireEvent.click(within(map.querySelector<HTMLElement>('[data-part="place-info"]')!).getByRole('button', { name: 'Сейчас здесь' }));
    expect(onScene).toHaveBeenCalledWith('pt');
    cleanup();
    const plain = withGaz();
    fireEvent.click(plain.querySelector<HTMLElement>('[data-place="pt"]')!);
    expect(within(plain.querySelector<HTMLElement>('[data-part="place-info"]')!).queryByRole('button', { name: 'Сейчас здесь' })).toBeNull();
  });

  it('слой «Справочник» (29.10): маркеры мест с карточкой, полый — позиция по GIS; щелчок — карточка; кнопка и линейка прячут', () => {
    const map = withGaz();
    openLayers();
    const marks = () => [...map.querySelectorAll<HTMLElement>('[data-place]')];
    // Leilon без карточки и вне окна — не рисуется; Port Llast — на значке растра, Kryptgarden — позиция по GIS.
    expect(marks().map(m => m.dataset.place)).toEqual(['pt', 'kw']);
    expect(marks()[0]).toHaveAccessibleName('Port Llast · городок · карточка справочника');
    expect(marks()[1]).toHaveAttribute('data-approx', 'true');
    expect(marks()[1]).toHaveAttribute('title', expect.stringMatching(/^Kryptgarden Forest · .* · позиция по GIS: значок на растре не найден$/));
    fireEvent.click(marks()[1]);
    expect(map.querySelector('[data-part="place-info"]')).toHaveTextContent('Kryptgarden Forest');
    const toggle = screen.getByRole('button', { name: 'Справочник' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(marks()).toHaveLength(0);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Линейка' }));
    expect(marks()).toHaveLength(0);
  });

  it('события года канона (Х3): отметка у места с числом и строками в подсказке; щелчок — карточка места; без справочника — нет', () => {
    const marks = { year: 1479, places: new Map([['kw', ['Hillborn Dwarves recapture the Fireguard Fortress.', 'Much of the Dread Ring is destroyed.']], ['lr', ['far away']]]) };
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={[]} gazetteer={gazetteer} eventMarks={marks} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    const mark = map.querySelector<HTMLElement>('[data-event-mark="kw"]')!;
    expect(mark).toHaveAccessibleName('Kryptgarden Forest: события 1479 DR — 2');
    expect(mark).toHaveAttribute('title', expect.stringContaining('Hillborn Dwarves recapture the Fireguard Fortress.'));
    // Leilon вне окна — отметки нет.
    expect(map.querySelector('[data-event-mark="lr"]')).toBeNull();
    fireEvent.click(mark);
    expect(map.querySelector('[data-part="place-info"]')).toHaveTextContent('Kryptgarden Forest');
  });

  it('без справочника (стол игроков: LevelZone не отдаёт его) — ни отметок событий, ни слоя', () => {
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={[]} eventMarks={{ year: 1479, places: new Map([['kw', ['x']]]) }} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    expect(map.querySelector('[data-event-mark], [data-place]')).toBeNull();
  });

  it('щелчок по значку — карточка ближайшего места; мимо — карточка закрывается; сдвиг — не щелчок', () => {
    const map = withGaz();
    // Центр рамки (8750, 2700) — середина окна 960×540.
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 482, clientY: 268 });
    fireEvent.pointerUp(map, { button: 0, pointerId: 1, clientX: 482, clientY: 268 });
    expect(map.querySelector('[data-part="place-info"]')).toHaveTextContent('Port Llast');
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(map, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    expect(map.querySelector('[data-part="place-info"]')).toBeNull();
  });

  it('новое место (M8): «Место», щелчок по значку — имя и уровень из справочника; мимо — пустое имя и «Предложить» недоступно; Enter отдаёт черновик', () => {
    const onPropose = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={[]} gazetteer={gazetteer} newPlace={{ scales: ['region', 'settlement', 'building'], scaleLabel: s => s, onPropose }} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    const click = (x: number, y: number) => {
      fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: x, clientY: y });
      fireEvent.pointerUp(map, { button: 0, pointerId: 1, clientX: x, clientY: y });
    };
    fireEvent.click(screen.getByRole('button', { name: 'Место' }));
    const form = screen.getByRole('group', { name: 'Новое место' });
    expect(form).toHaveTextContent('Щелчок по карте — точка нового места');
    click(482, 268);
    expect(within(form).getByRole('textbox', { name: 'Имя места' })).toHaveValue('Port Llast');
    expect(within(form).getByRole('combobox', { name: 'Уровень места' })).toHaveValue('settlement');
    expect(map.querySelector('[data-part="place-info"]')).toBeNull();
    click(100, 100);
    const name = within(form).getByRole('textbox', { name: 'Имя места' });
    // Имя сохраняется между точками — мастер поправил точку, а не имя.
    expect(name).toHaveValue('Port Llast');
    fireEvent.change(name, { target: { value: '' } });
    expect(within(form).getByRole('button', { name: 'Предложить' })).toBeDisabled();
    fireEvent.change(name, { target: { value: "  Helm's Hold " } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Уровень места' }), { target: { value: 'building' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onPropose).toHaveBeenCalledWith(expect.objectContaining({ name: "Helm's Hold", scale: 'building' }));
    expect(onPropose.mock.calls[0][0].gazetteerId).toBeUndefined();
    expect(screen.queryByRole('group', { name: 'Новое место' })).toBeNull();
  });

  it('место без описания и место по предсказанию GIS подписаны', () => {
    const map = withGaz();
    const box = screen.getByRole('searchbox', { name: 'Найти место' });
    fireEvent.change(box, { target: { value: 'leilon' } });
    expect(screen.getByRole('listbox')).toHaveTextContent('без описания');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(map.querySelector('[data-part="place-info"]')).toHaveTextContent('Описания нет: только имя и класс из Toril GIS');
    fireEvent.change(box, { target: { value: 'krypt' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const info = map.querySelector('[data-part="place-info"]')!;
    expect(info).toHaveTextContent('Позиция по Toril GIS: на растре место не подписано');
    // Место не в середине рамки — карта сдвинулась к нему.
    expect(map.querySelector<HTMLElement>('[data-part="found"]')!.style).toMatchObject({ left: '480px', top: '270px' });
    expect(info).toHaveTextContent('Опасность: Claugiyliamatar.');
    expect(info).not.toHaveTextContent('Toril GIS ·');
  });

  it('схема (M16): карта открывается схемой без тайлов, «Карта» — растр, «Схема» — обратно; без схемы переключателя нет', async () => {
    const schema = { land: [[8300, 2250, 9200, 2250, 9200, 3150, 8300, 3150]], regions: { f: [[8400, 2400, 8600, 2400, 8600, 2600]] }, roads: [[8400, 2600, 8700, 2668]] };
    const { unmount } = render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={pins} schema={schema} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    const look = within(map).getByRole('group', { name: 'Вид карты' });
    expect(within(look).getByRole('button', { name: 'Схема' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(map.querySelector('[data-part="schema"]')).toHaveAttribute('data-renderer', 'canvas'));
    // Без WebGL2 (jsdom) подложка — Canvas2D, канвас WebGL2 спрятан (M18).
    expect(map.querySelector('[data-part="schema"]')).toHaveAttribute('data-renderer', 'canvas');
    expect(map.querySelector('[data-part="schema-gl"]')).toHaveAttribute('hidden');
    expect(map.querySelectorAll('[data-tile]')).toHaveLength(0);
    const pinPosition = map.querySelector<HTMLElement>('[data-pin="nw"]')!.getAttribute('style');
    // Легенда схемы — только то, что в схеме есть: равнина (подложка), лес, вода, берег, дорога; гор нет.
    expect(within(map).queryByRole('list', { name: 'Легенда схемы' })).toBeNull();
    fireEvent.click(within(map).getByRole('button', { name: 'Легенда' }));
    const legend = within(map).getByRole('list', { name: 'Легенда схемы' });
    expect(within(legend).getAllByRole('listitem').map(li => li.textContent)).toEqual(['равнина', 'лес', 'вода', 'берег', 'дорога']);
    fireEvent.click(within(map).getByRole('button', { name: 'Легенда' }));
    expect(within(map).queryByRole('list', { name: 'Легенда схемы' })).toBeNull();
    fireEvent.click(within(look).getByRole('button', { name: 'Карта' }));
    expect(map.querySelector('[data-part="schema"]')).toBeNull();
    expect(map.querySelectorAll('[data-tile]').length).toBeGreaterThan(0);
    expect(map.querySelector<HTMLElement>('[data-pin="nw"]')!.getAttribute('style')).toBe(pinPosition);
    fireEvent.click(within(look).getByRole('button', { name: 'Схема' }));
    expect(map.querySelectorAll('[data-tile]')).toHaveLength(0);
    expect(map.querySelector<HTMLElement>('[data-pin="nw"]')!.getAttribute('style')).toBe(pinPosition);
    unmount();
    const { map: plain } = ui();
    expect(within(plain).queryByRole('group', { name: 'Вид карты' })).toBeNull();
  });

  it('второстепенные слои свёрнуты; поиск, линейка и поход остаются в основной панели', () => {
    const onGo = vi.fn();
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={pins} gazetteer={[{ id: 'nw', name: 'Neverwinter', kind: 'City', x: 8522, y: 2610 }]} travel={{ from: { x: 8522, y: 2610 }, onGo }} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    expect(map.querySelector('[data-part="map-layers"]')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Линейка' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поход' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Приблизить' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Найти место' })).toBeInTheDocument();
  });

  it('shows an accepted war route as a separate toggleable map layer', () => {
    const { container } = render(<WorldMap passport={toril} frame={frame} frameKey="war-front" pins={[]}
      warFronts={[{ id: 'war-cormyr-luskan', label: 'Cormyr — Luskan', nodes: [
        { id: 'suzail', name: 'Suzail', x: 8522, y: 2610 }, { id: 'front-town', name: 'Front Town', x: 8600, y: 2670 },
      ] }]} />);
    const toggle = screen.getByRole('button', { name: 'Фронты' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-part="war-fronts"]')).toBeNull();
    fireEvent.click(toggle);
    const overlay = container.querySelector<SVGSVGElement>('[data-part="war-fronts"]');
    expect(overlay).toHaveAttribute('aria-label', 'Маршруты фронтов войны: Cormyr — Luskan');
    expect(overlay?.querySelector('[data-war-process="war-cormyr-luskan"]')).toBeInTheDocument();
    expect(overlay?.querySelectorAll('polyline')).toHaveLength(2);
    expect(overlay?.querySelector('title')).toHaveTextContent('Маршрут фронта войны: Cormyr — Luskan');
    fireEvent.click(toggle);
    expect(container.querySelector('[data-part="war-fronts"]')).toBeNull();
  });

  it('shows active process markers only after opening the map layer', () => {
    const { container } = render(<WorldMap passport={toril} frame={frame} frameKey="processes" pins={[]}
      processMarkers={[{ locationId: 'loc-neverwinter', locationName: 'Neverwinter', x: 8522, y: 2610, labels: ['Голод', 'Восстание'] }]} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    const toggle = within(map).getByRole('button', { name: 'Процессы' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-part="map-processes"]')).toBeNull();
    fireEvent.click(toggle);
    const overlay = container.querySelector<SVGSVGElement>('[data-part="map-processes"]');
    expect(overlay).toHaveAttribute('aria-label', 'Активные процессы на карте: Neverwinter: Голод, Восстание');
    expect(overlay?.querySelector('[data-process-location="loc-neverwinter"] title')).toHaveTextContent('Neverwinter: Голод; Восстание');
    expect(overlay?.querySelector('[data-process-location="loc-neverwinter"] text')).toHaveTextContent('2');
    fireEvent.click(toggle);
    expect(container.querySelector('[data-part="map-processes"]')).toBeNull();
  });

  it('панель инструментов карты закреплена вертикально у края, а меню слоёв раскрывается внутри неё', () => {
    render(<WorldMap passport={toril} frame={frame} frameKey="region:scn" pins={pins} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    const toolbar = within(map).getByRole('toolbar', { name: 'Карта' });
    expect(toolbar.className).toContain('right-16');
    expect(toolbar.className).toContain('max-w-[calc(100%-5.5rem)]');
    expect(toolbar.className).toContain('bottom-3');
    expect(toolbar.className).toContain('flex-col');
    expect(toolbar.className).toContain('overflow-y-auto');
    fireEvent.click(within(toolbar).getByText('Слои'));
    const menu = toolbar.querySelector<HTMLElement>('[data-part="map-layer-menu"]')!;
    expect(menu).toBeVisible();
    expect(menu.className).toContain('flex-col');
    expect(menu.style.position).toBe('');
  });

  it('колесо дальше целой карты — onZoomOut (с плоской карты планеты — на глобус, M16); старт с глобуса — заданный вид', () => {
    const onZoomOut = vi.fn();
    const whole = { x0: 0, y0: 0, x1: toril.width, y1: toril.height };
    const { unmount } = render(<WorldMap passport={toril} frame={whole} frameKey="planet" pins={[]} onZoomOut={onZoomOut} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    fireEvent.wheel(map, { deltaY: 100 });
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    unmount();
    render(<WorldMap passport={toril} frame={whole} frameKey="planet" pins={[]} start={{ x: 8522, y: 2610, scale: 0.2 }} onZoomOut={onZoomOut} />);
    const started = screen.getByRole('application', { name: 'Карта Toril' });
    fireEvent.wheel(started, { deltaY: 100 });
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it('принимает старт глобуса на высокой широте без зажатия центра карты', () => {
    const reports: { x: number; y: number; scale: number }[] = [];
    const start = { x: 8200, y: 1169, scale: 0.025 };
    render(<WorldMap passport={toril} frame={frame} frameKey="planet-start" pins={[]} start={start} onZoomOut={vi.fn()} onViewChange={v => reports.push(v)} />);
    expect(reports.at(-1)).toEqual(start);
    // При обычном clampView этот старт уезжает к центру растра (y≈6700) из-за высоты viewport/scale.
  });

  it('сохраняет планетный центр и масштаб при resize viewport', () => {
    const reports: { x: number; y: number; scale: number }[] = [];
    const start = { x: 8200, y: 1169, scale: 0.025 };
    let notifyResize = () => {};
    const previousObserver = globalThis.ResizeObserver;
    class ObserverStub {
      constructor(private readonly callback: ResizeObserverCallback) { notifyResize = () => this.callback([], this as unknown as ResizeObserver); }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ObserverStub);
    try {
      render(<WorldMap passport={toril} frame={frame} frameKey="planet-resize" pins={[]} start={start} onZoomOut={vi.fn()} onViewChange={v => reports.push(v)} />);
      const map = screen.getByRole('application', { name: 'Карта Toril' });
      Object.defineProperty(map, 'clientWidth', { configurable: true, value: 1280 });
      Object.defineProperty(map, 'clientHeight', { configurable: true, value: 720 });
      // Invoke the observed layout callback after changing the measured viewport dimensions.
      act(() => notifyResize());
      expect(reports.at(-1)).toEqual(start);
    } finally {
      vi.stubGlobal('ResizeObserver', previousObserver);
    }
  });

  it('не зажимает pan в planet mode и сохраняет старый bounded путь без onZoomOut', () => {
    const reports: { x: number; y: number; scale: number }[] = [];
    const start = { x: 100, y: 1169, scale: 0.025 };
    render(<WorldMap passport={toril} frame={frame} frameKey="planet-pan" pins={[]} start={start} onZoomOut={vi.fn()} onViewChange={v => reports.push(v)} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 200, clientY: 150 });
    expect(reports.at(-1)?.x).toBeCloseTo(-3900, 6);
    expect(reports.at(-1)?.y).toBeCloseTo(-831, 6);

    cleanup();
    const normalReports: { x: number; y: number; scale: number }[] = [];
    render(<WorldMap passport={toril} frame={frame} frameKey="bounded" pins={[]} start={start} onViewChange={v => normalReports.push(v)} />);
    expect(normalReports.at(-1)?.x).toBeCloseTo(toril.width / 2, 6);
    expect(normalReports.at(-1)?.y).toBeCloseTo(toril.height / 2, 6);
  });

  it('zooms about the screen-edge cursor for a planet camera', () => {
    const reports: { x: number; y: number; scale: number }[] = [];
    const start = { x: 100, y: 1169, scale: 0.05 };
    render(<WorldMap passport={toril} frame={frame} frameKey="planet-edge-zoom" pins={[]} start={start} onZoomOut={vi.fn()} onViewChange={v => reports.push(v)} />);
    const map = screen.getByRole('application', { name: 'Карта Toril' });
    const before = reports.at(-1)!;
    const anchor = { x: (0 - 960 / 2) / before.scale + before.x, y: (0 - 540 / 2) / before.scale + before.y };
    fireEvent.wheel(map, { deltaY: -100, clientX: 0, clientY: 0 });
    const after = reports.at(-1)!;
    expect(after.scale).toBeGreaterThan(before.scale);
    expect((0 - 960 / 2) / after.scale + after.x).toBeCloseTo(anchor.x, 6);
    expect((0 - 540 / 2) / after.scale + after.y).toBeCloseTo(anchor.y, 6);
  });

  it('keeps the globe-return wheel threshold reachable below the ordinary map minimum', () => {
    const onZoomOut = vi.fn();
    const start = { x: 8200, y: 1169, scale: 0.025 };
    render(<WorldMap passport={toril} frame={frame} frameKey="planet-min" pins={[]} start={start} onZoomOut={onZoomOut} />);
    fireEvent.wheel(screen.getByRole('application', { name: 'Карта Toril' }), { deltaY: 100 });
    expect(onZoomOut).toHaveBeenCalledWith(start);
  });
});
