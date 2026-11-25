import { StrictMode, useLayoutEffect, useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SurfaceHostProvider, useSurfaceSession } from './SurfaceHost';

vi.hoisted(()=>vi.resetModules());
const engines=vi.hoisted(()=>[] as {disposed:boolean;draw:ReturnType<typeof vi.fn>}[]);
vi.mock('./tilesGl',()=>({createTilesGl:vi.fn(()=>{
  const engine={disposed:false,draw:vi.fn(),stats:vi.fn(),dispose:()=>{engine.disposed=true;}};
  engines.push(engine);return engine;
})}));
afterEach(()=>{cleanup();engines.length=0;});
function Projection({name}:{name:string}){
  const host=useRef<HTMLDivElement>(null),session=useSurfaceSession();
  useLayoutEffect(()=>{
    const lease=session.claim(host.current!,{resource:'toril',load:vi.fn()});
    lease.gpu?.draw({x:0,y:0,scale:1},{w:100,h:100},1,[],false);
    return lease.release;
  },[session]);
  return <div ref={host} data-testid={name}/>;
}
it('StrictMode leaves a live engine after replaying layout effects and preserves it on projection swap',()=>{
  const view=render(<StrictMode><SurfaceHostProvider><Projection key="sphere" name="sphere"/></SurfaceHostProvider></StrictMode>);
  const active=engines.at(-1)!;
  expect(active.disposed).toBe(false);
  const canvas=view.getByTestId('sphere').firstChild;
  view.rerender(<StrictMode><SurfaceHostProvider><Projection key="plane" name="plane"/></SurfaceHostProvider></StrictMode>);
  expect(view.getByTestId('plane').firstChild).toBe(canvas);
  expect(active.disposed).toBe(false);
  expect(engines.at(-1)).toBe(active);
  view.unmount();
  expect(active.disposed).toBe(true);
});
