import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokensPage } from './TokensPage';
import { COLORS, TYPE_GROUPS } from '../styles/tokens.generated';

describe('страница токенов', () => {
  it('показывает каждый цвет и каждый стиль типографики по имени', () => {
    render(<TokensPage />);
    for (const c of COLORS) expect(screen.getAllByText(c.name).length).toBeGreaterThan(0);
    for (const g of TYPE_GROUPS) for (const st of g.styles) {
      expect(screen.getAllByText(st.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(st.sample).length).toBeGreaterThan(0);
    }
  });
  it('в разметке нет эмодзи', () => {
    const { container } = render(<TokensPage />);
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
