// JourneyActivities: занятия, которые регион меняет, — сверху, «нельзя» — внизу и выключено; бросок идёт лучшим навыком
// выбранного участника с режимом из поправки; обычный исход сразу уходит в журнал, натуральные 20 и 1 ждут выбора мастера;
// автоисход пишется без броска.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JourneyActivities, bestSkill, type ActivityMember } from './JourneyActivities';
import type { ActivityMod, JourneyActivity } from '../rules/a5e/journey';

const outcomes = { criticalFailure: 'CF text', failure: 'F text', success: 'S text', criticalSuccess: 'CS text' };
const ACTS: JourneyActivity[] = [
  { id: 'cook', name: 'Cook', skills: ['survival'], text: 'Cook text', outcomes },
  { id: 'scout', name: 'Scout', skills: ['perception', 'stealth'], text: 'Scout text', outcomes },
  { id: 'busk', name: 'Busk', skills: ['performance'], text: 'Busk text', outcomes },
  { id: 'pray', name: 'Pray', skills: ['religion'], text: 'Pray text', outcomes },
];
const MEMBERS: ActivityMember[] = [
  { id: 'a', name: 'Aria', skills: { perception: 2, stealth: 5, survival: 1 } },
  { id: 'b', name: 'Bram', skills: { survival: 4 } },
];
const mod = (kind: ActivityMod['kind'], conditional = false): ActivityMod => ({ kind, text: `${kind} text`, conditional });

function setup(mods: Record<string, ActivityMod>, roll = { natural: 12, total: 17 }) {
  const onRoll = vi.fn(() => roll);
  const onOutcome = vi.fn();
  render(<JourneyActivities regionName="Plains" dc={14} activities={ACTS} mods={mods} members={MEMBERS} onRoll={onRoll} onOutcome={onOutcome} />);
  const row = (id: string) => document.querySelector(`[data-activity="${id}"]`) as HTMLElement;
  return { onRoll, onOutcome, row };
}

describe('bestSkill', () => {
  it('наибольший модификатор из навыков занятия; без листа — первый навык, +0', () => {
    expect(bestSkill(MEMBERS[0], ['perception', 'stealth'])).toEqual({ skill: 'stealth', mod: 5 });
    expect(bestSkill({ id: 'x', name: 'X', skills: {} }, ['perception', 'stealth'])).toEqual({ skill: 'perception', mod: 0 });
  });
});

describe('JourneyActivities', () => {
  it('поправленные — сверху, «нельзя» — внизу и выключено; условное «нельзя» не выключает', () => {
    const { row } = setup({ busk: mod('impossible'), scout: mod('advantage'), pray: mod('impossible', true) });
    const ids = [...document.querySelectorAll('[data-activity]')].map(e => e.getAttribute('data-activity'));
    expect(ids).toEqual(['pray', 'scout', 'cook', 'busk']);
    expect(within(row('busk')).getByRole('button', { name: 'Бросить' })).toBeDisabled();
    expect(within(row('pray')).getByRole('button', { name: 'Бросить' })).toBeEnabled();
    expect(within(row('scout')).getByText('преимущество')).toBeInTheDocument();
  });

  it('бросок — лучшим навыком первого участника, режим из поправки; обычный успех сразу в журнал', () => {
    const { onRoll, onOutcome, row } = setup({ scout: mod('advantage') });
    fireEvent.click(within(row('scout')).getByRole('button', { name: 'Бросить' }));
    expect(onRoll).toHaveBeenCalledWith(expect.stringContaining('Scout · Aria'), 5, 'advantage');
    expect(onOutcome).toHaveBeenCalledWith('Aria', ACTS[1], 'success', 'S text');
    expect(within(row('scout')).getByText(/против DC 14 — успех/)).toBeInTheDocument();
  });

  it('выбор участника меняет, кто бросает и каким модификатором; ниже DC — провал', () => {
    const { onRoll, onOutcome, row } = setup({}, { natural: 5, total: 9 });
    fireEvent.change(within(row('cook')).getByRole('combobox'), { target: { value: 'b' } });
    fireEvent.click(within(row('cook')).getByRole('button', { name: 'Бросить' }));
    expect(onRoll).toHaveBeenCalledWith(expect.stringContaining('Cook · Bram'), 4, 'normal');
    expect(onOutcome).toHaveBeenCalledWith('Bram', ACTS[0], 'failure', 'F text');
  });

  it('натуральная 20 — в журнал ничего, пока мастер не выберет; выбор пишет исход и прячет кнопки', () => {
    const { onOutcome, row } = setup({}, { natural: 20, total: 21 });
    fireEvent.click(within(row('cook')).getByRole('button', { name: 'Бросить' }));
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(within(row('cook')).getByRole('button', { name: 'критический успех' }));
    expect(onOutcome).toHaveBeenCalledWith('Aria', ACTS[0], 'criticalSuccess', 'CS text');
    expect(within(row('cook')).queryByRole('button', { name: 'обычный успех' })).toBeNull();
  });

  it('автоисход — «Записать» без броска', () => {
    const { onRoll, onOutcome, row } = setup({ pray: mod('auto-failure') });
    fireEvent.click(within(row('pray')).getByRole('button', { name: 'Записать' }));
    expect(onRoll).not.toHaveBeenCalled();
    expect(onOutcome).toHaveBeenCalledWith('Aria', ACTS[3], 'failure', 'F text');
  });

  it('без занятий — ничего', () => {
    const { container } = render(<JourneyActivities regionName="X" dc={10} activities={[]} mods={{}} members={MEMBERS} onRoll={() => ({ natural: 1, total: 1 })} onOutcome={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Занятия в пути/)).toBeNull();
  });
});
