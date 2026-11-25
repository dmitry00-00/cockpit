import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { PartyContextPanel } from './PartyContextPanel';
import { OpenEntityContext } from '../../components/openEntity';
describe('party context beneath the spread',()=>{
  it('shows supplied facts and location navigation without inventing an active trip, camp or inventories',()=>{
    const onLocation=vi.fn();
    render(<PartyContextPanel snapshot={{members:4,location:{id:'town',name:'Поселение',haven:true},supply:{value:12,capacity:40,perDay:4,days:3}}} onLocation={onLocation}/>);
    fireEvent.click(screen.getByRole('button',{name:'Поселение'}));
    expect(onLocation).toHaveBeenCalledWith('town');
    expect(screen.getByRole('region',{name:'Состояние партии'})).toHaveTextContent('Общие припасы12Унесут40Хватит на дней3Расход в день4');
    expect(screen.queryByText('Последний переход')).toBeNull();
    expect(screen.queryByText('Последний отдых')).toBeNull();
    expect(document.body).not.toHaveTextContent('Повозка');
  });
  it('объясняет, когда общее место не подтверждено для всех участников',()=>{
    render(<PartyContextPanel snapshot={{members:4,locationIncomplete:true,positions:[{id:'town',name:'Neverwinter',members:3}],supply:{value:0,capacity:null,perDay:0}}}/>);
    expect(screen.getByText('Общее место партии не подтверждено для всех участников')).toBeInTheDocument();
    expect(screen.getByText('Известные места: Neverwinter (3)')).toBeInTheDocument();
  });
  it('keeps completed travel and rest clearly historical',()=>{
    render(<PartyContextPanel snapshot={{members:1,supply:{value:2,capacity:null,perDay:1,days:2},lastJourney:{eventId:'trip',from:'Город',to:'Лес',miles:12,days:1,atSec:0},lastRest:{eventId:'rest',kind:'short',participants:['Герой'],atSec:0}}}/>);
    fireEvent.click(screen.getByText('Последний переход'));
    expect(screen.getByText('Город → Лес')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Последний отдых'));
    expect(screen.getByText('Короткий отдых')).toBeInTheDocument();
    expect(screen.queryByText('В пути')).toBeNull();
    expect(screen.queryByText('Унесут')).toBeNull();
  });
  it('keeps old unlinked transport containers readable and transfers party-owned contents to a member',()=>{
    const onCreateContainer=vi.fn(),onRemoveContainer=vi.fn(),onTransferItem=vi.fn();
    render(<PartyContextPanel snapshot={{members:2,supply:{value:0,capacity:null,perDay:0}}} dmView
      containers={[{id:'wagon:one',name:'Крытая повозка',kind:'transport'}]}
      locations={[{id:'ford',name:'Брод'}]}
      inventory={[{id:'rations',itemId:'rations',qty:3,owner:{kind:'party'},storage:{kind:'container',id:'wagon:one'}}]}
      actors={[{id:'bo',name:'Bo'},{id:'korrin',name:'Korrin'}]} onCreateContainer={onCreateContainer} onRemoveContainer={onRemoveContainer} onTransferItem={onTransferItem}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    expect(screen.getByText('Крытая повозка · транспорт: не связан')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Выдать .* персонажу Bo/}));
    expect(onTransferItem).toHaveBeenCalledExactlyOnceWith('rations',3,'bo');
    expect(screen.queryByRole('button',{name:'Удалить пустое хранилище Крытая повозка'})).toBeNull();
    fireEvent.change(screen.getByRole('combobox',{name:'Тип хранилища'}),{target:{value:'camp'}});
    fireEvent.change(screen.getByRole('textbox',{name:'Название хранилища'}),{target:{value:'Лагерь у брода'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Место лагеря'}),{target:{value:'ford'}});
    fireEvent.click(screen.getByRole('button',{name:'Создать'}));
    expect(onCreateContainer).toHaveBeenCalledOnce();
    expect(onCreateContainer.mock.calls[0][0]).toMatchObject({name:'Лагерь у брода',kind:'camp',locationId:'ford'});
  });
  it('creates a transport entity first, then requires and stores its link on the cargo container',()=>{
    const onCreateTransport=vi.fn(),onRemoveTransport=vi.fn(),onCreateContainer=vi.fn();
    const props={snapshot:{members:1,supply:{value:0,capacity:null,perDay:0}},dmView:true as const,transports:[] as {id:string;name:string}[],onCreateTransport,onRemoveTransport,onCreateContainer};
    const view=render(<PartyContextPanel {...props}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    fireEvent.change(screen.getByRole('textbox',{name:'Название транспорта'}),{target:{value:'Крытая повозка'}});
    fireEvent.click(screen.getByRole('button',{name:'Добавить'}));
    expect(onCreateTransport).toHaveBeenCalledOnce();
    const transport=onCreateTransport.mock.calls[0][0];
    expect(transport).toMatchObject({name:'Крытая повозка',id:expect.stringMatching(/^transport:/)});

    view.rerender(<PartyContextPanel {...props} transports={[transport]}/>);
    fireEvent.change(screen.getByRole('combobox',{name:'Тип хранилища'}),{target:{value:'transport'}});
    fireEvent.change(screen.getByRole('textbox',{name:'Название хранилища'}),{target:{value:'Грузовой отсек'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Транспорт'}),{target:{value:transport.id}});
    fireEvent.click(screen.getByRole('button',{name:'Создать'}));
    expect(onCreateContainer).toHaveBeenCalledOnce();
    expect(onCreateContainer.mock.calls[0][0]).toMatchObject({kind:'transport',name:'Грузовой отсек',transportId:transport.id});
  });
  it('не выдаёт игроку имена приватных контейнеров и их содержимое',()=>{
    render(<PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView={false}
      containers={[{id:'secret',name:'Тайник мастера',kind:'camp'}]}
      inventory={[{id:'secret-item',itemId:'secret-gem',qty:1,owner:{kind:'party'},storage:{kind:'container',id:'secret'}}]}/>);
    expect(document.body).not.toHaveTextContent('Тайник мастера');
    expect(document.body).not.toHaveTextContent('secret-gem');
    expect(screen.queryByText('Покупка и продажа')).toBeNull();
  });
  it('позволяет удалить хранилище только когда оно пусто',()=>{
    const onRemoveContainer=vi.fn();
    render(<PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView
      containers={[{id:'camp:empty',name:'Пустая стоянка',kind:'camp'}]} onRemoveContainer={onRemoveContainer}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    fireEvent.click(screen.getByRole('button',{name:'Удалить пустое хранилище Пустая стоянка'}));
    expect(onRemoveContainer).toHaveBeenCalledExactlyOnceWith('camp:empty');
  });
  it('показывает имущество общего запаса и позволяет выдать его участнику',()=>{
    const onTransferItem=vi.fn();
    render(<PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView
      inventory={[{id:'party-rope',itemId:'rope-hempen',qty:1,owner:{kind:'party'},storage:{kind:'party'}}]}
      actors={[{id:'bo',name:'Bo'}]} onTransferItem={onTransferItem}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    expect(screen.getByRole('region',{name:'Общий запас партии'})).toHaveTextContent('владелец: партия');
    fireEvent.click(screen.getByRole('button',{name:/Выдать .* персонажу Bo/}));
    expect(onTransferItem).toHaveBeenCalledExactlyOnceWith('party-rope',1,'bo');
  });
  it('перемещает вещь из общего запаса в контейнер, не меняя владельца в команде',()=>{
    const onMoveItem=vi.fn();
    render(<PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView
      containers={[{id:'wagon:one',name:'Повозка',kind:'transport'}]}
      inventory={[{id:'party-rope',itemId:'rope-hempen',qty:2,owner:{kind:'party'},storage:{kind:'party'}}]}
      onMoveItem={onMoveItem}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    fireEvent.click(screen.getByRole('button',{name:/Переместить .*party-rope/}));
    expect(onMoveItem).toHaveBeenCalledExactlyOnceWith('party-rope',2,{kind:'container',id:'wagon:one'});
  });
  it('перемещает и выдаёт часть стека, сохраняя остаток в исходном месте',()=>{
    const onMoveItem=vi.fn(),onTransferItem=vi.fn();
    render(<PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView
      containers={[{id:'wagon:one',name:'Повозка',kind:'transport'}]}
      inventory={[{id:'party-rations',itemId:'rations',qty:5,owner:{kind:'party'},storage:{kind:'party'}}]}
      actors={[{id:'bo',name:'Bo'}]} onMoveItem={onMoveItem} onTransferItem={onTransferItem}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    fireEvent.change(screen.getByRole('spinbutton',{name:'Количество для действия rations'}),{target:{value:'2'}});
    fireEvent.click(screen.getByRole('button',{name:/Переместить .*party-rations/}));
    expect(onMoveItem).toHaveBeenCalledOnce();
    expect(onMoveItem.mock.calls[0].slice(0,3)).toEqual(['party-rations',2,{kind:'container',id:'wagon:one'}]);
    expect(onMoveItem.mock.calls[0][3]).toMatch(/^item:bo:/);
    fireEvent.change(screen.getByRole('spinbutton',{name:'Количество для действия rations'}),{target:{value:'1'}});
    fireEvent.click(screen.getByRole('button',{name:/Выдать .* персонажу Bo/}));
    expect(onTransferItem).toHaveBeenCalledOnce();
    expect(onTransferItem.mock.calls[0].slice(0,3)).toEqual(['party-rations',1,'bo']);
    expect(onTransferItem.mock.calls[0][3]).toMatch(/^item:bo:/);
  });
  it('возвращает вещь из контейнера в общий запас партии',()=>{
    const onMoveItem=vi.fn();
    render(<PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView
      containers={[{id:'camp:one',name:'Стоянка',kind:'camp'}]}
      inventory={[{id:'party-rations',itemId:'rations',qty:3,owner:{kind:'party'},storage:{kind:'container',id:'camp:one'}}]}
      onMoveItem={onMoveItem}/>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    fireEvent.click(screen.getByRole('button',{name:/Переместить .*party-rations/}));
    expect(onMoveItem).toHaveBeenCalledExactlyOnceWith('party-rations',3,{kind:'party'});
  });
  it('открывает карточки SRD из общего запаса и контейнера',()=>{
    const open=vi.fn();
    render(<OpenEntityContext.Provider value={open}><PartyContextPanel snapshot={{members:1,supply:{value:0,capacity:null,perDay:0}}} dmView
      containers={[{id:'camp:one',name:'Стоянка',kind:'camp'}]}
      inventory={[
        {id:'party-rope',itemId:'rope-hempen-50-feet',qty:1,owner:{kind:'party'},storage:{kind:'party'}},
        {id:'camp-amulet',itemId:'amulet-of-health',qty:1,owner:{kind:'party'},storage:{kind:'container',id:'camp:one'}},
      ]}/></OpenEntityContext.Provider>);
    fireEvent.click(screen.getByText('Хранилища партии'));
    const links=screen.getAllByRole('button',{name:/Открыть предмет:/});
    expect(links).toHaveLength(2);
    fireEvent.click(links[0]!);
    fireEvent.click(links[1]!);
    expect(open).toHaveBeenNthCalledWith(1,'item:rope-hempen-50-feet');
    expect(open).toHaveBeenNthCalledWith(2,'item:amulet-of-health');
  });
});
