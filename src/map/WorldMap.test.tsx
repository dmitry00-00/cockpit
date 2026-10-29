// Карта мира как компонент: тайлы видимого окна, пины-кнопки, знак партии, линейка с днями пути по SRD,
// гексы, кнопки приближения. В jsdom окно не измеряется — компонент берёт запасные 960×540.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MAPS } from './maps';
import { loadJourney } from '../rules/a5e/journey';
import { travelDaysOver } from '../rules/srd/travel';
import { TERRAIN_CODES, routeTerrain, type TerrainGrid } from './terrain';
import { WorldMap, milesLabel, rulerSummary, type MapPinItem } from './WorldMap';
import type { GazetteerPlace } from './gazetteer';

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

describe('WorldMap', () => {
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
    expect(legs).toHaveTextContent(/припасы обычным темпом: \d+/);
    const forest = [...legs.children].find(c => c.textContent?.startsWith('Tangled Forest')) as HTMLElement;
    fireEvent.click(within(forest).getByRole('button', { name: 'встреча' }));
    expect(onEncounter).toHaveBeenCalledWith('tangled-forest');
  });

  it('линейка с местностью: «трудная N (лес N)» и дни уже с ней', () => {
    const rt = routeTerrain(grid, toril, pts);
    expect(rulerSummary(93.6, rt)).toMatch(/^93,6 мили · трудная \d+ \(лес \d+\) · дней пути: быстрый /);
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

  it('слой «Справочник» (29.10): маркеры мест с карточкой, полый — позиция по GIS; щелчок — карточка; кнопка и линейка прячут', () => {
    const map = withGaz();
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
});
