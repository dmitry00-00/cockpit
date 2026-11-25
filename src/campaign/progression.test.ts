import { describe, it, expect } from 'vitest';
import { CLASSES } from '../rules/compendium';
import { classPath, pathFeatureKind, pathFeatureState } from './path';

describe('БА27: проекция фактического каталога', () => {
  it.each(CLASSES)('$nameRu: все уровни, тексты, выборы и ресурсы без потерь', cls => {
    const p = classPath(cls, 5);
    expect(p.steps.map(s => s.level)).toEqual(Array.from({length:20},(_,i)=>i+1));
    expect(p.source).toBe(cls.source);
    for (const row of cls.levels) {
      const step = p.steps.find(s => s.level === row.level)!;
      expect(step.features).toEqual(row.features);
      expect(step.resources).toEqual(row.resources);
    }
    expect(p.options).toEqual(cls.options ?? []);
    expect(p.steps.filter(s => s.subclassPick).map(s => s.level)).toEqual([...new Set(cls.subclasses.map(s => s.gainedAt).filter((x): x is number=>x!==null))].sort((a,b)=>a-b));
  });
  it('все 112 ветвей сохраняют исходные уровни и описания; основная линия не меняется', () => {
    expect(CLASSES.flatMap(c=>c.subclasses)).toHaveLength(112);
    for (const cls of CLASSES) for (const sub of cls.subclasses) {
      const p = classPath(cls, 5, sub.id);
      expect(p.subclassId).toBe(sub.id);
      expect(p.branches.find(b=>b.id===sub.id)?.source).toBe(sub.source);
      expect(p.steps.flatMap(s => s.subclass.map(f=>({...f,level:s.level})))).toEqual([...sub.features].sort((a,b)=>a.level-b.level));
      expect(p.steps.flatMap(s=>s.features)).toEqual(cls.levels.flatMap(l=>l.features));
      expect(p.steps.some(s=>s.subclassPick)).toBe(false);
    }
  });
  it('выбор в прозе не объявляется автоматическим и не превращается в придуманную схему', () => {
    expect(pathFeatureKind({id:'a',name:'Умение',text:'Вы получаете одно из следующих умений на свой выбор'})).toBe('review');
    expect(pathFeatureKind({id:'b',name:'А / Б',text:''})).toBe('review');
    expect(pathFeatureKind({id:'c',name:'Стиль',text:'',choice:'style'})).toBe('choice');
    expect(pathFeatureKind({id:'d',name:'Дополнительная атака',text:'Две атаки вместо одной.'})).toBe('level');
  });
  it('получение подтверждается записью и уровнем в листе, сравнение другой ветви не выдаёт умение', () => {
    const cls=CLASSES[0], f=cls.levels[0].features[0];
    const p=classPath(cls,5,cls.subclasses[0].id,[{id:f.id,level:1}]);
    expect(pathFeatureState(p,f,1)).toBe('acquired');
    expect(pathFeatureState(p,f,2)).toBe('unconfirmed');
    expect(pathFeatureState(p,f,6)).toBe('next');
    expect(pathFeatureState(p,f,7)).toBe('future');
    expect(pathFeatureState(p,f,1,cls.subclasses[1].id)).toBe('comparison');
  });
});
