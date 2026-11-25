import { describe, expect, it } from 'vitest';
import { a5eDowntimeCoinBalance, a5eDowntimeJournalText, a5eInformationActivitySpec, a5eInformationCheckOutcome, planA5eDowntimeCoinPayment, resolveA5eLongDowntimeCheck } from './downtime';

describe('A5E downtime', () => {
  it('records a private-period-ready summary for all party activities', () => {
    expect(a5eDowntimeJournalText('tenday', ['mira', 'torvald'], [
      { actorId: 'mira', actorName: 'Mira', activity: 'train', outcome: 'освоила основы эльфийского' },
      { actorId: 'torvald', actorName: 'Torvald', activity: 'gather-information', information: { obscurity: 'esoteric', subject: 'гильдия', skill: 'investigation', check: { total: 20 }, target: { ref: 'organization:guild', name: 'Гильдия' }, facts: [{ label: 'Доступ', value: 'Через архивариуса' }, { label: 'Символ', value: 'Серебряная печать' }] }, outcome: 'получил сведения о гильдии' },
    ])).toBe('Промежуток A5E · tenday · 10 дней (1 нед.)\nMira — Тренировка: освоила основы эльфийского\nTorvald — Сбор сведений · гильдия → Гильдия · investigation 20 против DC 15 · 2 нед. · стоимость 25 gp (списан минимум 25 gp) · успех на 5+ · дополнительный факт; +2 Key Knowledge всего · Доступ: Через архивариуса / Символ: Серебряная печать: получил сведения о гильдии');
  });

  it('rejects missing, duplicate, or foreign participants and empty outcomes', () => {
    const row = { actorId: 'mira', actorName: 'Mira', activity: 'train' as const, outcome: 'училась' };
    expect(() => a5eDowntimeJournalText('month', ['mira', 'torvald'], [row])).toThrow(/exactly one activity/);
    expect(() => a5eDowntimeJournalText('month', ['mira', 'torvald'], [row, row])).toThrow(/match participants/);
    expect(() => a5eDowntimeJournalText('month', ['mira', 'torvald'], [row, { ...row, actorId: 'other' }])).toThrow(/match participants/);
    expect(() => a5eDowntimeJournalText('month', ['mira'], [{ ...row, outcome: '  ' }])).toThrow(/include an outcome/);
    expect(() => a5eDowntimeJournalText('month', ['mira'], [{ ...row, activity: 'research', information: undefined }])).toThrow(/need a target/);
  });

  it('keeps the sourced long-period outcome bands', () => {
    expect(resolveA5eLongDowntimeCheck('month', 15, 15)).toEqual({ result: 'success', successfulWeeks: 4 });
    expect(resolveA5eLongDowntimeCheck('season', 14, 15)).toEqual({ result: 'failure', successfulWeeks: 6 });
    expect(resolveA5eLongDowntimeCheck('year', 10, 15)).toEqual({ result: 'failure-by-5', successfulWeeks: 13 });
  });

  it('uses the source obscurity table and the activity-specific skill', () => {
    expect(a5eInformationActivitySpec('gather-information', 'uncommon')).toEqual({ dc: 10, weeks: 1, minimumCostGp: 10, costLabel: '10 gp', skill: 'investigation' });
    expect(a5eInformationActivitySpec('research', 'secret')).toEqual({ dc: 25, weeks: 5, minimumCostGp: 500, costLabel: '500+ gp', skill: 'arcana-or-history' });
    expect(['success-by-5', 'success', 'failure', 'failure-by-5'].map((_, i) => a5eInformationCheckOutcome([15, 10, 9, 5][i], 10))).toEqual(['success-by-5', 'success', 'failure', 'failure-by-5']);
  });

  it('plans exact sourced information costs from existing coin stacks without creating or exchanging coins', () => {
    const stacks = [
      { stackId: 'gold', itemId: 'coin:gp', qty: 5 },
      { stackId: 'platinum', itemId: 'coin:pp', qty: 2 },
      { stackId: 'electrum', itemId: 'coin:ep', qty: 20 },
      { stackId: 'not-coins', itemId: 'rope', qty: 100 },
    ];
    expect(a5eDowntimeCoinBalance(stacks)).toBe(3500);
    expect(planA5eDowntimeCoinPayment(stacks, 25)).toEqual([
      { stackId: 'gold', qty: 5 },
      { stackId: 'platinum', qty: 2 },
    ]);
    expect(planA5eDowntimeCoinPayment([{ stackId: 'platinum', itemId: 'coin:pp', qty: 1 }], 5)).toBeNull();
    expect(planA5eDowntimeCoinPayment([{ stackId: 'platinum', itemId: 'coin:pp', qty: 1 }], 10)).toEqual([{ stackId: 'platinum', qty: 1 }]);
  });
});
