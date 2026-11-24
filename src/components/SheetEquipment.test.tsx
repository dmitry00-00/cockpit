import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpenEntityContext } from './openEntity';
import { SheetEquipment } from './SheetSections';

describe('E7: ссылки снаряжения', () => {
  it('предмет с количеством открывает точную существующую сущность', () => {
    const open = vi.fn();
    render(<OpenEntityContext.Provider value={open}><SheetEquipment sheet={{ equipment: [{ id: 'longbow', qty: 2 }] }} /></OpenEntityContext.Provider>);
    const button = screen.getByRole('button', { name: 'Открыть предмет: Longbow' });
    expect(button).toHaveTextContent('×2');
    fireEvent.click(button); expect(open).toHaveBeenCalledExactlyOnceWith('item:longbow');
  });
  it('неизвестный id не превращается в выдуманную ссылку; без обработчика список остаётся читаемым', () => {
    const view = render(<OpenEntityContext.Provider value={() => {}}><SheetEquipment sheet={{ equipment: [{ id: 'unknown-owner-item', qty: 1 }] }} /></OpenEntityContext.Provider>);
    expect(screen.queryByRole('button')).toBeNull(); expect(screen.getByRole('list')).toHaveTextContent('unknown-owner-item');
    view.rerender(<SheetEquipment sheet={{ equipment: [{ id: 'longbow', qty: 1 }] }} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(screen.getByRole('list')).toHaveTextContent('Longbow');
  });
});
