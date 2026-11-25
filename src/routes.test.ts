import {expect,it} from 'vitest';
import {hashForView,productRoute,routeFromHash} from './routes';
it('restores contexts and legacy deep links without domain events',()=>{
 expect(productRoute('#/world/chronology')).toEqual({context:'world',view:'chrono'});
 expect(productRoute('#/session/notebook')).toEqual({context:'session',view:'notebook'});
 expect(productRoute('#/compendium/classes/voin')).toEqual({context:'library',library:'compendium'});
 expect(productRoute('#/workshop')).toEqual({context:'workshop'});
 expect(productRoute('#/garbage')).toEqual({context:'session',view:'desk'});
 expect(routeFromHash('#/desk/new')).toBe('desk');
 expect(hashForView('pulse','session')).toBe('#/world/pulse');expect(hashForView('desk','world')).toBe('#/world/map');
});
