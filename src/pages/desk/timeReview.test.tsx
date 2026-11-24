import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { mount, tempoGroup, openTimeControls } from './testkit';

const review=()=>screen.getByRole('dialog',{name:'Предпросмотр шага времени'});
async function requestDay(){
  openTimeControls();
  fireEvent.click(within(tempoGroup()).getByRole('radio',{name:'День'}));
  fireEvent.click(screen.getByRole('button',{name:'Закрыть управление временем'}));
  fireEvent.keyDown(window,{key:'t',code:'KeyT'});
  await waitFor(()=>expect(review()).toBeInTheDocument());
}
describe('БА3: выбранный шаг, рекомендация, предварительный просмотр',()=>{
  it('масштаб меняет рекомендацию, но не выбранный шаг; явный выбор рекомендации не пишет событие',()=>{
    const {store}=mount();const before=store.getState().events;
    fireEvent.click(screen.getByRole('button',{name:'Космология'}));
    openTimeControls();
    expect(within(tempoGroup()).getByRole('radio',{checked:true})).toHaveTextContent('Час');
    expect(within(tempoGroup()).getByText('Рекомендация масштаба: Год')).toBeInTheDocument();
    fireEvent.click(within(tempoGroup()).getByRole('button',{name:'Выбрать рекомендацию'}));
    expect(within(tempoGroup()).getByRole('radio',{checked:true})).toHaveTextContent('Год');
    expect(store.getState().events).toBe(before);
  });
  it('T для дня открывает прогноз без изменений; отмена ничего не пишет',async()=>{
    const {store}=mount(); const before=store.getState();
    await requestDay();
    expect(review()).toHaveTextContent('Сейчас');
    expect(review()).toHaveTextContent('После шага');
    expect(store.getState().events).toBe(before.events);
    expect(store.getState().state).toBe(before.state);
    fireEvent.click(within(review()).getByRole('button',{name:'Отмена'}));
    expect(screen.queryByRole('dialog',{name:'Предпросмотр шага времени'})).toBeNull();
    expect(store.getState().events).toBe(before.events);
  });
  it('изменение кампании требует обновлённого прогноза; применение и undo используют обычный путь',async()=>{
    const {store}=mount();const before=store.getState().state.time.sec;
    await requestDay();
    act(()=>{store.getState().damage('bo',1);});
    fireEvent.click(within(review()).getByRole('button',{name:'Применить шаг'}));
    expect(review()).toHaveTextContent('Прогноз обновлён');
    expect(store.getState().state.time.sec).toBe(before);
    fireEvent.click(within(review()).getByRole('button',{name:'Применить шаг'}));
    expect(store.getState().state.time.sec).toBe(before+86400);
    expect(store.getState().events.some(e=>e.type==='TIME_ADVANCED')).toBe(true);
    act(()=>store.getState().undo());
    expect(store.getState().state.time.sec).toBe(before);
  });
  it('24 часовых шага тоже показывают период; в режиме игроков прогноз отсутствует в DOM',async()=>{
    const {store}=mount();const before=store.getState().events;
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('button',{name:'Шаг'}),{shiftKey:true});
    fireEvent.change(screen.getByRole('textbox',{name:'Сколько шагов'}),{target:{value:'24'}});
    fireEvent.keyDown(screen.getByRole('textbox',{name:'Сколько шагов'}),{key:'Enter'});
    await waitFor(()=>expect(review()).toBeInTheDocument());
    expect(review()).toHaveTextContent('Час × 24');
    expect(store.getState().events).toBe(before);
    fireEvent.keyDown(window,{key:'p',code:'KeyP'});
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Предпросмотр шага времени'})).toBeNull());
    expect(document.body.textContent).not.toContain('Предпросмотр шага времени');
  });
});
