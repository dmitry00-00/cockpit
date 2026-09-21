// ConditionChip: пропсы из SRD-модуля и актёра, три вида, уровень истощения, таймер от мирового
// времени, тултип с формулировкой SRD, кнопка снятия только с колбэком, ни одной пиктограммы.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEED_SEC, seedEngine } from '../campaign';
import { CONDITIONS, CONDITION_IDS, type ConditionId } from '../rules/srd';
import {
  CONDITION_ORDER,
  ConditionChip,
  chipsOf,
  concentrationChipProps,
  conditionChipProps,
  conditionTip,
  effectChipProps,
  formatRemaining,
  type ChipSpec,
} from './ConditionChip';

const EMOJI = /\p{Extended_Pictographic}/u;

/** Пропсы чипа как в продукте: id остаётся у проекции, key уходит React'у отдельно, не спредом. */
function chipProps(id: ConditionId, snapshot?: Parameters<typeof conditionChipProps>[1]): Omit<ChipSpec, 'id' | 'key'> {
  const { key: _key, id: _id, ...chip } = conditionChipProps(id, snapshot);
  void _key;
  void _id;
  return chip;
}

// jsdom 26 + nwsapi 2.2.27: floating-ui (под Radix Popper) спрашивает `:popover-open` и `:modal`,
// а nwsapi на них уходит в рекурсию до RangeError — ~4 с на каждое открытие тултипа. В браузере
// этого нет; здесь отвечаем «нет» сразу. Кандидат в общий src/test-setup.ts.
const nativeMatches = Element.prototype.matches;
beforeAll(() => {
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ':popover-open' || selector === ':modal' ? false : nativeMatches.call(this, selector);
  };
});
afterAll(() => {
  Element.prototype.matches = nativeMatches;
});

describe('conditionChipProps', () => {
  it('подпись, иконка и вид берутся из SRD: Отравлен — дебафф, Невидим — единственный бафф', () => {
    const poisoned = conditionChipProps('poisoned', {});
    expect(poisoned).toMatchObject({ id: 'poisoned', label: 'Отравлен', icon: 'cond-poisoned', kind: 'debuff' });
    expect(poisoned.level).toBeUndefined();
    expect(poisoned.tip).toBe(CONDITIONS.poisoned.text.join(' '));
    expect(conditionChipProps('invisible').kind).toBe('buff');
    for (const id of CONDITION_IDS) {
      const p = conditionChipProps(id);
      expect(p.label, id).toBe(CONDITIONS[id].label);
      expect(p.kind, id).toBe(CONDITIONS[id].kind);
      expect(p.tip, id).not.toMatch(EMOJI);
    }
  });

  it('срок из снимка идёт в таймер как есть', () => {
    expect(conditionChipProps('poisoned', { until: 'конец следующего хода' }).timer).toBe('конец следующего хода');
  });

  it('истощение несёт уровень; без уровня в снимке — 1; тултип перечисляет свой уровень и все ниже', () => {
    const two = conditionChipProps('exhaustion', { level: 2 });
    expect(two.level).toBe(2);
    expect(two.tip).toContain('1 — Disadvantage on ability checks');
    expect(two.tip).toContain('2 — Speed halved');
    expect(two.tip).not.toContain('3 — Disadvantage on attack rolls');
    expect(conditionChipProps('exhaustion', {}).level).toBe(1);
    expect(conditionTip('exhaustion')).toContain('6 — Death');
  });

  it('порядок показа — как в сетке: истощение последнее, все пятнадцать на месте', () => {
    expect(CONDITION_ORDER.length).toBe(CONDITION_IDS.length);
    expect(new Set(CONDITION_ORDER)).toEqual(new Set(CONDITION_IDS));
    expect(CONDITION_ORDER.at(-1)).toBe('exhaustion');
  });
});

describe('formatRemaining', () => {
  it('минуты вверх, часы и дни к ближайшему, ноль и меньше — истекло', () => {
    expect(formatRemaining(38 * 60)).toBe('38 мин');
    expect(formatRemaining(5)).toBe('1 мин');
    expect(formatRemaining(7 * 3600)).toBe('7 ч');
    expect(formatRemaining(7 * 3600 - 10 * 60)).toBe('7 ч');
    expect(formatRemaining(3 * 86_400)).toBe('3 дн');
    expect(formatRemaining(0)).toBe('истекло');
    expect(formatRemaining(-60)).toBe('истекло');
  });
});

describe('чипы из актёра', () => {
  it("концентрация Bo — вид conc, иконка cond-concentration, «38 мин» от времени сида, «18 мин» через два шага по 10 минут", () => {
    const store = seedEngine();
    const bo = () => store.getState().state.actors.bo;
    const now = () => store.getState().state.time.sec;
    expect(now()).toBe(SEED_SEC);
    const c = concentrationChipProps(bo().concentration!, now());
    expect(c).toMatchObject({ kind: 'conc', icon: 'cond-concentration', label: "Hunter's Mark", timer: '38 мин' });
    expect(c.tip).toContain('Constitution saving throw');
    store.getState().advanceTime('10min', 2);
    expect(concentrationChipProps(bo().concentration!, now()).timer).toBe('18 мин');
  });

  it('Mage Armor у Lyra — бафф с иконкой заклинания и «7 ч»; тултипа у эффекта нет', () => {
    const store = seedEngine();
    const { actors, time } = store.getState().state;
    const e = effectChipProps(actors.lyra.effects![0], time.sec);
    expect(e).toMatchObject({ kind: 'buff', icon: 'spell', label: 'Mage Armor', timer: '7 ч' });
    expect(e.tip).toBeUndefined();
  });

  it('chipsOf: состояния по порядку сетки, затем эффекты, последней концентрация', () => {
    const store = seedEngine();
    const { dispatch } = store.getState();
    dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion', level: 2 } });
    dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
    dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'blinded' } });
    const { actors, time } = store.getState().state;
    expect(chipsOf(actors.bo, time.sec).map(c => c.id)).toEqual(['blinded', 'poisoned', 'exhaustion', 'concentration']);
    expect(chipsOf(actors.lyra, time.sec).map(c => c.id)).toEqual(['effect']);
    expect(chipsOf(actors.korrin, time.sec)).toEqual([]);
    const keys = chipsOf(actors.bo, time.sec).map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('<ConditionChip>', () => {
  it('дебафф по умолчанию: подпись, иконка с title, data-kind, без кнопки снятия и без пиктограмм', () => {
    const { container } = render(<ConditionChip {...chipProps('poisoned')} />);
    const chip = container.querySelector('[data-kind]')!;
    expect(chip.getAttribute('data-kind')).toBe('debuff');
    expect(chip.className).toContain('text-fx-debuff-hi');
    expect(chip.className).toContain('fx-debuff');
    expect(screen.getByText('Отравлен', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Отравлен' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.textContent).not.toMatch(EMOJI);
    expect(chip.className).not.toMatch(/\brounded/);
  });

  it('бафф и концентрация красятся своими токенами', () => {
    const { container } = render(
      <>
        <ConditionChip label="Mage Armor" icon="spell" kind="buff" timer="7 ч" />
        <ConditionChip label="Hunter's Mark" icon="cond-concentration" kind="conc" timer="38 мин" />
      </>,
    );
    const [buff, conc] = [...container.querySelectorAll('[data-kind]')];
    expect(buff.getAttribute('data-kind')).toBe('buff');
    expect(buff.className).toContain('text-fx-buff-hi');
    expect(conc.getAttribute('data-kind')).toBe('conc');
    expect(conc.className).toContain('text-src-sim');
    expect(conc.className).not.toContain('fx-debuff');
    expect(screen.getByText('38 мин')).toBeInTheDocument();
    expect(screen.getByText('7 ч')).toBeInTheDocument();
  });

  it('истощение показывает уровень рядом с подписью', () => {
    render(<ConditionChip {...chipProps('exhaustion', { level: 3 })} />);
    expect(screen.getByText('Истощение', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByTitle('Уровень истощения')).toHaveTextContent('3');
  });

  it('кнопка «Снять: …» есть только с onRemove и зовёт его', () => {
    const onRemove = vi.fn();
    render(<ConditionChip {...chipProps('prone')} onRemove={onRemove} />);
    const btn = screen.getByRole('button', { name: 'Снять: Сбит с ног' });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('тултип: один канал — Radix-тултип с текстом SRD по фокусу, нативного title у чипа нет', async () => {
    const { container } = render(<ConditionChip {...chipProps('blinded')} />);
    const chip = container.querySelector('[data-kind]')!;
    expect(chip.hasAttribute('title')).toBe(false);
    expect(chip.getAttribute('tabindex')).toBe('0');
    expect(chip.className).toContain('focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--fx-debuff),var(--glow-gold)]');
    fireEvent.focus(chip);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('A blinded creature can\'t see');
    expect(tip).toHaveTextContent(CONDITIONS.blinded.text.join(' '));
  });

  it('focusable={false}: тултип остаётся, но чип вне порядка табуляции — для строки-кнопки корешка', () => {
    const { container } = render(<ConditionChip {...chipProps('blinded')} focusable={false} />);
    const chip = container.querySelector('[data-kind]')!;
    expect(chip.hasAttribute('tabindex')).toBe(false);
    expect(chip.getAttribute('data-state')).toBe('closed'); // Radix Trigger на месте
  });

  it('без tip — ни title, ни фокуса, ни курсора-вопроса', () => {
    const { container } = render(<ConditionChip label="Mage Armor" icon="spell" kind="buff" />);
    const chip = container.querySelector('[data-kind]')!;
    expect(chip.hasAttribute('title')).toBe(false);
    expect(chip.hasAttribute('tabindex')).toBe(false);
    expect(chip.className).not.toContain('cursor-help');
  });
});
