import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerProjection } from './types';
import { PlayerApp } from './PlayerApp';

afterEach(cleanup);

function projection(): PlayerProjection {
  return {
    schemaVersion: 1,
    revision: 8,
    updatedAt: '2026-11-03T10:15:00.000Z',
    hero: {
      name: 'Bo Tambernack', ancestry: 'Полурослик', className: 'Следопыт', level: 5,
      hp: { current: 41, maximum: 49, temporary: 0 }, armorClass: 16,
      abilities: [{ label: 'Сила', score: 10, modifier: 0, savingThrow: 0, savingThrowProficient: false }],
      skills: [{ label: 'Выживание', modifier: 6, proficiency: 'proficient' }],
      attacks: [{ name: 'Длинный лук', toHit: 7, damage: '1d8+3', damageType: 'колющий', range: '150/600 футов' }],
      resources: [{ label: 'Ячейки 1-го круга', available: 2, maximum: 2, restoresOn: 'long' }],
      conditions: [], equipment: [{ name: 'Длинный лук', quantity: 1 }, { name: 'Стрела', quantity: 20 }],
      features: [
        { kind: 'class', name: 'Боевой стиль: стрельба', level: 2 },
        { kind: 'ancestry', name: 'Невысокая ловкость' },
        { kind: 'feat', name: 'Наблюдательный', level: 4 },
      ],
      spells: [{ name: 'Метка охотника', kind: 'known', level: 1 }, { name: 'Друидское чутьё', kind: 'cantrip', level: 0 }],
    },
    party: [{ name: 'Bo Tambernack', hp: { current: 41, maximum: 49, temporary: 0 }, conditions: [], currentTurn: true }],
    worldTime: { date: '15 Mirtul 1492 DR', time: '08:00', tempo: 'Час' },
    encounter: { active: true, round: 2, currentTurn: 'party' },
    updates: [],
  };
}

describe('PlayerApp', () => {
  it('shows an accessible mobile sheet with the allowlisted player sections', () => {
    render(<PlayerApp projection={projection()} status="online" onDisconnect={vi.fn()} />);
    expect(screen.getByRole('main', { name: 'Лист игрока' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Подключено');
    expect(screen.getByRole('region', { name: 'Игровое время' })).toHaveTextContent('15 Mirtul 1492 DR');
    expect(screen.getByRole('tab', { name: 'Обзор' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Состояние персонажа' })).toHaveTextContent('41 / 49');
    expect(screen.getByRole('region', { name: 'Навыки' })).toHaveTextContent('Выживание');
    expect(screen.getByRole('region', { name: 'Атаки' })).toHaveTextContent('Длинный лук');
    expect(screen.getByRole('region', { name: 'Ресурсы' })).toHaveTextContent('2 / 2');
    expect(screen.getByRole('region', { name: 'Партия и ход' })).toHaveTextContent('Раунд 2');

    fireEvent.click(screen.getByRole('tab', { name: 'Снаряжение' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Стрела');
    fireEvent.click(screen.getByRole('tab', { name: 'Умения' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Боевой стиль: стрельба');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Черты происхождения');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Заклинания' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Метка охотника');
  });

  it('shows the bounded public journal summaries received in the safe projection', () => {
    const data = projection();
    data.updates = [{ id: 'public-event-1', at: 100, worldSec: 200, text: 'Партия купила 1 × Longsword у торговца за 100 мм' }];
    render(<PlayerApp projection={data} status="online" onDisconnect={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'События' }));
    expect(screen.getByRole('region', { name: 'Последние события' })).toHaveTextContent('Партия купила 1 × Longsword у торговца за 100 мм');
  });

  it('shows only the local rumors passed through the safe projection', () => {
    const data = projection();
    data.rumors = [{ text: 'У южных ворот видели незнакомцев', location: 'Neverwinter' }];
    render(<PlayerApp projection={data} status="online" onDisconnect={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Слухи' }));
    expect(screen.getByRole('region', { name: 'Слухи поблизости' })).toHaveTextContent('У южных ворот видели незнакомцев');
    expect(screen.getByRole('region', { name: 'Слухи поблизости' })).toHaveTextContent('Neverwinter');
  });

  it('continues to render an older offline snapshot without the optional updates field', () => {
    const data = projection();
    delete data.updates;
    render(<PlayerApp projection={data} status="offline" onDisconnect={vi.fn()} />);
    expect(screen.getByRole('main', { name: 'Лист игрока' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'События' })).not.toBeInTheDocument();
  });

  it('marks the last snapshot stale when offline and allows a disconnect callback', () => {
    const onDisconnect = vi.fn();
    render(<PlayerApp projection={projection()} status="offline" lastUpdatedAt={Date.UTC(2026, 10, 3, 10, 15)} onDisconnect={onDisconnect} />);
    expect(screen.getByRole('status')).toHaveTextContent('Нет связи');
    expect(screen.getByText(/сохранённый снимок/)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Bo Tambernack');
    fireEvent.click(screen.getByRole('button', { name: 'Отключиться' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('does not render a revoked projection, even if a stale DTO is supplied', () => {
    render(<PlayerApp projection={projection()} status="revoked" onDisconnect={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Доступ отозван');
    expect(screen.getByText('Мастер отозвал доступ к этому персонажу.')).toBeInTheDocument();
    expect(screen.queryByText('Bo Tambernack')).toBeNull();
  });

  it('explains that no sheet is available while waiting for a connection', () => {
    render(<PlayerApp projection={null} status="connecting" onDisconnect={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Подключаемся');
    expect(screen.getByText(/безопасного подключения/)).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
