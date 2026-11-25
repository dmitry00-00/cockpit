import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TokensPage } from '../pages/TokensPage';

describe('отложенный каталог графики', () => {
  it('не создаёт запросы img до открытия, затем показывает каталог с продуктовыми привязками', async () => {
    render(<TokensPage />);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Показать иллюстрации' }));
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(36));
    expect(screen.getByRole('button', { name: 'Скрыть иллюстрации' })).toHaveAttribute('aria-expanded', 'true');
    expect([...document.querySelectorAll('img')].every(i => i.loading === 'lazy' || i.getAttribute('loading') === 'lazy')).toBe(true);
    expect(screen.getByText(/245 встроенных ассетов/)).toBeInTheDocument();
    expect(screen.getByText(/Bo Tambernack/)).toBeInTheDocument();
    expect(screen.getByText(/только в каталоге/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть иллюстрации' }));
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
});
