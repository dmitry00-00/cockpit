// Резолвер сущностей (ROADMAP 0.2): ссылка «вид:id» туда и обратно; до загрузки пакета — не готов; у каждой
// справочной записи источник (запись без источника не существует — CLAUDE.md); каждая связь ведёт на запись;
// ссылки из листов сида резолвятся; битая ссылка — видимая заглушка.
import { beforeAll, describe, expect, it } from 'vitest';
import { seedEngine } from '../campaign';
import {
  REFERENCE_KINDS, STATE_KINDS, isReady, isStateKind, loadAll, missingView, parseRef, ref, refsOf, resolve, type EntityRef,
} from './index';

describe('ссылка «вид:id»', () => {
  it('ref и parseRef — туда и обратно, составной id через точку; неизвестный вид и пустой id — null', () => {
    expect(ref('spell', 'bless')).toBe('spell:bless');
    expect(ref('trait', 'el-f', 'el-f-vyssiy', 'x')).toBe('trait:el-f.el-f-vyssiy.x');
    expect(parseRef('feature:voin.vtoroe-dyhanie')).toEqual({ kind: 'feature', id: 'voin.vtoroe-dyhanie' });
    expect(parseRef('dragon:red')).toBeNull();
    expect(parseRef('spell:')).toBeNull();
    expect(parseRef('bless')).toBeNull();
    expect(isStateKind('actor')).toBe(true);
    expect(isStateKind('spell')).toBe(false);
  });

  it('до загрузки пакета справочный вид не готов, вид состояния — готов всегда', () => {
    expect(isReady('spell')).toBe(false);
    expect(resolve('spell:bless')).toBeUndefined();
    expect(isReady('actor')).toBe(true);
  });
});

describe('справочник после загрузки', () => {
  beforeAll(async () => { await loadAll(); });

  const all = () => REFERENCE_KINDS.flatMap(k => refsOf(k));

  it('у каждого вида есть записи; у каждой — источник, вид и ссылка совпадают с запрошенными', () => {
    for (const k of REFERENCE_KINDS) expect(refsOf(k).length, k).toBeGreaterThan(0);
    for (const r of all()) {
      const v = resolve(r)!;
      expect(v, r).toBeDefined();
      expect(v.ref).toBe(r);
      expect(v.kind).toBe(parseRef(r)!.kind);
      expect(v.name.trim(), r).not.toBe('');
      expect(v.source.cite.trim(), r).not.toBe('');
    }
  });

  it('каждая связь справочной записи ведёт на запись — и кнопкой, и узлом схемы', () => {
    const broken: string[] = [];
    const linksOf = (r: EntityRef) => {
      const v = resolve(r)!;
      return [...v.links, ...[...(v.diagram?.above ?? []), ...(v.diagram?.below ?? []), ...(v.groups ?? [])].flatMap(g => g.links)];
    };
    for (const r of all()) for (const l of linksOf(r)) if (!isStateKind(parseRef(l.ref)!.kind) && !resolve(l.ref)) broken.push(`${r} → ${l.ref}`);
    expect(broken).toEqual([]);
  });

  it('образцы: заклинание с паспортом SRD, состояние по-русски, монстр с блоком, план из двух моделей, умение и черта расы', () => {
    const bless = resolve('spell:bless')!;
    expect(bless.subtitle).toBe('1 круг · очарование');
    expect(bless.facts.map(f => f.label)).toEqual(['Время накладывания', 'Дистанция', 'Компоненты', 'Длительность']);
    expect(bless.links.map(l => l.ref)).toContain('class:paladin');
    expect(resolve('condition:poisoned')).toMatchObject({ name: 'Poisoned', source: { kind: 'srd' } });
    const captain = resolve('monster:bandit-captain')!;
    expect(captain.subtitle).toContain('CR 2');
    expect(captain.sections.some(s => s.title?.startsWith('Действие: '))).toBe(true);
    expect(resolve('plane:abyss')!.subtitle).toMatch(/Колесо: .* · Древо: /);
    expect(resolve('feature:voin.vtoroe-dyhanie')).toMatchObject({ name: 'Второе дыхание', links: [{ ref: 'class:voin' }] });
    expect(refsOf('trait').some(r => r.startsWith('trait:el-f.'))).toBe(true);
    expect(refsOf('place').length).toBeGreaterThan(800);
    expect(resolve(refsOf('monster').find(r => r.startsWith('monster:bf-'))!)!.source).toMatchObject({ kind: 'bf', license: 'CC-BY-4.0' });
  });

  it('божество и боги плана — по эпохе: из ctx.era или из времени мира (сид — 1492 DR)', () => {
    const at5 = resolve('deity:lathander')!;
    expect(at5.facts.find(f => f.label === 'Дом')?.value).toBe('Elysium (Eronia)');
    expect(at5.links.map(l => l.ref)).toEqual(expect.arrayContaining(['pantheon:faerunian-pantheon', 'plane:elysium']));
    const at3 = resolve('deity:lathander', { era: '3e' })!;
    expect(at3.facts.find(f => f.label === 'Дом')?.value).toBe('House of Nature');
    expect(at3.links.map(l => l.ref)).toContain('plane:house-of-nature');
    expect(resolve('deity:mystra')!.facts.find(f => f.label === 'Дом')?.value).toBe('Nirvana (по 2e)');
    expect(resolve('deity:ao')!.subtitle).toBe('сверхбог');
    expect(resolve('deity:ao')!.links.some(l => l.ref.startsWith('pantheon:'))).toBe(false);
    expect(at5.links).toEqual(expect.arrayContaining([{ label: 'домен: Жизни', ref: 'subclass:jrec-jizni' }, { label: 'домен: Света', ref: 'subclass:jrec-sveta' }]));
    expect(at3.links.some(l => l.ref.startsWith('subclass:'))).toBe(false);
    expect(at3.facts.find(f => f.label === 'Святые дни')?.value).toBe('Any dawn, Midsummer morning, the equinoxes');
    expect(resolve('plane:elysium')!.links.map(l => l.ref)).toContain('deity:lathander');
    expect(resolve('plane:house-of-nature')!.links.map(l => l.ref)).toContain('deity:lathander');
    const state = seedEngine().getState().state;
    expect(resolve('deity:lathander', { state })).toBe(at5);
    expect(resolve('pantheon:seldarine')!.links.map(l => l.ref)).toContain('deity:corellon');
    // Служение схемой с обеих сторон: Azuth в 5e называет хозяйкой статью Mystra, Mystra (Midnight) называет Azuth
    // слугой в 3e (старше 5e — годится).
    const azuth = resolve('deity:azuth')!;
    expect(azuth.diagram!.above[0].links.map(l => l.ref)).toEqual(['deity:mystra', 'deity:mystra-midnight']);
    expect(azuth.diagram!.below[0].links.map(l => l.ref)).toEqual(['deity:savras', 'deity:velsharoon']);
    expect(azuth.facts.some(f => f.label === 'Служит' || f.label === 'Слуги')).toBe(false);
    expect(resolve('deity:mystra')!.diagram!.below[0].links.map(l => l.ref)).toContain('deity:azuth');
    expect(at5.diagram!.below).toEqual([{ title: 'Аспекты', links: [{ label: 'Amaunator', ref: 'deity:amaunator' }], dashed: true }]);
    expect(at5.links.map(l => l.ref)).not.toContain('deity:amaunator');
    expect(resolve('deity:ao')!.facts.find(f => f.label === 'Служит')?.value).toBe('Luminous being (по 2e)');
  });

  it('NPC вики (E9): карточка с домом и богом; жители места — живые в год кампании (Khelben умер в 1374 DR)', () => {
    const mirt = resolve('person:mirt')!;
    expect(mirt.subtitle).toBe('Human · Moneylender; Masked Lord');
    const waterdeep = mirt.links.find(l => l.ref.startsWith('place:'))!;
    expect(waterdeep.label).toBe('Waterdeep');
    const elminster = resolve('person:elminster')!;
    expect(elminster.links).toContainEqual({ label: 'Mystra', ref: 'deity:mystra' });
    expect(elminster.facts.find(f => f.label === 'Годы')?.value).toBe('212 — DR · в 1492 DR жив');
    const khelben = resolve('person:khelben-arunsun', { year: 1372 })!;
    expect(khelben.facts.find(f => f.label === 'Годы')?.value).toBe('414–1374 DR · в 1372 DR жив');
    const residents = (year: number) => resolve(waterdeep.ref, { year })!.groups![0];
    expect(residents(1492).title).toBe('Жители в 1492 DR');
    expect(residents(1492).links.map(l => l.ref)).toContain('person:mirt');
    expect(residents(1492).links.map(l => l.ref)).not.toContain('person:khelben-arunsun');
    expect(residents(1372).links.map(l => l.ref)).toContain('person:khelben-arunsun');
    expect(resolve('person:drizzt-do-urden')!.facts.find(f => f.label === 'Бог')).toBeUndefined();
  });

  it('организации вики (3.1): глава, союзники, бог церкви, члены; год кампании — есть или распущена', () => {
    const lords = resolve('organization:lords-alliance')!;
    expect(lords.facts.find(f => f.label === 'Годы')?.value).toBe('основана 1325 DR · в 1492 DR есть');
    expect(lords.links).toContainEqual({ label: 'Open Lord Laeral Silverhand', ref: 'person:laeral-silverhand' });
    expect(lords.groups!.find(g => g.title === 'Союзники')!.links.map(l => l.ref)).toContain('organization:harpers');
    const church = resolve('organization:church-of-lathander')!;
    expect(church.subtitle).toBe('церковь · Religious organization');
    expect(church.links).toContainEqual({ label: 'Lathander', ref: 'deity:lathander' });
    // У Harpers боги есть, но это не церковь.
    expect(resolve('organization:harpers')!.subtitle).toBe('Spy network');
    const nine = (year: number) => resolve('organization:neverwinter-nine', { year })!.facts.find(f => f.label === 'Годы')?.value;
    expect(nine(1492)).toBe('основана 87 DR, распущена 1451 DR · в 1492 DR распущена');
    expect(nine(1372)).toBe('основана 87 DR, распущена 1451 DR · в 1372 DR есть');
    // Члены — по категориям вики, живые в год кампании: Manshoon умер в 1370 DR.
    const members = (year: number) => resolve('organization:zhentarim', { year })!.groups!.find(g => g.title.startsWith('Члены'))!;
    expect(members(1360).links.map(l => l.ref)).toContain('person:manshoon');
    expect(members(1492).links.map(l => l.ref)).not.toContain('person:manshoon');
    expect(resolve('person:manshoon')!.links).toContainEqual({ label: 'Zhentarim', ref: 'organization:zhentarim' });
    expect(resolve('person:manshoon')!.facts.find(f => f.label === 'Состоял')?.value).toMatch(/^Zhentarim/);
  });

  it('ссылки из состояния сида: актёры, места, фракции резолвятся, связи актёров ведут на справочник', () => {
    const state = seedEngine().getState().state;
    for (const k of STATE_KINDS) {
      for (const r of refsOf(k, { state })) expect(resolve(r, { state }), r).toBeDefined();
    }
    expect(refsOf('actor', { state })).toContain('actor:bo');
    const broken: string[] = [];
    for (const r of refsOf('actor', { state })) {
      for (const l of resolve(r, { state })!.links) if (!resolve(l.ref, { state })) broken.push(`${r} → ${l.ref}`);
    }
    expect(broken).toEqual([]);
    expect(resolve('actor:bo')).toBeUndefined();
  });

  it('битая ссылка — заглушка с пометкой, а не пустота', () => {
    const r: EntityRef = 'spell:no-such-spell';
    expect(resolve(r)).toBeUndefined();
    expect(missingView(r)).toMatchObject({ kind: 'spell', name: 'no-such-spell', missing: true, subtitle: 'Заклинание: записи нет' });
  });
});
