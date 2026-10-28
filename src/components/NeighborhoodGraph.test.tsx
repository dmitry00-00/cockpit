// Схема окрестности (E2): узлы групп — кнопки, открывают связь щелчком и с клавиатуры; без колбэка — просто рисунок;
// рёбра — к ближайшей группе сверху и ко всем снизу, аспекты пунктиром.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EntityDiagram } from '../entities';
import { NeighborhoodGraph } from './NeighborhoodGraph';

const diagram: EntityDiagram = {
  above: [{ title: 'Служит', links: [{ label: 'Mystra', ref: 'deity:mystra' }] }],
  below: [
    { title: 'Служат ему', links: [{ label: 'Savras', ref: 'deity:savras' }, { label: 'Velsharoon', ref: 'deity:velsharoon' }, { label: 'A very long deity name indeed here', ref: 'deity:long' }, { label: 'Four', ref: 'deity:four' }] },
    { title: 'Аспекты', links: [{ label: 'Savras', ref: 'deity:savras' }], dashed: true },
  ],
};

describe('NeighborhoodGraph', () => {
  it('середина, подписи групп, узлы-кнопки; щелчок и Enter открывают связь', () => {
    const open = vi.fn();
    render(<NeighborhoodGraph name="Azuth" diagram={diagram} onOpen={open} />);
    const svg = screen.getByRole('img', { name: 'Схема связей: Azuth' });
    expect(svg.querySelector('[data-part="center"]')).toHaveTextContent('Azuth');
    for (const t of ['Служит', 'Служат ему', 'Аспекты']) expect(svg).toHaveTextContent(t);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть: Mystra' }));
    expect(open).toHaveBeenLastCalledWith('deity:mystra');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Открыть: Four' }), { key: 'Enter' });
    expect(open).toHaveBeenLastCalledWith('deity:four');
    // Один бог в двух группах — два узла.
    expect(screen.getAllByRole('button', { name: 'Открыть: Savras' })).toHaveLength(2);
    // Рёбра: 1 сверху + 4 + 1 снизу; пунктир — только у аспекта.
    const lines = svg.querySelectorAll('line');
    expect(lines).toHaveLength(6);
    expect([...lines].filter(l => l.getAttribute('stroke-dasharray'))).toHaveLength(1);
    // Длинное имя — две строки с многоточием, полное — в подсказке.
    const long = svg.querySelector('[data-node="deity:long"]')!;
    expect(long.querySelectorAll('text')).toHaveLength(2);
    expect(long.querySelector('title')).toHaveTextContent('A very long deity name indeed here');
  });

  it('без колбэка узлы не кнопки', () => {
    render(<NeighborhoodGraph name="Azuth" diagram={diagram} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
