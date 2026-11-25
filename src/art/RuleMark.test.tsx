import {expect,it} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ABILITY_IDS,SKILL_IDS} from '../rules/srd/abilities';
import {ART} from './registry.generated';
import {ABILITY_ART,SKILL_ART,SkillMark} from './RuleMark';
it('maps every rule role explicitly and keeps stealth distinct from movement and ranger',()=>{
 expect(Object.keys(ABILITY_ART).sort()).toEqual([...ABILITY_IDS].sort());
 expect(Object.keys(SKILL_ART).sort()).toEqual([...SKILL_IDS].sort());
 for(const asset of [...Object.values(ABILITY_ART),...Object.values(SKILL_ART)])expect(ART[asset]?.variants.length).toBeGreaterThan(0);
 expect(SKILL_ART.stealth).toBe('kimi-core-icon-stealth-hood');expect(SKILL_ART.survival).not.toBe(SKILL_ART.stealth);
});
it('uses prepared responsive art and restores semantic fallback after an image error',async()=>{
 render(<SkillMark skill="stealth" title="Скрытность"/>);
 // The lazy image may initially be the semantic SVG; wait for the delivered image.
 await waitFor(()=>expect(screen.getByRole('img',{name:'Скрытность'}).tagName).toBe('IMG'));
 const delivered=screen.getByRole('img',{name:'Скрытность'});
 expect(delivered).toHaveAttribute('loading','lazy');expect(delivered.getAttribute('srcset')).toContain('48w');
 fireEvent.error(delivered);expect(screen.getByRole('img',{name:'Скрытность'})).toBeInTheDocument();
});
