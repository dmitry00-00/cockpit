import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { exteriorDoorGeometry, exteriorDoorSides, generateSettlementDraft } from './settlementDraft';
import { SettlementPlanView } from './SettlementPlanView';

const draft = generateSettlementDraft({ placeId: 'place:neverwinter', seed: 'plan-view-test' });

describe('SettlementPlanView', () => {
  it('opens a building detail with rooms and 5ft grid, then returns to the overview', () => {
    const { container } = render(<SettlementPlanView draft={draft} accepted={false} onClose={() => {}}/>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Выбрать Постройка 01' }), { key: 'Enter' });
    expect(screen.getByRole('img', { name: /Постройка 01: комнаты и тактическая сетка 5 футов/ })).toBeTruthy();
    expect(screen.getByText(/Шаг тактической сетки: 5 футов/)).toBeTruthy();
    expect(container.querySelector('pattern[id^="settlement-grid-"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к общему плану' }));
    expect(screen.getByRole('group', { name: 'Общий план поселения' })).toBeTruthy();
  });

  it('keeps acceptance explicit and omits the accept action after acceptance', () => {
    const onAccept = vi.fn();
    const { rerender } = render(<SettlementPlanView draft={draft} accepted={false} onAccept={onAccept} onClose={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: /Выбрать Постройка 01/ }));
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Предложить закрепление' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    rerender(<SettlementPlanView draft={draft} accepted onAccept={onAccept} onClose={() => {}}/>);
    expect(screen.queryByRole('button', { name: 'Предложить закрепление' })).toBeNull();
  });

  it('regenerates only the local draft from description and population until the explicit proposal', () => {
    const onAccept = vi.fn();
    render(<SettlementPlanView draft={draft} accepted={false} onAccept={onAccept} onClose={() => {}}/>);
    fireEvent.click(screen.getByText('Параметры генерации · правило стола'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание поселения для генерации' }), { target: { value: 'поселение вдоль старого тракта' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Население для генерации' }), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перегенерировать план' }));
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Предложить закрепление' }));
    const proposed = onAccept.mock.calls[0][0] as typeof draft;
    expect(proposed.generationProfile).toEqual({ description: 'поселение вдоль старого тракта', population: 500, pattern: 'linear', siteFeature: null, featureSide: null });
    expect(proposed.bounds.width).toBeLessThan(proposed.bounds.height);
    expect(proposed.buildings.length).toBeLessThanOrEqual(12);
  });

  it('loads a Watabou JSON as a separate unscaled reference and keeps draft acceptance explicit', async () => {
    const onAccept = vi.fn();
    render(<SettlementPlanView draft={draft} accepted={false} onAccept={onAccept} onClose={() => {}}/>);
    fireEvent.click(screen.getByText('Параметры генерации · правило стола'));
    const city = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 'values', generator: 'mfcg', version: '0.11.5' },
        { type: 'Polygon', id: 'earth', coordinates: [[[0, 0], [100, 0], [100, 80], [0, 80]]] },
        { type: 'GeometryCollection', id: 'roads', geometries: [{ type: 'LineString', width: 4, coordinates: [[10, 10], [90, 70]] }] },
        { type: 'GeometryCollection', id: 'districts', geometries: [{ type: 'Polygon', name: 'Harbor', coordinates: [[[10, 10], [50, 10], [50, 40], [10, 40]]] }] },
      ],
    };
    const file = new File([JSON.stringify(city)], 'harbor.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(city) });
    fireEvent.change(screen.getByLabelText('Загрузить JSON плана Watabou'), { target: { files: [file] } });
    expect(await screen.findByRole('img', { name: 'Внешний макроплан Watabou · масштаб не задан' })).toBeTruthy();
    expect(screen.getByText(/Координаты сохранены в условных единицах MFCG/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Предложить закрепление' }).hasAttribute('disabled')).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Показать черновик поселения' }));
    expect(screen.getByRole('group', { name: 'Общий план поселения' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Предложить закрепление' }).hasAttribute('disabled')).toBe(false);
  });

  it('renders an explicit river route through the generated town and leaves it as a local draft', () => {
    const onAccept = vi.fn();
    render(<SettlementPlanView draft={draft} accepted={false} onAccept={onAccept} onClose={() => {}}/>);
    fireEvent.click(screen.getByText('Параметры генерации · правило стола'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание поселения для генерации' }), { target: { value: 'река протекает через город' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перегенерировать план' }));
    const river = screen.getByRole('img', { name: 'Порождённое русло реки' });
    expect(river.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByText(/оставляет его свободным от зданий/)).toBeTruthy();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('moves the exterior door to another eligible room wall and keeps the draft valid', () => {
    const firstBuilding = draft.buildings[0];
    const currentDoor = firstBuilding.doors.find(door => door.connects.includes('outside'))!;
    const currentRoomId = currentDoor.connects.find(id => id !== 'outside')!;
    const target = firstBuilding.rooms.map(room => ({ room, sides: exteriorDoorSides(firstBuilding, room.id) }))
      .find(item => item.room.id !== currentRoomId && item.sides.length > 0)!;
    const side = target.sides[0];
    const geometry = exteriorDoorGeometry(firstBuilding, target.room.id, side)!;
    render(<SettlementPlanView draft={draft} accepted={false} onAccept={() => {}} onClose={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: /Выбрать Постройка 01/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Комната для наружной двери' }), { target: { value: target.room.id } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Стена наружной двери' }), { target: { value: side } });
    fireEvent.click(screen.getByRole('button', { name: 'Перенести наружную дверь' }));
    expect((screen.getByRole('spinbutton', { name: 'Начало двери X в футах' }) as HTMLInputElement).value).toBe(String(geometry.a.x));
    expect((screen.getByRole('spinbutton', { name: 'Начало двери Y в футах' }) as HTMLInputElement).value).toBe(String(geometry.a.y));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Предложить закрепление' }).hasAttribute('disabled')).toBe(false);
  });

  it('blocks acceptance and UVTT export with a localized error when rooms overlap', () => {
    const building = draft.buildings[0];
    const outlineX = building.outline.map(point => point.x);
    const buildingWidth = Math.max(...outlineX) - Math.min(...outlineX);
    render(<SettlementPlanView draft={draft} accepted={false} onAccept={() => {}} onClose={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: /Выбрать Постройка 01/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Ширина комнаты в футах' }), { target: { value: String(buildingWidth) } });
    expect(screen.getByRole('alert').textContent).toContain('Комнаты пересекаются.');
    expect(screen.getByRole('button', { name: 'Предложить закрепление' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Подготовить UVTT · 5 футов' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Скачать UVTT' })).toBeNull();
  });

  it('adds a second exterior door and includes it only in the explicit proposal', () => {
    const onAccept = vi.fn();
    render(<SettlementPlanView draft={draft} accepted={false} onAccept={onAccept} onClose={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: /Выбрать Постройка 01/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить наружную дверь' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Предложить закрепление' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Предложить закрепление' }));
    const proposed = onAccept.mock.calls[0][0] as typeof draft;
    expect(proposed.buildings[0].doors.filter(door => door.connects.includes('outside'))).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить дверь' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Дверь для редактирования' }), { target: { value: proposed.buildings[0].doors.find(door => door.connects.includes('outside'))!.id } });
    expect(screen.getByRole('button', { name: 'Удалить дверь' }).hasAttribute('disabled')).toBe(true);
  });

  it('closes on Escape and shows the canonical label as a separate reference', () => {
    const onClose = vi.fn();
    render(<SettlementPlanView draft={draft} accepted onClose={onClose} canonicalLabel="Канонический план известен"/>);
    expect(screen.getByText('Канонический план известен')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
