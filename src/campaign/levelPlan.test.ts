import { describe, expect, it } from 'vitest';
import { seedState } from './seed';
import { calculateLevelPlan } from './levelPlan';
import { previewLevelUp } from './levelUpPreview';
import { levelUpPlan, type LevelUpChoice } from './levelUp';

describe('БА27: последовательный локальный план', () => {
  it('пустой план не меняет актора и сообщает ближайший предел расчёта', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, subclassId: 'voin-cempion' } };
    const before = structuredClone(actor);
    const result = calculateLevelPlan(actor, 8, []);
    expect(result.steps).toEqual([]);
    expect(result.validThrough).toBe(actor.sheet!.level);
    expect(result.actor).toEqual(before);
    expect(result.error).toBeUndefined();
  });

  it('цепочка совпадает с последовательными предпросмотрами Д8 и не мутирует исходный актёр', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, subclassId: 'voin-cempion' } };
    const choices: LevelUpChoice[] = [
      { hp: { method: 'average' }, asi: { con: 2 } },
      { hp: { method: 'average' } },
    ];
    const before = structuredClone(actor);
    const first = previewLevelUp(actor, choices[0]);
    expect(first.kind).toBe('ready');
    if (first.kind !== 'ready') return;
    const second = previewLevelUp(first.actor, choices[1]);
    expect(second.kind).toBe('ready');
    if (second.kind !== 'ready') return;
    const result = calculateLevelPlan(actor, actor.sheet!.level + 2, choices);
    expect(result.steps.map(s => s.level)).toEqual([actor.sheet!.level + 1, actor.sheet!.level + 2]);
    expect(result.actor).toEqual(second.actor);
    expect(result.validThrough).toBe(actor.sheet!.level + 2);
    expect(actor).toEqual(before);
  });

  it('Изобретатель останавливается на неподдержанном ограничении Д8', () => {
    const base = seedState().actors.korrin;
    const artificer = { ...base, sheet: { ...base.sheet!, classId: 'izobretatel', level: 1 } };
    const result = calculateLevelPlan(artificer, 2, [{ hp: { method: 'average' } }]);
    expect(result.steps).toEqual([]);
    expect(result.validThrough).toBe(1);
    expect(result.error).toMatch(/нет в SRD|кости хитов/);
  });

  it('текстовый выбор подкласса показывается как предел точного расчёта следующих уровней', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'voin', level: 2, subclassId: undefined } };
    const choiceId = 'book-choice:voin:voin-master-boevyh-isskustv:boevoe-prevoshodstvo';
    const result = calculateLevelPlan(actor, 4, [{ hp: { method: 'average' }, subclassId: 'voin-master-boevyh-isskustv',
      featureChoices: { [choiceId]: ['takticeskaa-ocenka', 'otvlekausiy-udar', 'otvetnyy-udar'] } }]);
    expect(result.validThrough).toBe(2);
    expect(result.steps).toHaveLength(0);
    expect(result.candidate?.level).toBe(3);
    expect(result.limitation).toMatch(/выбор по описанию|нет поддерживаемой схемы/);
    expect(result.actor.sheet?.level).toBe(2);
  });

  it('книжный Arcane Archer choice не включается в точный итог дальнего плана', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'voin', level: 2, subclassId: undefined } };
    const choiceId = 'book-choice:voin:voin-misticeskiy-lucnik:magiceskiy-vystrel';
    const result = calculateLevelPlan(actor, 3, [{
      hp: { method: 'average' }, subclassId: 'voin-misticeskiy-lucnik',
      featureChoices: { [choiceId]: ['isusaa-strela', 'tenevaa-strela'] },
    }]);
    expect(result.steps).toHaveLength(0);
    expect(result.candidate?.level).toBe(3);
    expect(result.candidate?.preview?.warnings).toContainEqual(expect.stringMatching(/механический эффект здесь не рассчитывается/));
    expect(result.validThrough).toBe(2);
  });

  it('черновик Battle Master сохраняет замену как кандидат, не включая неподдержанные эффекты в итог', () => {
    const base = seedState().actors.korrin;
    const choiceId = 'book-choice:voin:voin-master-boevyh-isskustv:boevoe-prevoshodstvo';
    const known = ['takticeskaa-ocenka', 'otvlekausiy-udar', 'otvetnyy-udar'];
    const actor = { ...base, sheet: {
      ...base.sheet!, classId: 'voin', level: 6, subclassId: 'voin-master-boevyh-isskustv',
      choices: [{ id: choiceId, label: 'Боевое превосходство', values: known.map(id => ({ id, name: id, at: 3, source: 'book' as const })) }],
    } };
    const optionIds = levelUpPlan(actor).featureChoices.find(item => item.id === choiceId)!.options.map(option => option.id);
    const choice: LevelUpChoice = {
      hp: { method: 'average' },
      featureChoices: { [choiceId]: optionIds.slice(0, 2) },
      featureChoiceReplacements: { [choiceId]: { from: known[0], to: optionIds[2] } },
    };
    const result = calculateLevelPlan(actor, 7, [choice]);
    expect(result.steps).toHaveLength(0);
    expect(result.candidate?.choice).toEqual(choice);
    expect(result.candidate?.preview?.actor.sheet?.choices?.find(item => item.id === choiceId)?.values.map(item => item.id))
      .toEqual([known[1], known[2], ...optionIds.slice(0, 3)]);
    expect(result.limitation).toMatch(/механический эффект здесь не рассчитывается/);
    expect(actor.sheet?.choices?.[0].values.map(item => item.id)).toEqual(known);
  });
});
