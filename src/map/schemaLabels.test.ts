import { describe, expect, it } from 'vitest';
import labelsFile from '../../content/maps/toril-labels.json';
import { hitAt, LABEL_STYLE, labelHits, labelOrder, labelVisible, parseLabels, placeLabels, type LabelStyle, type SchemaLabel } from './schemaLabels';

const vp = { w: 1000, h: 600 };
// Мерка без канваса: ширина знака — половина кегля, разрядка — на каждый знак.
const measure = (t: string, s: LabelStyle) => t.length * (s.size * 0.5 + s.spacing);
const L = (name: string, kind: SchemaLabel['kind'], x: number, y: number, r = 0, rank = 9): SchemaLabel => ({ name, kind, x, y, r, rank });
// Вид 1:1 — пиксель исходника = пиксель экрана.
const flat = (scale = 1) => ({ project: (p: { x: number; y: number }) => ({ x: p.x * scale, y: p.y * scale }), scale, vp, measure });

describe('подписи схемы (M16): разбор', () => {
  it('строки [имя, вид, x, y, r, ранг]; битая строка — ошибка с номером', () => {
    expect(parseLabels({ labels: [['Cormyr', 'region', 10, 20, 30, 2]] })).toEqual([L('Cormyr', 'region', 10, 20, 30, 2)]);
    expect(() => parseLabels({ labels: [['Cormyr', 'kingdom', 10, 20, 30, 2]] })).toThrow(/строка 0/);
    expect(() => parseLabels({ labels: [['Cormyr', 'region', '10', 20, 30, 2]] })).toThrow(/строка 0/);
    expect(() => parseLabels({})).toThrow(/labels/);
  });

  it('файл Toril: державы GIS, моря, места справочника; у области r > 0, у места — 0; имя — одной подписью на город и область', () => {
    const all = parseLabels(labelsFile);
    const by = (name: string) => all.filter(l => l.name === name);
    for (const realm of ['Amn', 'Cormyr', 'Tethyr', 'Calimshan', 'Thay', 'Sembia']) expect(by(realm).map(l => l.kind)).toContain('region');
    expect(by('Sea of Swords').map(l => l.kind)).toEqual(['sea']);
    expect(by('Faerûn').map(l => l.kind)).toEqual(['continent']);
    expect(by('Neverwinter')).toEqual([expect.objectContaining({ kind: 'town', x: 8522, y: 2610, r: 0 })]);
    // Waterdeep — город, область GIS того же имени уступила ему подпись.
    expect(by('Waterdeep').map(l => l.kind)).toEqual(['city']);
    expect(all.filter(l => LABEL_STYLE[l.kind].fit !== undefined).every(l => l.r > 0)).toBe(true);
    // Amn — между Baldur's Gate и Calimport, как на растре.
    const amn = by('Amn')[0];
    expect(amn.y).toBeGreaterThan(3906);
    expect(amn.y).toBeLessThan(5800);
  });
});

describe('подписи схемы: отбор по масштабу', () => {
  it('область — пока подпись влезает в поперечник и область не шире окна', () => {
    const cormyr = L('Cormyr', 'region', 0, 0, 200);
    const w = measure('Cormyr', LABEL_STYLE.region);
    expect(labelVisible(cormyr, 0.01, w, vp)).toBe(false); // весь мир: Cormyr — точка
    expect(labelVisible(cormyr, 0.2, w, vp)).toBe(true); // континент
    expect(labelVisible(cormyr, 20, w, vp)).toBe(false); // внутри Cormyr: имя не о том, что видно
  });

  it('место — по порогу масштаба своего вида: город раньше городка, городок раньше урочища', () => {
    const at = (kind: SchemaLabel['kind'], scale: number) => labelVisible(L('X', kind, 0, 0), scale, 10, vp);
    expect([at('city', 0.1), at('town', 0.1), at('site', 0.1)]).toEqual([true, false, false]);
    expect([at('city', 0.5), at('town', 0.5), at('site', 0.5)]).toEqual([true, true, false]);
    expect(at('site', 1)).toBe(true);
    expect(at('realm', 2)).toBe(false); // держава точкой — только издалека
  });

  it('очередь: континент, океан, держава, море, город, …; внутри вида — крупнее и по рангу', () => {
    const list = [L('b', 'town', 0, 0, 0, 4), L('a', 'city', 0, 0, 0, 3), L('S', 'sea', 0, 0, 5), L('C', 'continent', 0, 0, 9), L('R1', 'region', 0, 0, 10), L('R2', 'region', 0, 0, 50)];
    expect([...list].sort(labelOrder).map(l => l.name)).toEqual(['C', 'R2', 'R1', 'S', 'a', 'b']);
  });
});

describe('подписи схемы: раскладка без наложений', () => {
  it('город занимает место раньше городка; городок рядом уходит на свободную сторону точки или пропадает', () => {
    const placed = placeLabels([L('Townton', 'town', 490, 300), L('Big City', 'city', 505, 300)], flat());
    expect(placed.map(p => p.label.name)).toEqual(['Big City', 'Townton']);
    const [city, town] = placed;
    // Город — справа от точки, городок — слева (справа занято точкой города).
    expect(city.x).toBeGreaterThan(505);
    expect(town.x + town.width).toBeLessThan(490);
    // Точка вплотную к точке города — подписи нет вовсе.
    expect(placeLabels([L('Big City', 'city', 505, 300), L('Touching', 'town', 501, 300)], flat()).map(p => p.label.name)).toEqual(['Big City']);
    const boxes = placed.map(p => p.box);
    expect(boxes[0].x1 <= boxes[1].x0 || boxes[1].x1 <= boxes[0].x0 || boxes[0].y1 <= boxes[1].y0 || boxes[1].y1 <= boxes[0].y0).toBe(true);
  });

  it('подписи не налезают друг на друга при плотной россыпи', () => {
    const many = Array.from({ length: 60 }, (_, i) => L(`Place ${i}`, 'city', 400 + (i % 10) * 12, 250 + Math.floor(i / 10) * 9));
    const placed = placeLabels(many, flat());
    expect(placed.length).toBeGreaterThan(3);
    expect(placed.length).toBeLessThan(60);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i].box, b = placed[j].box;
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
      }
    }
  });

  it('плашка пина кампании занята, имя пина схема не повторяет; вне окна — не подписывается', () => {
    // Плашка пина над точкой (300, 200) — как в WorldMap: над точкой, иконка и имя.
    const plate = { x0: 230, y0: 166, x1: 370, y1: 206 };
    const placed = placeLabels(
      [L('Neverwinter', 'city', 300, 200), L('Under Pin', 'city', 300, 180), L('Far Away', 'city', 5000, 200), L('Free', 'city', 700, 400)],
      { ...flat(), avoid: [plate], skip: new Set(['neverwinter']) },
    );
    expect(placed.map(p => p.label.name)).toEqual(['Free']);
  });

  it('одно имя — одна подпись рядом (область и лес Chondalwood); то же имя далеко — своя подпись', () => {
    const placed = placeLabels(
      [L('Chondalwood', 'region', 300, 300, 120), L('Chondalwood', 'forest', 420, 330, 100), L('Tran', 'town', 100, 100), L('Tran', 'town', 900, 500)],
      flat(),
    );
    expect(placed.filter(p => p.label.name === 'Chondalwood')).toHaveLength(1);
    expect(placed.filter(p => p.label.name === 'Tran')).toHaveLength(2);
  });

  it('файл Toril: ни одной подписи за краем карты и ни одного имени дважды ближе 300 px исходника', () => {
    const all = parseLabels(labelsFile);
    expect(all.filter(l => l.x < 0 || l.y < 0 || l.x > 30600 || l.y > 13400)).toEqual([]);
    const close = all.filter((a, i) => all.some((b, j) => j > i && a.name === b.name && Math.hypot(a.x - b.x, a.y - b.y) < 300));
    expect(close.map(l => l.name)).toEqual([]);
  });

  it('область — по центру, без точки', () => {
    const [p] = placeLabels([L('Amn', 'region', 500, 300, 150)], flat(0.5));
    expect(p.dot).toBeUndefined();
    expect(p.x + p.width / 2).toBeCloseTo(250);
    expect(p.y).toBe(150);
  });

  it('щелчок: область с карточкой ловится по своей плашке, место с точкой и область без карточки — нет', () => {
    const placed = placeLabels([L('Cormyr', 'region', 400, 300, 150), L('Arabel', 'city', 100, 100), L('Bandit Wastes', 'region', 1600, 300, 150)], flat(0.5));
    expect(placed).toHaveLength(3);
    const refs = new Map([['cormyr', 'kingdom:cormyr'], ['arabel', 'kingdom:arabel'], ['nowhere', 'kingdom:nowhere']] as const);
    const hits = labelHits(placed, refs);
    expect(hits.map(h => h.ref)).toEqual(['kingdom:cormyr']);
    expect(hitAt(hits, { x: 200, y: 150 })?.name).toBe('Cormyr');
    expect(hitAt(hits, { x: 200, y: 190 })).toBeUndefined();
  });
});
