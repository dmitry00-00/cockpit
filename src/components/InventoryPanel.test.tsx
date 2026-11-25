import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedState } from '../campaign';
import { legacyStacksForActor } from '../engine/inventory';
import type { InventoryStack } from '../engine/state';
import { InventoryPanel } from './InventoryPanel';
import { OpenEntityContext } from './openEntity';

describe('E7: управление имуществом на карточке', () => {
  const state = seedState();
  const actor = state.actors.bo!;

  it('открывает существующую карточку SRD из строки инвентаря и не выдумывает ссылки для неизвестных вещей', () => {
    const open = vi.fn();
    const longbow: InventoryStack = { id: 'longbow-stack', itemId: 'longbow', qty: 2, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id } };
    const unknown: InventoryStack = { ...longbow, id: 'unknown-stack', itemId: 'owner-specific-item' };
    render(<OpenEntityContext.Provider value={open}><InventoryPanel actor={actor} stacks={[longbow, unknown]} dmView /></OpenEntityContext.Provider>);
    const button = screen.getByRole('button', { name: 'Открыть предмет: Longbow' });
    expect(button).toHaveTextContent('×2');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledExactlyOnceWith('item:longbow');
    expect(screen.queryByRole('button', { name: 'Открыть предмет: owner-specific-item' })).toBeNull();
  });

  it('выдаёт предмет отдельным стеком с владельцем и местом хранения', () => {
    const onGain = vi.fn();
    render(<InventoryPanel actor={actor} stacks={legacyStacksForActor(actor)} dmView onGain={onGain} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Предмет' }), { target: { value: 'longsword' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Получить' }));
    expect(onGain).toHaveBeenCalledOnce();
    expect(onGain.mock.calls[0][0]).toMatchObject({
      itemId: 'longsword', qty: 2,
      owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id },
    });
    expect(onGain.mock.calls[0][0].id).toMatch(/^item:bo:/);
  });

  it('потеря уменьшает указанный стек на одну единицу', () => {
    const onLose = vi.fn();
    const stack = legacyStacksForActor(actor).find(item => item.itemId === 'arrow')!;
    render(<InventoryPanel actor={actor} stacks={[stack]} dmView onLose={onLose} />);
    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    fireEvent.click(screen.getByRole('button', { name: 'Потерять одну единицу: Arrow' }));
    expect(onLose).toHaveBeenCalledExactlyOnceWith(stack.id, 1);
  });

  it('ведёт кошелёк пятью раздельными номиналами и включает монеты в вес SRD', () => {
    const onGain = vi.fn(), onLose = vi.fn();
    const coins: InventoryStack = { id: 'gold', itemId: 'coin:gp', qty: 50, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id } };
    const view = render(<InventoryPanel actor={actor} stacks={[coins]} dmView onGain={onGain} onLose={onLose} />);
    expect(screen.getByLabelText('Монеты персонажа')).toHaveTextContent('50 зм');
    expect(screen.getByText(/Вес 1 фнт/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Предмет' }), { target: { value: 'coin:sp' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество' }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Получить' }));
    expect(onGain.mock.calls[0][0]).toMatchObject({ itemId: 'coin:sp', qty: 7, owner: { kind: 'actor', id: actor.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Потерять одну монету: Золотая' }));
    expect(onLose).toHaveBeenCalledExactlyOnceWith('gold', 1);
    view.unmount();
  });

  it('перемещает и передаёт часть стека монет с сохранением остатка',()=>{
    const onMove=vi.fn(),onTransfer=vi.fn();
    const gold:InventoryStack={id:'gold-stack',itemId:'coin:gp',qty:12,owner:{kind:'actor',id:actor.id},storage:{kind:'actor',id:actor.id}};
    render(<InventoryPanel actor={actor} stacks={[gold]} dmView onMove={onMove} onTransfer={onTransfer}/>);
    fireEvent.click(screen.getByText('Действия со стеками монет'));
    fireEvent.change(screen.getByRole('spinbutton',{name:'Количество монет для переноса'}),{target:{value:'5'}});
    fireEvent.click(screen.getByRole('button',{name:'Убрать монеты в запас партии'}));
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0].slice(0,3)).toEqual(['gold-stack',5,{kind:'party'}]);
    expect(onMove.mock.calls[0][3]).toMatch(/^item:bo:/);
    fireEvent.change(screen.getByRole('spinbutton',{name:'Количество монет для переноса'}),{target:{value:'3'}});
    fireEvent.click(screen.getByRole('button',{name:'Передать монеты партии'}));
    expect(onTransfer).toHaveBeenCalledOnce();
    expect(onTransfer.mock.calls[0].slice(0,4)).toEqual(['gold-stack',3,{kind:'party'},{kind:'party'}]);
    expect(onTransfer.mock.calls[0][4]).toMatch(/^item:bo:/);
  });

  it('предлагает равноценный обмен и отправляет только намерение с точным результатом', () => {
    const onExchange = vi.fn();
    const gold: InventoryStack = { id: 'gold', itemId: 'coin:gp', qty: 3, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id }, visibility: 'players' };
    render(<InventoryPanel actor={actor} stacks={[gold]} dmView onExchange={onExchange} />);
    fireEvent.click(screen.getByText('Обменять монеты'));
    fireEvent.change(screen.getByRole('combobox', { name: 'На номинал' }), { target: { value: 'coin:sp' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество для обмена' }), { target: { value: '2' } });
    expect(screen.getByText('Получит: 20 см')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Обменять' }));
    expect(onExchange).toHaveBeenCalledOnce();
    expect(onExchange.mock.calls[0].slice(0, 4)).toEqual(['gold', 2, 'coin:sp', 20]);
    expect(onExchange.mock.calls[0][4]).toMatch(/^item:bo:/);
  });

  it('перемещает стек между личным местом и общим запасом, а настроенную вещь блокирует', () => {
    const onMove = vi.fn(),onTransfer=vi.fn();
    const carried: InventoryStack = { id: 'arrows', itemId: 'arrow', qty: 20, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id } };
    const view = render(<InventoryPanel actor={actor} stacks={[carried]} dmView onMove={onMove} onTransfer={onTransfer} />);
    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    fireEvent.click(screen.getByRole('button', { name: 'Убрать в запас' }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith('arrows', 20, { kind: 'party' });
    const stored = { ...carried, storage: { kind: 'party' as const } };
    view.rerender(<InventoryPanel actor={actor} stacks={[stored]} dmView onMove={onMove} onTransfer={onTransfer} />);
    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    fireEvent.click(screen.getByRole('button', { name: 'Взять к себе' }));
    expect(onMove).toHaveBeenLastCalledWith('arrows', 20, { kind: 'actor', id: actor.id });
    view.rerender(<InventoryPanel actor={actor} stacks={[carried]} containers={[{id:'camp:one',name:'Лагерь у ручья',kind:'camp'}]} dmView onMove={onMove} onTransfer={onTransfer} />);
    expect(screen.getByRole('combobox',{name:'Целевой контейнер'})).toHaveValue('camp:one');
    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    fireEvent.click(screen.getByRole('button',{name:'Поместить Arrow в Лагерь у ручья'}));
    expect(onMove).toHaveBeenLastCalledWith('arrows',20,{kind:'container',id:'camp:one'});
    fireEvent.click(screen.getByRole('button',{name:'Передать партии: Arrow'}));
    expect(onTransfer).toHaveBeenCalledExactlyOnceWith('arrows',20,{kind:'party'},{kind:'party'});
    view.rerender(<InventoryPanel actor={actor} stacks={[{ ...carried, attunedTo: actor.id }]} dmView onMove={onMove} onTransfer={onTransfer} />);
    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    expect(screen.getByRole('button', { name: 'Убрать в запас' })).toBeDisabled();
  });

  it('перемещает и передаёт выбранное количество отдельным стеком', () => {
    const onMove=vi.fn(),onTransfer=vi.fn();
    const arrows: InventoryStack={id:'arrows-partial',itemId:'arrow',qty:20,owner:{kind:'actor',id:actor.id},storage:{kind:'actor',id:actor.id}};
    render(<InventoryPanel actor={actor} stacks={[arrows]} dmView onMove={onMove} onTransfer={onTransfer}/>);
    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    fireEvent.change(screen.getByRole('spinbutton',{name:'Количество переноса'}),{target:{value:'7'}});
    fireEvent.click(screen.getByRole('button',{name:'Убрать в запас'}));
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0].slice(0,3)).toEqual(['arrows-partial',7,{kind:'party'}]);
    expect(onMove.mock.calls[0][3]).toMatch(/^item:bo:/);

    fireEvent.click(screen.getByLabelText('Действия: Arrow'));
    fireEvent.change(screen.getByRole('spinbutton',{name:'Количество переноса'}),{target:{value:'4'}});
    fireEvent.click(screen.getByRole('button',{name:'Передать партии: Arrow'}));
    expect(onTransfer).toHaveBeenCalledOnce();
    expect(onTransfer.mock.calls[0].slice(0,4)).toEqual(['arrows-partial',4,{kind:'party'},{kind:'party'}]);
    expect(onTransfer.mock.calls[0][4]).toMatch(/^item:bo:/);
  });

  it('позволяет настроить предмет из SRD и учитывает лимит трёх предметов', () => {
    const onAttune = vi.fn();
    const stack: InventoryStack = { id: 'amulet', itemId: 'amulet-of-health', qty: 1, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id } };
    render(<InventoryPanel actor={actor} stacks={[stack]} dmView onAttune={onAttune} />);
    fireEvent.click(screen.getByLabelText('Действия: Amulet of Health'));
    fireEvent.click(screen.getByRole('button', { name: 'Настроить' }));
    expect(onAttune).toHaveBeenCalledExactlyOnceWith('amulet', actor.id);

    const full: InventoryStack[] = [stack, ...['a', 'b', 'c'].map(id => ({ id, itemId: 'amulet-of-health', qty: 1, attunedTo: actor.id, owner: { kind: 'actor' as const, id: actor.id }, storage: { kind: 'actor' as const, id: actor.id } }))];
    render(<InventoryPanel actor={actor} stacks={full} dmView onAttune={onAttune} />);
    const fullList=within(screen.getAllByRole('list', { name: 'Предметы персонажа' }).at(-1)!);
    fireEvent.click(fullList.getAllByLabelText('Действия: Amulet of Health')[0]!);
    expect(fullList.getByRole('button', { name: 'Настроить' })).toBeDisabled();
  });

  it('экипирует и снимает поддержанные SRD-доспехи, но не разрешает надеть второй в тот же слот', () => {
    const onEquip = vi.fn(), onUnequip = vi.fn();
    const armor: InventoryStack = { id: 'leather', itemId: 'leather-armor', qty: 1, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id } };
    const view = render(<InventoryPanel actor={actor} stacks={[armor]} dmView onEquip={onEquip} onUnequip={onUnequip} />);
    fireEvent.click(screen.getByLabelText('Действия: Leather Armor'));
    fireEvent.click(screen.getByRole('button', { name: 'Надеть' }));
    expect(onEquip).toHaveBeenCalledExactlyOnceWith('leather', actor.id, 'armor');
    view.rerender(<InventoryPanel actor={actor} stacks={[{ ...armor, wornAs: 'armor' }]} dmView onEquip={onEquip} onUnequip={onUnequip} />);
    fireEvent.click(screen.getByLabelText('Действия: Leather Armor'));
    fireEvent.click(screen.getByRole('button', { name: 'Снять: Leather Armor' }));
    expect(onUnequip).toHaveBeenCalledExactlyOnceWith('leather', actor.id);
    view.rerender(<InventoryPanel actor={actor} stacks={[armor, { ...armor, id: 'chain-mail', itemId: 'chain-mail', wornAs: 'armor' }]} dmView onEquip={onEquip} />);
    fireEvent.click(screen.getAllByLabelText('Действия: Leather Armor')[0]!);
    expect(screen.getByRole('button', { name: 'Надеть' })).toBeDisabled();
  });

  it('показывает вес только переносимых стеков и прячет команды у игроков', () => {
    const carried: InventoryStack = { id: 'carried-sword', itemId: 'longsword', qty: 1, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id }, visibility: 'players' };
    const partyStored: InventoryStack = { ...carried, id: 'party-sword', storage: { kind: 'party' } };
    render(<InventoryPanel actor={actor} stacks={[carried, partyStored]} dmView={false} />);
    expect(screen.getByText(/Вес 3 фнт/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Longsword · в запасе партии');
    expect(screen.queryByRole('button', { name: 'Получить' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Потерять/ })).toBeNull();
  });

  it('не показывает мастеру добавленный скрытый предмет на столе игроков до явного открытия', () => {
    const hidden: InventoryStack = { id: 'hidden-gem', itemId: 'gem', qty: 1, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id }, visibility: 'dm' };
    const visible: InventoryStack = { ...hidden, id: 'visible-gem', itemId: 'gem-visible', visibility: 'players', storage: {kind:'container',id:'secret-cache'} };
    render(<InventoryPanel actor={actor} stacks={[hidden, visible]} containers={[{id:'secret-cache',name:'Тайник мастера',kind:'camp'}]} dmView={false} />);
    expect(screen.getByRole('list', { name: 'Предметы персонажа' })).toHaveTextContent('gem-visible');
    expect(screen.getByRole('list', { name: 'Предметы персонажа' })).toHaveTextContent('в общем хранилище');
    expect(screen.queryByText('gem')).toBeNull();
    expect(screen.queryByText('hidden-gem')).toBeNull();
    expect(document.body).not.toHaveTextContent('Тайник мастера');
  });
});
