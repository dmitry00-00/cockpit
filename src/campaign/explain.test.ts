import { describe, expect, it } from 'vitest';
import type { Actor } from '../engine';
import { ABILITY_IDS, SKILL_IDS } from '../rules/srd/abilities';
import { deriveDraft, type PcSpec } from './derive';
import { explain, explainText, type ExplainKey } from './explain';
import { KORRIN, LYRA } from './party';
import { seedState, sheetOf } from './seed';
import { sheetViewOf } from './sheetView';

/** Актёр, как его собирает предпросмотр редактора: мягкий вывод и лист. */
function draftActor(spec: PcSpec): Actor {
  const { derived } = deriveDraft(spec);
  return {
    id: spec.id, name: spec.name, kind: 'pc', hp: { current: derived.hpMax, max: derived.hpMax, temp: 0 }, ac: derived.ac,
    passivePerception: derived.passivePerception, conditions: {}, sheet: sheetOf(spec, derived),
  };
}

const base = { base: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 }, level: 5, improvements: [{ level: 4, asi: { dex: 2 } }], skills: [], armor: null, shield: false } as const;

/** Персонажи «из редактора»: формулы AC, которых нет у партии сида. Люди — +1 ко всем характеристикам. */
const EDITOR: readonly PcSpec[] = [
  { ...base, id: 'barb', name: 'Barbarian', raceId: 'celovek', classId: 'varvar', shield: true },
  { ...base, id: 'monk', name: 'Monk', raceId: 'celovek', classId: 'monah', equipment: [{ id: 'shortsword', qty: 1 }] },
  { ...base, id: 'sorc', name: 'Sorcerer', raceId: 'celovek', classId: 'carodey', subclassId: 'carodey-nasledie-drakon-ey-krovi' },
  { ...base, id: 'def', name: 'Defender', raceId: 'celovek', classId: 'voin', armor: 'half-plate', choices: { 'fighting-style': ['oborona'] }, equipment: [{ id: 'half-plate', qty: 1 }, { id: 'rapier', qty: 1 }] },
  { ...base, id: 'arch', name: 'Archer', raceId: 'celovek', classId: 'voin', armor: 'leather', choices: { 'fighting-style': ['strel-ba'] }, equipment: [{ id: 'leather-armor', qty: 1 }, { id: 'longbow', qty: 1 }] },
  { ...base, id: 'rogue', name: 'Rogue', raceId: 'celovek', classId: 'plut', skills: ['stealth', 'perception', 'acrobatics', 'insight'], choices: { expertise: ['stealth', 'perception'] } },
];

/** Все ключи листа: AC, хиты, инициатива, PP, спасброски, навыки, атаки, Сл и атака заклинаний. */
function keysOf(a: Actor): ExplainKey[] {
  const sc = a.sheet?.spellcasting;
  return [
    'ac', 'hp', 'initiative', 'pp',
    ...ABILITY_IDS.map(ab => `save:${ab}` as const), ...SKILL_IDS.map(s => `skill:${s}` as const),
    ...(a.sheet?.attacks ?? []).map(x => `attack:${x.id}` as const),
    ...(sc ? ['spellDc', 'spellAttack'] as const : []),
  ];
}

/** Число листа, которое показывает стол, — независимо от explain. */
function shown(a: Actor, key: ExplainKey): number {
  const view = sheetViewOf(a)!;
  if (key === 'ac') return a.ac;
  if (key === 'hp') return a.hp.max;
  if (key === 'initiative') return view.initiative;
  if (key === 'pp') return a.passivePerception;
  if (key === 'spellDc') return a.sheet!.spellcasting!.saveDc;
  if (key === 'spellAttack') return a.sheet!.spellcasting!.attack;
  const [kind, id] = key.split(':');
  if (kind === 'save') return view.abilities.find(x => x.id === id)!.save;
  if (kind === 'skill') return view.skills.find(x => x.id === id)!.mod;
  return a.sheet!.attacks!.find(x => x.id === id)!.toHit;
}

describe('дерево вывода (ROADMAP 5.4)', () => {
  const party = Object.values(seedState().actors).filter(a => a.kind === 'pc');
  const editor = EDITOR.map(draftActor);

  it.each([...party, ...editor].map(a => [a.name, a] as const))('%s: сумма шагов равна числу листа, расхождений нет, у шага — строка SRD', (_, a) => {
    for (const key of keysOf(a)) {
      const e = explain(a, key)!;
      expect(e, key).toBeDefined();
      expect(e.steps.some(s => s.mismatch), `${key}: ${explainText(e)}`).toBe(false);
      expect(e.steps.reduce((s, x) => s + x.value, 0), key).toBe(shown(a, key));
      expect(e.total, key).toBe(shown(a, key));
      for (const s of e.steps) expect(s.rule, `${key}: ${s.label}`).toBeTruthy();
    }
  });

  it('сценарий этапа: AC 18 у Aldric — чешуйчатый 14 + DEX до +2 + щит 2', () => {
    const e = explain(seedState().actors.aldric, 'ac')!;
    expect(e.steps.map(s => [s.label, s.value])).toEqual([['Scale mail, средний', 14], ['DEX 15', 2], ['щит', 2]]);
    expect(explainText(e)).toBe('18 = 14 (Scale mail, средний) + 2 (DEX 15) + 2 (щит)');
  });

  it('AC Korrin — кольчуга 16 + щит 2 без DEX; Lyra — Mage Armor 13 + DEX', () => {
    const s = seedState();
    expect(explain(s.actors.korrin, 'ac')!.steps.map(x => x.value)).toEqual([16, 2]);
    expect(explain(s.actors.lyra, 'ac')!.steps.map(x => x.label)).toEqual(['Mage Armor', 'DEX 15']);
  });

  it('хиты Korrin: d10 целиком, среднее 6 × 4, CON × 5 и выносливость дварфа × 5', () => {
    const e = explain(seedState().actors.korrin, 'hp')!;
    expect(e.steps.map(s => s.value)).toEqual([10, 24, 10, 5]);
    expect(e.steps[0].rule).toBe('Hit Points at 1st Level: 10 + your Constitution modifier');
  });

  it('стили и формулы редактора: варвар со щитом, монах, драконья чешуя, «Оборона», «Стрельба», компетентность', () => {
    const [barb, monk, sorc, def, arch, rogue] = editor;
    expect(explain(barb, 'ac')!.steps.map(s => s.label)).toEqual(['защита без доспехов', 'DEX 17', 'CON 14', 'щит']);
    expect(explain(monk, 'ac')!.steps.map(s => s.label)).toEqual(['защита без доспехов', 'DEX 17', 'WIS 13']);
    expect(explain(sorc, 'ac')!.steps[0]).toMatchObject({ label: 'драконья чешуя', value: 13 });
    expect(explain(sorc, 'hp')!.steps.at(-1)).toMatchObject({ value: 5 });
    expect(explain(def, 'ac')!.steps.at(-1)).toMatchObject({ label: 'боевой стиль «Оборона»', value: 1 });
    expect(explain(def, 'attack:rapier')!.steps[0].label).toBe('STR 16, фехтовальное — лучшая из STR и DEX');
    expect(explain(arch, 'attack:longbow')!.steps.map(s => s.value)).toEqual([3, 3, 2]);
    expect(explain(rogue, 'skill:stealth')!.steps[1]).toMatchObject({ label: 'компетентность: владение +3 × 2', value: 6 });
    expect(explain(rogue, 'pp')!.total).toBe(10 + 1 + 6);
  });

  it('старый лист без Mage Armor — расхождение отдельным шагом, а не подгонка', () => {
    const lyra = seedState().actors.lyra;
    const old = { ...lyra, sheet: { ...lyra.sheet!, mageArmor: undefined } };
    const e = explain(old, 'ac')!;
    expect(e.total).toBe(15);
    expect(e.steps.at(-1)).toMatchObject({ mismatch: true, value: 3 });
  });

  it('нет числа — нет вывода: заклинаний у Korrin нет, чужой атаки нет', () => {
    const korrin = seedState().actors.korrin;
    expect(explain(korrin, 'spellDc')).toBeUndefined();
    expect(explain(korrin, 'attack:longbow')).toBeUndefined();
    expect(KORRIN.equipment?.length).toBeGreaterThan(0);
    expect(LYRA.mageArmor).toBe(true);
  });
});
