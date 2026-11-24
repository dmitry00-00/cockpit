import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ArtImage } from './ArtImage';

describe('ArtImage', () => {
  it('выбирает производные srcset, сохраняет пропорции, ленивую загрузку и alt', () => {
    render(<ArtImage asset="instrument-stones-a" alt="Парные камни" width={256} />);
    const image = screen.getByRole('img', { name: 'Парные камни' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('width', '256');
    expect(image).toHaveAttribute('height', '171');
    expect(image.getAttribute('src')).toMatch(/^\/art\/v1\/.+\.webp$/);
    expect(image.getAttribute('srcset')).toContain('512w');
    expect(image.getAttribute('src')).not.toContain('design/');
  });
  it('при ошибке не скачивает исходник; смена ассета сбрасывает ошибку', () => {
    const { rerender } = render(<ArtImage asset="portrait-ranger-a" alt="Следопыт" width={64} />);
    fireEvent.error(screen.getByAltText('Следопыт'));
    expect(screen.getByRole('img', { name: 'Следопыт' }).tagName).toBe('SPAN');
    expect(document.querySelector('img')).toBeNull();
    rerender(<ArtImage asset="portrait-warrior-a" alt="Воин" width={64} />);
    expect(screen.getByAltText('Воин').tagName).toBe('IMG');
  });
  it('декоративная картинка и её ошибка не получают доступное имя', () => {
    render(<ArtImage asset="item-herb-a" alt="" width={48} />);
    fireEvent.error(document.querySelector('img')!);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
