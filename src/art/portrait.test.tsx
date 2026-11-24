import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortraitImage, resolveBuiltInPortrait } from './portrait';

describe('встроенные портреты', () => {
  it('принимает только известную типизированную ссылку на портрет, не URL или неизвестный id', () => {
    expect(resolveBuiltInPortrait('bo-portrait')).toBe('bo-portrait');
    expect(resolveBuiltInPortrait('codex-korrin-v1')).toBe('codex-korrin-v1');
    expect(resolveBuiltInPortrait('codex-lyra-v1')).toBe('codex-lyra-v1');
    expect(resolveBuiltInPortrait('codex-aldric-v1')).toBe('codex-aldric-v1');
    expect(resolveBuiltInPortrait('portrait-ranger-a')).toBeUndefined();
    expect(resolveBuiltInPortrait('https://example.invalid/portrait.png')).toBeUndefined();
    expect(resolveBuiltInPortrait(null)).toBeUndefined();
  });

  it('неизвестная ссылка сохраняет caller placeholder; ошибка файла становится доступным placeholder', async () => {
    const { rerender } = render(<><PortraitImage portrait="unknown" alt="Портрет: тест" width={64} /><span data-part="fallback">значок персонажа</span></>);
    expect(screen.queryByRole('img', { name: 'Портрет: тест' })).toBeNull();
    expect(screen.getByText('значок персонажа')).toBeInTheDocument();
    rerender(<PortraitImage portrait="bo-portrait" alt="Портрет: Bo" width={64} sizes="64px" fallback={<span data-part="old-icon">значок игрока</span>} />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Портрет: Bo' }).tagName).toBe('IMG'));
    const image = screen.getByRole('img', { name: 'Портрет: Bo' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('width', '64');
    expect(image).toHaveAttribute('sizes', '64px');
    expect(image.getAttribute('srcset')).toContain('256w');
    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'Портрет: Bo' }).tagName).toBe('SPAN');
    expect(screen.getByText('значок игрока')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
