import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POST_SPELLPLAGUE_FR4E } from './postSpellplagueFr4e.data';
import { PostSpellplagueFr4e } from './PostSpellplagueFr4e';

describe('FR 4e post-Spellplague visual lens', () => {
  it('keeps the source snapshot distinct from the unsupported adoption period', () => {
    expect(POST_SPELLPLAGUE_FR4E.sourceSlice).toBe('Срез книги: 1479 DR');
    expect(POST_SPELLPLAGUE_FR4E.contextNote).toContain('1385 DR');
    expect(POST_SPELLPLAGUE_FR4E.title).toContain('Axis-compatible');
    expect(POST_SPELLPLAGUE_FR4E.title).not.toBe('World Axis');
  });

  it('shows the required planes and source-linked text alternative', () => {
    const { container } = render(<PostSpellplagueFr4e />);
    const svg = screen.getByRole('img', { name: /FR 4e post-Spellplague/ });
    expect(svg).toBeInTheDocument();
    for (const phrase of ['Toril + Abeir', 'Feywild', 'Shadowfell', 'Астральное море', 'Элементальный Хаос', 'Бездна']) {
      expect(container.textContent).toContain(phrase);
    }

    fireEvent.click(screen.getByText('Текстовая расшифровка узлов и связей'));
    const sourceLinks = container.querySelectorAll('details a[href="https://theberserker.net/restricted/DnD/4E_Forgotten_Realms_CG.pdf"]');
    expect(sourceLinks).toHaveLength(POST_SPELLPLAGUE_FR4E.nodes.length + POST_SPELLPLAGUE_FR4E.links.length);
    expect(container.querySelectorAll('[data-node]')).toHaveLength(POST_SPELLPLAGUE_FR4E.nodes.length - 1);
    expect(container.querySelectorAll('[data-link]')).toHaveLength(POST_SPELLPLAGUE_FR4E.links.length);
  });
});
