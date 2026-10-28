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

  it('каждая связь справочной записи ведёт на запись', () => {
    const broken: string[] = [];
    for (const r of all()) for (const l of resolve(r)!.links) if (!isStateKind(parseRef(l.ref)!.kind) && !resolve(l.ref)) broken.push(`${r} → ${l.ref}`);
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
    expect(at5.links.map(l => l.ref)).toEqual(expect.arrayContaining(['pantheon:faerunian-pantheon', 'plane:elysium', 'deity:amaunator']));
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
