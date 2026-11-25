import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,it} from 'vitest';
import {App} from '../../App';
import {seedEngine} from '../../campaign';
import {memoryStore} from '../../engine';
async function navigate(hash:string){await act(async()=>{location.hash=hash;window.dispatchEvent(new HashChangeEvent('hashchange'));});}
it('keeps one campaign and selected party across four contexts, preserves clock, and removes author UI for players',async()=>{
 const persist=memoryStore(),store=seedEngine({persist});const count=store.getState().events.length;
 await navigate('#/session/desk');render(<App store={store} persist={persist}/>);
 fireEvent.click(await screen.findByRole('button',{name:/^Информация о партии/}));
 await navigate('#/workshop');expect(await screen.findByRole('region',{name:'Мастерская'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Управление временем'})).toBeVisible();
 await navigate('#/library');expect(await screen.findByRole('region',{name:'Библиотека'})).toBeVisible();
 expect(screen.getByRole('link',{name:'Мастерская'})).toHaveAttribute('href','#/workshop');
 await navigate('#/workshop');expect(await screen.findByRole('region',{name:'Мастерская'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Создать персонажа'})).toBeVisible();
 expect(screen.getByRole('link',{name:'Библиотека'})).toHaveAttribute('href','#/library');
 await navigate('#/session/desk');expect(screen.getByRole('button',{name:/^Информация о партии/})).toHaveAttribute('aria-expanded','true');
 expect(screen.getByRole('button',{name:'Управление временем'})).toBeVisible();
 expect(store.getState().events).toHaveLength(count);
 fireEvent.keyDown(window,{key:'p',code:'KeyP'});await waitFor(()=>expect(within(screen.getByRole('navigation',{name:'Контексты ширмы'})).queryByText('Мастерская')).toBeNull());
 await navigate('#/workshop');expect(screen.queryByRole('region',{name:'Мастерская'})).toBeNull();
 expect(store.getState().events).toHaveLength(count);
 await navigate('#/desk');
});

it('keeps the global theme switch in the top navigation across app contexts', async () => {
 localStorage.clear();
 await navigate('#/session/desk');
 render(<App store={seedEngine()} />);
 const navigation = screen.getByRole('navigation', { name: 'Контексты ширмы' });
 const flat = within(navigation).getByRole('radio', { name: 'Плоская 2D' });
 const material = within(navigation).getByRole('radio', { name: 'Материалы' });
 expect(material).toBeChecked();
 fireEvent.click(flat);
 expect(flat).toBeChecked();
 expect(document.querySelector('.app-shell')).toHaveAttribute('data-ui-theme', 'flat');
 expect(localStorage.getItem('dm-cockpit:ui-theme:v1')).toBe('flat');
 await navigate('#/workshop');
 expect(within(screen.getByRole('navigation', { name: 'Контексты ширмы' })).getByRole('radio', { name: 'Плоская 2D' })).toBeChecked();
 expect(document.querySelector('.app-shell')).toHaveAttribute('data-ui-theme', 'flat');
});
