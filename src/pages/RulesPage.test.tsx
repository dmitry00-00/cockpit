// «Правила кампании» (Д7): манифест механик со слоями, расхождение Драконорождённого с SRD (пример DESIGN Д7), 18
// замечаний импорта дословно; у шага вывода числа листа — метка слоя.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as layers from '../rules/layers';
afterEach(() => vi.restoreAllMocks());
import report from '../../content/compendium/report.md?raw';
import { explain, seedState } from '../campaign';
import { CAMPAIGN_RULES, raceDivergences } from '../rules/layers';
import { RulesPage, importNotes } from './RulesPage';

describe('правила кампании (Д7)', () => {
  it('переключает тему стресса только явным действием мастера', () => {
    const onStrifeThemeChange = vi.fn();
    render(<RulesPage strifeEnabled={false} onStrifeThemeChange={onStrifeThemeChange} />);
    const toggle = screen.getByRole('checkbox', { name: 'Включить тему стресса и морали' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onStrifeThemeChange).toHaveBeenCalledWith(true);
  });

  it('манифест: механики со слоями; поход — SRD и A5E, черты — только таблица владельца', () => {
    render(<RulesPage />);
    const table = screen.getByRole('table', { name: 'Механики и слои' });
    expect(within(table).getAllByRole('row')).toHaveLength(CAMPAIGN_RULES.length + 1);
    const travel = table.querySelector('[data-mechanic="travel"]')!;
    expect([...travel.querySelectorAll('[data-layer]')].map(e => e.getAttribute('data-layer'))).toEqual(['srd', 'a5e']);
    expect([...table.querySelector('[data-mechanic="feats"]')!.querySelectorAll('[data-layer]')].map(e => e.textContent)).toEqual(['таблицы владельца']);
  });

  it('исправленные SRD-расы не показывают устаревшую таблицу расхождений', () => {
    expect(raceDivergences()).toEqual([]);
    render(<RulesPage />);
    expect(screen.queryByRole('table', { name: 'Расхождения таблиц владельца с SRD' })).toBeNull();
    expect(screen.getByText(/расхождений с SRD 0/)).toBeInTheDocument();
  });

  it('найденное расхождение показывает обе версии, не подменяя правило', () => {
    vi.spyOn(layers, 'raceDivergences').mockReturnValue([
      { mechanic: 'races', subject: 'Проверочная раса', owner: '+2 STR', srd: '+1 STR' },
    ]);
    render(<RulesPage />);
    const table = screen.getByRole('table', { name: 'Расхождения таблиц владельца с SRD' });
    expect(table).toHaveTextContent('Проверочная раса');
    expect(table).toHaveTextContent('+2 STR');
    expect(table).toHaveTextContent('+1 STR');
  });

  it('оставшиеся замечания импорта показаны дословно без исчезнувших дублей', () => {
    const notes = importNotes(report);
    expect(notes).toHaveLength(7);
    render(<RulesPage />);
    const list = screen.getByRole('list', { name: 'Замечания импорта компендиума' });
    expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual(notes);
    expect(list).toHaveTextContent('«Боязнь крови»');
    expect(list).not.toHaveTextContent('«Стихийный адепт» встречается в таблице дважды');
  });

  it('вывод числа листа: шаги со строкой SRD — слой srd; расхождение с листом — без слоя', () => {
    const bo = { ...seedState().actors.bo };
    expect(explain(bo, 'ac')!.steps.map(s => s.layer)).toEqual(explain(bo, 'ac')!.steps.map(() => 'srd'));
    const off = explain({ ...bo, ac: bo.ac + 3 }, 'ac')!;
    expect(off.steps.at(-1)).toMatchObject({ mismatch: true, value: 3 });
    expect(off.steps.at(-1)!.layer).toBeUndefined();
  });
});
