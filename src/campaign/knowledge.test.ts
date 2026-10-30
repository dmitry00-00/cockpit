// Знание как ресурс (Д6): навык проверки по виду сущности — правило стола; карточка игроков у сущности мира — только
// узнанное, у правил и записей кампании — как есть; тетрадь — последняя узнанная сущность сверху.
import { describe, expect, it } from 'vitest';
import type { EntityView } from '../entities';
import { EventLog, emptyState } from '../engine';
import { isLore, knowledgeSkillOf, notebookOf, passiveScore, passiveVoices, playersEntityView } from './knowledge';

const view = (extra: Partial<EntityView>): EntityView => ({
  ref: 'monster:wolf', kind: 'monster', name: 'Wolf', source: { kind: 'srd', cite: 'SRD' },
  facts: [{ label: 'AC', value: '13' }, { label: 'HP', value: '11' }], sections: [{ title: 'Действие', text: 'Bite' }], links: [], ...extra,
});

describe('навык проверки знаний (правило стола)', () => {
  it('бог — Религия, план — Магия, NPC и организация — История; монстр — по типу блока', () => {
    expect(knowledgeSkillOf({ kind: 'deity' })).toBe('religion');
    expect(knowledgeSkillOf({ kind: 'plane' })).toBe('arcana');
    expect(knowledgeSkillOf({ kind: 'organization' })).toBe('history');
    expect(knowledgeSkillOf({ kind: 'monster', subtitle: 'Medium beast, unaligned · CR 1/4' })).toBe('nature');
    expect(knowledgeSkillOf({ kind: 'monster', subtitle: 'Medium undead, lawful evil · CR 1/4' })).toBe('religion');
    expect(knowledgeSkillOf({ kind: 'monster', subtitle: 'Large dragon, chaotic evil · CR 7' })).toBe('arcana');
    expect(knowledgeSkillOf({ kind: 'monster', subtitle: 'Medium humanoid (any race), any alignment · CR 2' })).toBe('history');
  });
});

describe('карточка глазами игроков', () => {
  it('сущность мира — только узнанное, без текстов и подзаголовка; правило и запись кампании — как есть', () => {
    const log = new EventLog(emptyState(), []);
    const wolf = view({ subtitle: 'Medium beast, unaligned · CR 1/4' });
    expect(playersEntityView(wolf, log.state)).toMatchObject({ name: 'Wolf', facts: [], sections: [], links: [] });
    expect(playersEntityView(wolf, log.state).subtitle).toBeUndefined();
    log.dispatch({ type: 'KNOWLEDGE_REVEALED', payload: { ref: wolf.ref, name: 'Wolf', fact: { label: 'HP', value: '11' } } });
    expect(playersEntityView(wolf, log.state).facts).toEqual([{ label: 'HP', value: '11' }]);
    const spell = view({ ref: 'spell:bless', kind: 'spell', name: 'Bless' });
    expect(isLore(spell)).toBe(false);
    expect(playersEntityView(spell, log.state)).toBe(spell);
    expect(isLore(view({ source: { kind: 'campaign', cite: 'кампания' } }))).toBe(false);
  });

  it('тетрадь: последняя узнанная сущность сверху', () => {
    const log = new EventLog(emptyState(), []);
    log.dispatch({ type: 'KNOWLEDGE_REVEALED', payload: { ref: 'monster:wolf', name: 'Wolf', fact: { label: 'HP', value: '11' } } });
    log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'hour', steps: 1, fromDay: 0, toDay: 0, fromSec: 0, toSec: 3600 } });
    log.dispatch({ type: 'KNOWLEDGE_REVEALED', payload: { ref: 'deity:lathander', name: 'Lathander', fact: { label: 'Сфера', value: 'Dawn' } } });
    expect(notebookOf(log.state).map(e => e.name)).toEqual(['Lathander', 'Wolf']);
  });
});

describe('голоса навыков (Д13)', () => {
  it('пассивно — 10 + модификатор (SRD); знают — не ниже Сл, по убыванию; никто — лучший; партии нет — пусто', () => {
    expect(passiveScore(4)).toBe(14);
    const members = [
      { id: 'a', name: 'Bo', mods: { history: 2 } }, { id: 'b', name: 'Lyra', mods: { history: 6 } }, { id: 'c', name: 'Korrin', mods: { history: 5 } },
    ];
    expect(passiveVoices(members, 'history', 15)).toEqual({ knows: [{ id: 'b', name: 'Lyra', score: 16 }, { id: 'c', name: 'Korrin', score: 15 }] });
    expect(passiveVoices(members, 'history', 20)).toEqual({ knows: [], best: { id: 'b', name: 'Lyra', score: 16 } });
    expect(passiveVoices(members, 'arcana', 10)).toEqual({ knows: [{ id: 'a', name: 'Bo', score: 10 }, { id: 'c', name: 'Korrin', score: 10 }, { id: 'b', name: 'Lyra', score: 10 }] });
    expect(passiveVoices([], 'history', 15)).toEqual({ knows: [] });
  });
});
