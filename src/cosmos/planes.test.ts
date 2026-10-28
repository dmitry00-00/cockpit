// Великое колесо: данные из карточек планов вики и место плана на кольце по его мировоззрению.
import { describe, expect, it } from 'vitest';
import { GREAT_WHEEL, TRAIT_ROWS, WORLD_TREE, alignmentLabel, gateOf, planeById, planeOfLocation, portalsOf, ringAngle, ringPlanes, riverOf } from './planes';

const deg = (r: number) => Math.round((r * 180) / Math.PI);

describe('Великое колесо', () => {
  it('шестнадцать внешних планов кольцом: добро сверху, хаос справа, зло снизу, закон слева', () => {
    const ring = ringPlanes();
    expect(ring.map(p => p.name)).toEqual([
      'Mount Celestia', 'Bytopia', 'Elysium', 'Beastlands', 'Arborea', 'Ysgard', 'Limbo', 'Pandemonium',
      'Abyss', 'Carceri', 'Hades', 'Gehenna', 'Nine Hells', 'Acheron', 'Mechanus', 'Arcadia',
    ]);
    expect(deg(ringAngle(planeById('elysium')!))).toBe(-90);
    expect(deg(ringAngle(planeById('limbo')!))).toBe(0);
    expect(deg(ringAngle(planeById('hades')!))).toBe(90);
    expect(Math.abs(deg(ringAngle(planeById('mechanus')!)))).toBe(180);
    // Bytopia — LG и NG: ровно между Mount Celestia и Elysium.
    expect(deg(ringAngle(planeById('bytopia')!))).toBe(-113);
  });

  it('города-врата Outlands по часовой стрелке идут в том же порядке, что планы по мировоззрению', () => {
    const ring = ringPlanes().map(p => p.id);
    const gates = GREAT_WHEEL.outlands.gates.map(g => g.plane);
    const start = ring.indexOf(gates[0]);
    expect([...ring.slice(start), ...ring.slice(0, start)]).toEqual(gates);
    expect(gateOf('nine-hells')?.town).toBe('Ribcage');
    expect(GREAT_WHEEL.outlands.ref).toMatch(/Manual of the Planes 3rd edition/);
  });

  it('у каждого плана — свойства по-русски и дословно, книга и статья; связи — с цитатой', () => {
    for (const p of GREAT_WHEEL.planes) {
      expect(p.url).toMatch(/^https:\/\/forgottenrealms\.fandom\.com\/wiki\//);
      expect(p.refs.length, p.name).toBeGreaterThan(0);
      for (const [key] of TRAIT_ROWS) {
        const t = p[key];
        if (t) expect(t.ru, `${p.name} ${key}`).toBeTruthy();
      }
    }
    expect(planeById('nine-hells')!.layers).toHaveLength(9);
    expect(planeById('astral')!.time?.en).toBe('Flowing (1000 real years = 1 subjective day)');
    expect(GREAT_WHEEL.links.map(l => l.kind).sort()).toEqual(['astral', 'echo', 'echo', 'ethereal']);
    for (const l of GREAT_WHEEL.links) expect(l.quote.length).toBeGreaterThan(30);
  });

  it('мировоззрение словами; место мира «Материальный» — Prime Material Plane', () => {
    expect(alignmentLabel(planeById('bytopia')!)).toBe('законно-добрый / нейтрально-добрый');
    expect(planeOfLocation('Материальный')?.id).toBe('material');
    expect(planeOfLocation('Nine Hells')?.id).toBe('nine-hells');
    expect(planeOfLocation('Neverwinter')).toBeUndefined();
  });
});

describe('Великое древо', () => {
  it('небесные — на Древе по статье: корни, ствол, ветви, вершина', () => {
    const at = (place: string) => WORLD_TREE.planes.filter(p => p.place === place).map(p => p.name);
    expect(at('root')).toEqual(['Arvandor', 'Dwarfhome']);
    expect(at('trunk')).toEqual(['Brightwater', 'Golden Hills', 'House of Knowledge']);
    expect(at('branch')).toEqual(['Dweomerheart', 'House of the Triad', 'Green Fields']);
    expect(at('top')).toEqual(['Gates of the Moon']);
    expect(WORLD_TREE.tree.ref).toMatch(/Player's Guide to Faerûn/);
  });

  it('River of Blood: от Abyss до Fated Depths; Demonweb Pits и Supreme Throne — мимо реки', () => {
    expect(riverOf('abyss')).toEqual({ from: undefined, to: 'blood-rift' });
    expect(riverOf('nine-hells')).toEqual({ from: 'blood-rift', to: 'barrens' });
    expect(riverOf('fated-depths')?.to).toBeUndefined();
    expect(riverOf('demonweb-pits')).toBeUndefined();
    expect(riverOf('supreme-throne')).toBeUndefined();
  });

  it('порталы — с цитатой статьи; у Abyss два непостоянных; у Dwarfhome и Supreme Throne — нет', () => {
    const abyss = portalsOf('abyss');
    expect(abyss.map(p => p.other).sort()).toEqual(['barrens', 'clangor', 'deep-caverns', 'demonweb-pits', 'fated-depths', 'fugue', 'hammergrim']);
    expect(abyss.filter(p => p.link.kind === 'intermittent').map(p => p.other).sort()).toEqual(['deep-caverns', 'fated-depths']);
    expect(portalsOf('dwarfhome')).toEqual([]);
    expect(portalsOf('supreme-throne')).toEqual([]);
    for (const l of WORLD_TREE.links) expect(l.quote.length).toBeGreaterThan(20);
  });

  it('свойства модели Древа — по-русски; мировоззрение словами, где вики не даёт сетку', () => {
    for (const p of WORLD_TREE.planes) for (const [key] of TRAIT_ROWS) if (p[key]) expect(p[key]!.ru, `${p.name} ${key}`).toBeTruthy();
    const arvandor = WORLD_TREE.planes.find(p => p.id === 'arvandor')!;
    expect(arvandor.alignmentText?.ru).toBe('слабо добрый и слабо хаотичный');
    expect(WORLD_TREE.planes.find(p => p.id === 'astral')!.time?.ru).toBe('безвременье');
    expect(WORLD_TREE.planes.find(p => p.id === 'barrens')!.name).toBe('Barrens of Doom and Despair');
  });
});
