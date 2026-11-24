import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTilesGl, type GlTile, type TileImage } from './tilesGl';

const view = { x: 128, y: 128, scale: 1 };
const vp = { w: 256, h: 256 };
const tile: GlTile = { key: '0/0_0', z: 0, url: '/base.webp', box: { x0: 0, y0: 0, x1: 256, y1: 256 } };

function context() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  let constant = 0;
  const constants = new Map<string, number>();
  const gl = new Proxy({}, { get(_target, key: string) {
    if (/^[A-Z_0-9]+$/.test(key)) {
      if (!constants.has(key)) constants.set(key, ++constant);
      return constants.get(key);
    }
    return calls[key] ??= vi.fn(() => key === 'getShaderParameter' || key === 'getProgramParameter' ? true : {});
  } });
  vi.stubGlobal('WebGL2RenderingContext', class {});
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl as WebGL2RenderingContext);
  return { canvas, calls };
}
function deferred() {
  let resolve!: (image: TileImage) => void;
  const promise = new Promise<TileImage>(r => { resolve = r; });
  return { promise, resolve };
}
const image = () => ({ close: vi.fn() }) as unknown as TileImage & { close: ReturnType<typeof vi.fn> };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('WebGL tile lifecycle', () => {
  it('нижний уровень обеспечивает покрытие до загрузки детальных тайлов', async () => {
    const { canvas } = context();
    const low = deferred(); const high = deferred(); const onCoverage = vi.fn();
    const gpu = createTilesGl(canvas, { load: url => url === tile.url ? low.promise : high.promise,
      schedule: cb => cb(), onCoverage })!;
    gpu.draw(view, vp, 2, [tile, { ...tile, key: '1/0_0', z: 1, url: '/detail.webp' }], false);
    expect(onCoverage).toHaveBeenLastCalledWith(false);
    const decoded = image(); low.resolve(decoded); await Promise.resolve();
    expect(onCoverage).toHaveBeenLastCalledWith(true);
    expect(gpu.stats()).toMatchObject({ ready: 1, loading: 1 });
    expect(decoded.close).toHaveBeenCalledTimes(1);
    gpu.dispose();
  });

  it('результат отменённого запроса не загружается в GPU после dispose', async () => {
    const { canvas, calls } = context(); const pending = deferred(); let signal!: AbortSignal;
    const gpu = createTilesGl(canvas, { load: (_url, s) => { signal = s; return pending.promise; } })!;
    gpu.draw(view, vp, 1, [tile], false); gpu.dispose();
    expect(signal.aborted).toBe(true);
    const decoded = image(); pending.resolve(decoded); await Promise.resolve();
    expect(decoded.close).toHaveBeenCalledTimes(1);
    expect(calls.texImage2D).toBeUndefined();
  });

  it('отказ upload освобождает декод/текстуру и вызывает запасной путь', async () => {
    const { canvas, calls } = context(); const pending = deferred(); const onError = vi.fn();
    const gpu = createTilesGl(canvas, { load: () => pending.promise, onError })!;
    // Метод вызывается после разрешения load, не при создании слоя.
    calls.texImage2D = vi.fn(() => { throw new Error('upload failed'); });
    gpu.draw(view, vp, 1, [tile], false);
    const decoded = image(); pending.resolve(decoded); await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(tile);
    expect(decoded.close).toHaveBeenCalledTimes(1);
    expect(calls.deleteTexture).toHaveBeenCalledTimes(1);
    gpu.dispose();
  });

  it('handoff cancels pending jobs, keeps ready textures and retries abandoned tiles', async () => {
    const {canvas}=context();
    const pending=deferred(), ready=deferred();
    const signals:AbortSignal[]=[];
    const load=vi.fn((url:string,signal:AbortSignal)=>{signals.push(signal);return url===tile.url?ready.promise:pending.promise;});
    const gpu=createTilesGl(canvas,{load,schedule:cb=>cb()})!;
    const detail={...tile,z:1,key:'1/0_0',url:'/detail.webp'};
    gpu.draw(view,vp,1,[tile,detail],false);
    ready.resolve(image());await Promise.resolve();
    gpu.cancelPending!();
    expect(signals[1].aborted).toBe(true);
    expect(gpu.stats()).toMatchObject({ready:1,loading:0});
    gpu.draw(view,vp,1,[tile,detail],false);
    expect(load).toHaveBeenCalledTimes(3);
    expect(gpu.stats()).toMatchObject({ready:1,loading:1});
    gpu.dispose();
  });

  it('ошибка компиляции освобождает оба созданных шейдера', () => {
    const { canvas, calls } = context();
    calls.getShaderParameter = vi.fn(() => false);
    expect(createTilesGl(canvas)).toBeNull();
    expect(calls.deleteShader).toHaveBeenCalledTimes(2);
  });
});
