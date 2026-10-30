// «Правила кампании» (Д7): манифест механик со слоями, расхождение Драконорождённого с SRD (пример DESIGN Д7), 18
// замечаний импорта дословно; у шага вывода числа листа — метка слоя.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import report from '../../content/compendium/report.md?raw';
import { explain, seedState } from '../campaign';
import { CAMPAIGN_RULES, raceDivergences } from '../rules/layers';
import { RulesPage, importNotes } from './RulesPage';

describe('правила кампании (Д7)', () => {
  it('манифест: механики со слоями; поход — SRD и A5E, черты — только таблица владельца', () => {
    render(<RulesPage />);
    const table = screen.getByRole('table', { name: 'Механики и слои' });
    expect(within(table).getAllByRole('row')).toHaveLength(CAMPAIGN_RULES.length + 1);
    const travel = table.querySelector('[data-mechanic="travel"]')!;
    expect([...travel.querySelectorAll('[data-layer]')].map(e => e.getAttribute('data-layer'))).toEqual(['srd', 'a5e']);
    expect([...table.querySelector('[data-mechanic="feats"]')!.querySelectorAll('[data-layer]')].map(e => e.textContent)).toEqual(['таблицы владельца']);
  });

  it('расхождения: Драконорождённый — в таблице +2 STR, +2 INT, в SRD +2 STR, +1 CHA; то же, что нашёл импортёр', () => {
    render(<RulesPage />);
    const row = screen.getByRole('table', { name: 'Расхождения таблиц владельца с SRD' }).querySelector('[data-divergence="Драконорождённый"]')!;
    expect(row).toHaveTextContent('+2 STR, +2 INT');
    expect(row).toHaveTextContent('+2 STR, +1 CHA');
    // Каждое расхождение рас — и в отчёте импорта: две сверки не разошлись.
    for (const d of raceDivergences()) expect(importNotes(report).some(n => n.includes(d.subject) && n.includes(d.owner))).toBe(true);
  });

  it('замечания импорта — все 18, дословно', () => {
    render(<RulesPage />);
    const list = screen.getByRole('list', { name: 'Замечания импорта компендиума' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(18);
    expect(list).toHaveTextContent('«Стихийный адепт» встречается в таблице дважды');
  });

  it('вывод числа листа: шаги со строкой SRD — слой srd; расхождение с листом — без слоя', () => {
    const bo = { ...seedState().actors.bo };
    expect(explain(bo, 'ac')!.steps.map(s => s.layer)).toEqual(explain(bo, 'ac')!.steps.map(() => 'srd'));
    const off = explain({ ...bo, ac: bo.ac + 3 }, 'ac')!;
    expect(off.steps.at(-1)).toMatchObject({ mismatch: true, value: 3 });
    expect(off.steps.at(-1)!.layer).toBeUndefined();
  });
});
