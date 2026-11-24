import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassEmblem } from './ClassEmblem';

describe('ClassEmblem delivery', () => {
  it('retains a semantic glyph for an icon outside the class family', () => {
    render(<ClassEmblem icon="ent-pc" title="Персонаж" />);
    expect(screen.getByRole('img', { name: 'Персонаж' }).tagName).toBe('svg');
    expect(document.querySelector('img')).toBeNull();
  });

  it('delivers the mapped class derivative and retains its label if loading fails', async () => {
    const { container } = render(<ClassEmblem icon="cls-voin" title="Класс: Воин" size={18} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const image = container.querySelector('img')!;
    expect(image).toHaveAttribute('alt', 'Класс: Воин');
    expect(image).toHaveAttribute('width', '18');
    expect(image.getAttribute('src')).toMatch(/\/art\/v1\/kimi-class-fighter-v1-48-.+\.webp$/);
    expect(image.getAttribute('srcset')).not.toContain('.png');
    fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Класс: Воин');
  });
});
