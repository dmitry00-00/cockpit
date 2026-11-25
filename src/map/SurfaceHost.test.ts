import { describe, expect, it, vi } from 'vitest';
import { SurfaceSession } from './SurfaceHost';
import type { TilesGlOptions } from './tilesGl';

describe('persistent map surface handoff', () => {
  it('aborts the old loader at claim even when its stale cleanup runs after the new owner',()=>{
    const pending=new AbortController();
    const gpu={draw:vi.fn(),stats:vi.fn(),dispose:vi.fn(),cancelPending:vi.fn(()=>pending.abort())};
    const session=new SurfaceSession(()=>gpu),oldHost=document.createElement('div'),nextHost=document.createElement('div');
    const old=session.claim(oldHost,{resource:'toril',load:vi.fn()});
    const canvas=oldHost.firstChild;
    const next=session.claim(nextHost,{resource:'toril',load:vi.fn()});
    expect(pending.signal.aborted).toBe(true);
    expect(gpu.cancelPending).toHaveBeenCalledOnce();
    old.release();
    expect(gpu.cancelPending).toHaveBeenCalledOnce();
    expect(nextHost.firstChild).toBe(canvas);
    expect(next.gpu).toBe(gpu);
    expect(gpu.dispose).not.toHaveBeenCalled();
    session.dispose();
  });
  it('moves the same canvas/context between projections and delegates to the current loader', async () => {
    let options: TilesGlOptions = {};
    const gpu = {draw:vi.fn(), stats:vi.fn(), dispose:vi.fn()};
    const factory = vi.fn((_canvas, opts) => { options=opts; return gpu; });
    const session = new SurfaceSession(factory);
    const globe = document.createElement('div'), plane = document.createElement('div');
    const oldLoad=vi.fn(), newLoad=vi.fn().mockResolvedValue('new-tile');
    const a=session.claim(globe,{resource:'toril',load:oldLoad});
    const canvas=globe.querySelector('canvas');
    const b=session.claim(plane,{resource:'toril',load:newLoad});
    a.release(); // stale effect cleanup must not detach the new owner's surface
    expect(plane.querySelector('canvas')).toBe(canvas);
    expect(globe.childElementCount).toBe(0);
    expect(a.gpu).toBe(b.gpu);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(gpu.dispose).not.toHaveBeenCalled();
    await expect(options.load!('schema:5:0_0',new AbortController().signal)).resolves.toBe('new-tile');
    expect(oldLoad).not.toHaveBeenCalled();
    b.release();
    expect(plane.childElementCount).toBe(0);
    session.dispose();
    expect(gpu.dispose).toHaveBeenCalledTimes(1);
  });
  it('releases resources on a different map and retries after provider remount cleanup', () => {
    const factory=vi.fn(()=>({draw:vi.fn(),stats:vi.fn(),dispose:vi.fn()}));
    const session=new SurfaceSession(factory), host=document.createElement('div');
    const a=session.claim(host,{resource:'toril',load:vi.fn()});
    const oldCanvas=host.firstChild;
    session.claim(host,{resource:'planetos',load:vi.fn()});
    expect(a.gpu?.dispose).toHaveBeenCalledTimes(1);
    expect(host.childElementCount).toBe(1);
    expect(host.firstChild).not.toBe(oldCanvas);
    session.dispose();
    session.claim(host,{resource:'planetos',load:vi.fn()});
    expect(factory).toHaveBeenCalledTimes(3);
    session.dispose();
  });
  it('never hands a lost renderer to the next projection',()=>{
    let options:TilesGlOptions={};
    const gpu={draw:vi.fn(),stats:vi.fn(),dispose:vi.fn()};
    const factory=vi.fn((_canvas,opts)=>{options=opts;return gpu;});
    const session=new SurfaceSession(factory),host=document.createElement('div'),onLost=vi.fn();
    session.claim(host,{resource:'toril',load:vi.fn(),onLost});
    options.onLost!();
    expect(onLost).toHaveBeenCalledOnce();expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(session.claim(host,{resource:'toril',load:vi.fn()}).gpu).toBeNull();
    expect(host.querySelector('canvas')?.hidden).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    session.claim(host,{resource:'other-map',load:vi.fn()});
    expect(factory).toHaveBeenCalledTimes(2);
    session.dispose();
  });

});
