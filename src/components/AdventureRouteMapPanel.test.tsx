import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdventureRouteMapPanel } from './AdventureRouteMapPanel';

describe('adventure route map status', () => {
  it('shows authored status and topology without drawing or measuring a route', () => {
    const { container } = render(<AdventureRouteMapPanel routes={[{ id: 'supply', name: 'Доставка припасов', status: 'closed', places: ['Невервинтер', 'Триборская тропа', 'Фандалин'] }]} />);
    expect(screen.getByRole('region', { name: 'Доступность маршрутов на карте' })).toHaveTextContent('закрыт');
    expect(screen.getByText('Невервинтер → Триборская тропа → Фандалин')).toBeInTheDocument();
    expect(screen.getByText(/Трассы и расстояния не заданы/)).toBeInTheDocument();
    expect(container.querySelector('svg, path, polyline')).toBeNull();
  });
});
