import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { mount } from './testkit';
it('ribbon navigation never dispatches; player mode unmounts every ribbon detail', async () => {
 const {store}=mount();const count=store.getState().events.length;
 const ribbon=await screen.findByRole('region',{name:'Хронологическая лента'});
 fireEvent.click(within(ribbon).getByRole('button',{name:'Год'}));
 fireEvent.click(within(ribbon).getByRole('button',{name:'Предыдущий период ленты'}));
 fireEvent.click(within(ribbon).getByRole('button',{name:'К сейчас'}));
 expect(store.getState().events).toHaveLength(count);
 fireEvent.keyDown(window,{key:'p',code:'KeyP'});
 expect(screen.queryByRole('region',{name:'Хронологическая лента'})).toBeNull();
 expect(store.getState().events).toHaveLength(count);
});
