import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdventurePreview } from './AdventurePreview';
import type { AdventureSession } from '../engine/state';
const raw = () => JSON.parse(readFileSync(`${process.cwd()}/research/content-phandelver/first-vertical.json`,'utf8'));
describe('adventure source graph preview', () => {
  it('follows scene → place and back through sourced relationships, exposes preparation limits', () => {
    render(<AdventurePreview data={raw()} />);
    let entry = screen.getByRole('article',{name:'Запись: Засада на дороге'});
    expect(entry).toHaveTextContent('PDF 6, 7');
    fireEvent.click(within(entry).getAllByRole('button',{name:'Место гоблинской засады'})[0]);
    entry = screen.getByRole('article',{name:'Запись: Место гоблинской засады'});
    fireEvent.click(within(entry).getByText(/^Связанные записи/));
    fireEvent.click(within(entry).getByRole('button',{name:'Засада на дороге'}));
    expect(screen.getByRole('article',{name:'Запись: Засада на дороге'})).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox',{name:'Раздел разметки'}),{target:{value:'plan'}});
    fireEvent.click(within(screen.getByRole('list',{name:'Планы'})).getByRole('button',{name:'План Фандалина'}));
    expect(screen.getByRole('article',{name:'Запись: План Фандалина'})).toHaveTextContent('открыта редакторская геометрия областей');
    expect(screen.getByText(/Места, участники и предложения ещё не активированы/)).toBeInTheDocument();
  });
  it('opens a scene run sheet that follows place → plan → clues without activating rules or tokens', () => {
    render(<AdventurePreview data={raw()} />);
    fireEvent.click(screen.getByRole('button',{name:'Переговоры о пленнике'}));
    const runSheet = screen.getByRole('region',{name:'Игровая вертикаль сцены: Переговоры о пленнике'});
    expect(runSheet).toHaveTextContent('Убежище Каменных Пастей');
    expect(runSheet).toHaveTextContent('Йемик');
    expect(runSheet).toHaveTextContent('Сильдар Холлвинтер');
    expect(runSheet).toHaveTextContent('Где удерживают Сильдара');
    expect(runSheet).toHaveTextContent('Карта Пещеры Морского Эха Гандрена');
    expect(within(runSheet).getByRole('button',{name:'Открыть план · План убежища Каменных Пастей'})).toBeInTheDocument();
    expect(within(runSheet).queryByRole('button',{name:'Раскрыть'})).toBeNull();
    expect(within(runSheet).getByText(/Движение токенов, инициатива и поле видимости работают в MapTool/)).toBeInTheDocument();
    fireEvent.click(within(runSheet).getByRole('button',{name:'Открыть план · План убежища Каменных Пастей'}));
    expect(screen.getByRole('article',{name:'Запись: План убежища Каменных Пастей'})).toBeInTheDocument();
  });
  it('rejects malformed data visibly rather than rendering an unvalidated graph', () => {
    render(<AdventurePreview data={{format:'unknown'}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('неподдерживаемый формат');
  });
  it('proposes route state changes and replans without closed edges', () => {
    const data = raw();
    const session: AdventureSession = {
      id: data.id, contentId: data.id, graph: data, title: data.title, distribution: data.distribution,
      settingPackageId: data.setting, rulesPackageIds: data.rules, partyIds: ['bo'], entrySceneId: data.entry,
      secretFactId: 'secret', startedSec: 0, status: 'active', routeStates: {},
    };
    const onRouteStatus = vi.fn();
    const view = render(<AdventurePreview data={data} session={session} onRouteStatus={onRouteStatus} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Начало маршрута' }), { target: { value: 'neverwinter' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Конец маршрута' }), { target: { value: 'phandalin' } });
    expect(screen.getByRole('status')).toHaveTextContent('Невервинтер → Главный тракт → Триборская тропа → Фандалин');
    fireEvent.change(screen.getByRole('textbox', { name: 'Причина изменения маршрута' }), { target: { value: 'мост разрушен' } });
    const routeSection = screen.getByRole('region', { name: 'Маршруты и их доступность' });
    const supplyRoute = within(routeSection).getByText(/Доставка припасов/).closest('li')!;
    fireEvent.click(within(supplyRoute).getByRole('button', { name: 'Закрыть маршрут' }));
    expect(onRouteStatus).toHaveBeenCalledWith('supply-route', 'closed', 'мост разрушен');
    const closed = { ...session, routeStates: { 'supply-route': { status: 'closed' as const, causeId: 'event-1', reason: 'мост разрушен', proposedSec: 0 } } };
    view.rerender(<AdventurePreview data={data} session={closed} onRouteStatus={onRouteStatus} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Начало маршрута' }), { target: { value: 'neverwinter' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Конец маршрута' }), { target: { value: 'phandalin' } });
    expect(screen.getByRole('status')).toHaveTextContent('Нет доступного пути');
    expect(screen.getByText(/Проверить проекцию игрокам/)).toBeInTheDocument();
  });
});
