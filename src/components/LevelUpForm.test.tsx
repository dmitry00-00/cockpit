import { render, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LevelUpForm } from './LevelUpForm';
import { levelUpPlan } from '../campaign/levelUp';
import { previewLevelUp } from '../campaign/levelUpPreview';
import { seedState } from '../campaign/seed';
import { spellcastingOf } from '../campaign/build';
import { classById } from '../rules/compendium';

describe('БА27: решения и предпросмотр повышения', () => {
  it('показывает черты владельческой таблицы, provenance и обязательный выбор +1', () => {
    const actor = seedState().actors.korrin, onLevelUp = vi.fn();
    render(<LevelUpForm plan={levelUpPlan(actor)} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} onPreview={choice => previewLevelUp(actor, choice)} />);
    fireEvent.click(screen.getByRole('radio', { name: 'черта' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Черта' }), { target: { value: 'ustoycivyy' } });
    expect(screen.getByRole('note')).toHaveTextContent('издание книги не указано');
    expect(screen.getByRole('note')).toHaveTextContent('минимум равен удвоенному модификатору Телосложения');
    expect(screen.getByRole('button', { name: 'Повысить' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Характеристика черты' }), { target: { value: 'wis' } });
    expect(screen.getByRole('table', { name: 'Изменения показателей' })).toHaveTextContent(new RegExp(`WIS\\s*${actor.sheet!.abilities.wis}\\s*${actor.sheet!.abilities.wis + 1}`));
    fireEvent.click(screen.getByRole('button', { name: 'Повысить' }));
    expect(onLevelUp).toHaveBeenCalledExactlyOnceWith({ hp: { method: 'average' }, featId: 'ustoycivyy', featAbility: 'wis' });
  });

  it('объясняет и показывает применение HP-эффекта черты «Крепкий»', () => {
    const actor = seedState().actors.korrin;
    const plan = levelUpPlan(actor);
    render(<LevelUpForm plan={plan} abilities={actor.sheet!.abilities} />);
    fireEvent.click(screen.getByRole('radio', { name: 'черта' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Черта' }), { target: { value: 'krepkiy' } });
    expect(screen.getByRole('note')).toHaveTextContent('Максимум ваших хитов увеличивается на количество, равное удвоенному уровню');
    expect(screen.getByRole('note')).toHaveTextContent(`Максимум хитов: +${2 * plan.level} при получении этой черты, затем +2 за каждый следующий уровень. Этот эффект будет рассчитан.`);
  });

  it('меняет предпросмотр до подтверждения, применяет ровно показанный выбор', () => {
    const actor = seedState().actors.korrin, onLevelUp = vi.fn();
    const before = structuredClone(actor);
    render(<LevelUpForm plan={levelUpPlan(actor)} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} onPreview={choice => previewLevelUp(actor, choice)} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Характеристика' }), { target: { value: 'con' } });
    const table = screen.getByRole('table', { name: 'Изменения показателей' });
    const row = within(table).getByRole('row', { name: new RegExp(`CON ${actor.sheet!.abilities.con} ${actor.sheet!.abilities.con + 2}`) });
    expect(row).toBeInTheDocument();
    expect(onLevelUp).not.toHaveBeenCalled();
    expect(actor).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Повысить' }));
    expect(onLevelUp).toHaveBeenCalledExactlyOnceWith({ hp: { method: 'average' }, asi: { con: 2 } });
  });

  it('показывает рост заговоров для подготовленного заклинателя отдельным выбором', () => {
    const base = seedState().actors.korrin;
    const cls = classById('jrec')!;
    const subclassId = 'jrec-jizni';
    const current = spellcastingOf(cls, 3, subclassId, { str: 0, dex: 0, con: 0, int: 0, wis: 3, cha: 0 });
    if (current.kind !== 'plan') throw Error('missing cleric spell plan');
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'jrec', level: 3, subclassId,
      abilities: { ...base.sheet!.abilities, wis: 16 },
      spellcasting: { ability: 'wis' as const, saveDc: 13, attack: 5, kind: 'prepared' as const, maxLevel: current.maxLevel,
        cantrips: current.options.filter(spell => spell.level === 0).slice(0, current.cantrips).map(spell => spell.id),
        spells: [], preparedLimit: current.leveled, always: current.always },
    } };
    const plan = levelUpPlan(actor), onLevelUp = vi.fn();
    render(<LevelUpForm plan={plan} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} />);
    expect(screen.getByText('Новые заговоры класса: заговоров 1, заклинаний 0')).toBeInTheDocument();
    expect(screen.getByText(/Подготовленные заклинания при повышении не выбираются/)).toBeInTheDocument();
    const newCantrip = plan.spells!.options.find(spell => spell.level === 0)!;
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(newCantrip.name) }));
    fireEvent.click(screen.getByRole('button', { name: 'Повысить' }));
    expect(onLevelUp).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ spells: [newCantrip.id] }));
  });
  it('незавершённый бросок и недопустимый ASI видны до записи и блокируют применение', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, abilities: { ...base.sheet!.abilities, str: 20 } } };
    const onLevelUp = vi.fn();
    render(<LevelUpForm plan={levelUpPlan(actor)} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} onPreview={choice => previewLevelUp(actor, choice)} />);
    expect(screen.getByRole('region', { name: 'Результат повышения' })).toHaveTextContent('выше 20');
    expect(screen.getByRole('button', { name: 'Повысить' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'бросок' }));
    expect(screen.getByRole('region', { name: 'Результат повышения' })).toHaveTextContent('Введите бросок');
    expect(screen.queryByRole('table')).toBeNull();
    expect(onLevelUp).not.toHaveBeenCalled();
  });

  it('локальный режим сохраняет решение плана без вызова кампанийного повышения', () => {
    const actor = seedState().actors.korrin, onLevelUp = vi.fn(), onPlanChoice = vi.fn();
    render(<LevelUpForm intent="plan" plan={levelUpPlan(actor)} abilities={actor.sheet!.abilities} onPlanChoice={onPlanChoice} onPreview={choice => previewLevelUp(actor, choice)} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Характеристика' }), { target: { value: 'con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    expect(onPlanChoice).toHaveBeenCalledExactlyOnceWith({ hp: { method: 'average' }, asi: { con: 2 } });
    expect(onLevelUp).not.toHaveBeenCalled();
    expect(screen.getByText(/Кампания и журнал событий не меняются/)).toBeInTheDocument();
  });

  it('различает реальное повышение и локальное решение плана, вызывая только соответствующий путь', () => {
    const actor = seedState().actors.korrin, onLevelUp = vi.fn(), onPlanChoice = vi.fn();
    const plan = levelUpPlan(actor);
    render(<>
      <LevelUpForm plan={plan} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} />
      <LevelUpForm intent="plan" plan={plan} abilities={actor.sheet!.abilities} onPlanChoice={onPlanChoice} />
    </>);
    const actual = screen.getByRole('form', { name: `Повышение до ${plan.level}-го уровня` });
    const draft = screen.getByRole('form', { name: `Решение плана для ${plan.level}-го уровня` });
    expect(within(actual).getByRole('button', { name: 'Повысить' })).toBeEnabled();
    expect(within(draft).getByRole('button', { name: 'Сохранить в план' })).toBeEnabled();
    fireEvent.click(within(draft).getByRole('button', { name: 'Сохранить в план' }));
    expect(onPlanChoice).toHaveBeenCalledTimes(1);
    expect(onLevelUp).not.toHaveBeenCalled();
    fireEvent.click(within(actual).getByRole('button', { name: 'Повысить' }));
    expect(onLevelUp).toHaveBeenCalledTimes(1);
  });

  it('показывает source-aware выбор и не подтверждает повышение до его заполнения', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'paladin', level: 1 } };
    const onLevelUp = vi.fn();
    render(<LevelUpForm plan={levelUpPlan(actor)} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} />);
    const button = screen.getByRole('button', { name: 'Повысить' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Источник: SRD 5.1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Оборона/ }));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onLevelUp).toHaveBeenCalledExactlyOnceWith({ hp: { method: 'average' }, featureChoices: { 'fighting-style': ['oborona'] } });
  });

  it('обновляет выборы при смене предложенного подкласса', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'carodey', level: 0, subclassId: undefined } };
    const plan = levelUpPlan(actor);
    const draconic = plan.subclasses!.find(sub => sub.id.includes('nasledie-drakon'))!;
    const other = plan.subclasses!.find(sub => sub.id !== draconic.id)!;
    render(<LevelUpForm plan={plan} planForSubclass={id => levelUpPlan(actor, id)} abilities={actor.sheet!.abilities} />);
    const select = screen.getByRole('combobox', { name: 'Подкласс' });
    fireEvent.change(select, { target: { value: other.id } });
    expect(screen.queryByRole('group', { name: 'Предок дракона' })).toBeNull();
    fireEvent.change(select, { target: { value: draconic.id } });
    expect(screen.getByRole('group', { name: 'Предок дракона' })).toBeInTheDocument();
  });

  it('показывает новые имена заклинаний покровителя без автоматической подмены SRD id', () => {
    const base = seedState().actors.bo;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'koldun', level: 0, subclassId: undefined, spellcasting: undefined } };
    const plan = levelUpPlan(actor);
    render(<LevelUpForm plan={plan} planForSubclass={id => levelUpPlan(actor, id)} abilities={actor.sheet!.abilities} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Подкласс' }), { target: { value: 'koldun-arhifea' } });
    const notes = screen.getByRole('region', { name: 'Заклинания подкласса из таблицы' });
    expect(notes).toHaveTextContent('Огонь фей · 1-й круг');
    expect(notes).toHaveTextContent('Усыпление · 1-й круг');
    expect(notes).toHaveTextContent('Издание книги не указано');
  });

  it('показывает книгу и точный owner-tables provenance для выбранного подкласса, без пометки SRD', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'voin', level: 2, subclassId: undefined } };
    const onLevelUp = vi.fn();
    const plan = levelUpPlan(actor);
    const archer = plan.subclasses!.find(sub => sub.id === 'voin-misticeskiy-lucnik')!;
    render(<LevelUpForm plan={plan} planForSubclass={id => levelUpPlan(actor, id)} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Подкласс' }), { target: { value: archer.id } });
    expect(screen.getByText(/Источник: книга · владелецкие таблицы 2026\.10\.31 \(издание книги не отмечено\)/)).toBeInTheDocument();
    expect(screen.queryByText(/источник SRD 5\.1/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ищущая стрела/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Теневая стрела/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Повысить' }));
    expect(onLevelUp).toHaveBeenCalledExactlyOnceWith({
      hp: { method: 'average' }, subclassId: archer.id,
      featureChoices: { 'book-choice:voin:voin-misticeskiy-lucnik:magiceskiy-vystrel': ['isusaa-strela', 'tenevaa-strela'] },
    });
  });

  it('позволяет заменить ранее изученный приём и отдельно выбрать два новых', () => {
    const base = seedState().actors.korrin;
    const choiceId = 'book-choice:voin:voin-master-boevyh-isskustv:boevoe-prevoshodstvo';
    const known = ['takticeskaa-ocenka', 'otvlekausiy-udar', 'otvetnyy-udar'];
    const actor = { ...base, sheet: {
      ...base.sheet!, level: 6, subclassId: 'voin-master-boevyh-isskustv',
      choices: [{ id: choiceId, label: 'Боевое превосходство', values: known.map(id => ({ id, name: id, at: 3, source: 'book' as const })) }],
    } };
    const plan = levelUpPlan(actor), onLevelUp = vi.fn();
    const feature = plan.featureChoices.find(item => item.id === choiceId)!;
    const added = feature.options.slice(0, 2).map(option => option.id);
    const replacedWith = feature.options[2].id;
    render(<LevelUpForm plan={plan} abilities={actor.sheet!.abilities} onLevelUp={onLevelUp} onPreview={choice => previewLevelUp(actor, choice)} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Заменить известный вариант · Боевое превосходство' }), { target: { value: known[0] } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Новый вариант для замены · Боевое превосходство' }), { target: { value: replacedWith } });
    for (const id of added) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(feature.options.find(option => option.id === id)!.name) }));
    fireEvent.click(screen.getByRole('button', { name: 'Повысить' }));
    expect(onLevelUp).toHaveBeenCalledExactlyOnceWith({
      hp: { method: 'average' }, featureChoices: { [choiceId]: added },
      featureChoiceReplacements: { [choiceId]: { from: known[0], to: replacedWith } },
    });
  });

  it('показывает для Кэнсэя раздельные категории оружия и сохраняет выбор в черновик плана', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'monah', level: 2, subclassId: undefined } };
    const subclassId = 'monah-kensea';
    const choiceId = 'book-choice:monah:monah-kensea:put-kensea:weapons';
    const onPlanChoice = vi.fn();
    render(<LevelUpForm intent="plan" plan={levelUpPlan(actor)} planForSubclass={id => levelUpPlan(actor, id)} abilities={actor.sheet!.abilities} onPlanChoice={onPlanChoice} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Подкласс' }), { target: { value: subclassId } });
    expect(screen.getByRole('combobox', { name: 'Рукопашное оружие Кэнсэя' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Дальнобойное оружие Кэнсэя' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Рукопашное оружие Кэнсэя' }), { target: { value: 'dagger' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Дальнобойное оружие Кэнсэя' }), { target: { value: 'shortbow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в план' }));
    expect(onPlanChoice).toHaveBeenCalledExactlyOnceWith({ hp: { method: 'average' }, subclassId, featureChoices: { [choiceId]: ['dagger', 'shortbow'] } });
  });
});
