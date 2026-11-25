import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createTilesGl, type TilesGl, type TilesGlOptions } from './tilesGl';

let nextSurfaceId = 0;
type SurfaceOptions = TilesGlOptions & { resource: string };
/** Owns the canvas outside a projection component's lifecycle. A handoff moves the same
 * DOM node and retains shaders, decoded textures and GPU context for the same map. */
export class SurfaceSession {
  look: 'schema' | 'clean' | 'raster' = 'schema';
  private canvas: HTMLCanvasElement | null = null;
  private gpu: TilesGl | null = null;
  private options: TilesGlOptions = {};
  private resource: string | null = null;
  private owner: symbol | null = null;
  private failed = false;
  constructor(private readonly factory = createTilesGl) {}

  claim(host: HTMLElement, options: SurfaceOptions) {
    const owner = Symbol('surface-owner');
    if (this.resource !== options.resource) {
      this.dispose();
      this.resource = options.resource;
    }
    // A new projection can claim before the previous layout effect cleans up.
    // Abort that loader's pending work before replacing it; stale release() must
    // not later cancel the new owner's requests. Ready textures stay cached.
    this.gpu?.cancelPending?.();
    this.owner = owner;
    Object.assign(this.options, options);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.dataset.part = 'surface-gl';
      this.canvas.dataset.surfaceId = String(++nextSurfaceId);
      this.canvas.className = 'absolute inset-0 size-full pointer-events-none';
      this.canvas.setAttribute('aria-hidden', 'true');
    }
    host.appendChild(this.canvas);
    const optionsRef = this.options;
    if (!this.gpu && !this.failed) {
      // createTilesGl captures the loader once: delegate every request to current owner.
      const load: NonNullable<TilesGlOptions['load']> = (url, signal) => this.options.load!(url, signal);
      this.gpu = this.factory(this.canvas, {
        get extent() { return optionsRef.extent; },
        get sun() { return optionsRef.sun; },
        measure: options.measure,
        load,
        onError: tile => { this.fail(); this.options.onError?.(tile); },
        onLost: () => { this.fail(); this.options.onLost?.(); },
        onInitError: message => this.options.onInitError?.(message),
      });
      this.failed = !this.gpu;
    }
    this.canvas.dataset.renderer = this.gpu ? 'webgl2' : 'fallback';
    this.canvas.hidden = !this.gpu;
    return {
      gpu: this.gpu,
      release: () => {
        if (this.owner !== owner) return;
        this.owner = null;
        this.gpu?.cancelPending?.();
        // The next projection claims this node synchronously in a layout effect.
        this.canvas?.remove();
      },
    };
  }
  private fail() {
    this.failed=true;
    const gpu=this.gpu;this.gpu=null;
    gpu?.dispose();
    if(this.canvas)this.canvas.hidden=true;
  }
  /** Only invoked by the explicit opt-in diagnostics button; does not touch campaign state. */
  simulateContextLoss(): boolean {
    const gl=this.canvas?.getContext('webgl2');
    const extension=gl?.getExtension('WEBGL_lose_context');
    if(!extension)return false;
    extension.loseContext();
    return true;
  }
  dispose() {
    this.gpu?.dispose();
    this.canvas?.remove();
    this.gpu = null;
    this.canvas = null;
    this.resource = null;
    this.owner = null;
    this.failed = false;
  }
}

const SurfaceHost = createContext<SurfaceSession | null>(null);
export function SurfaceHostProvider({ children }: { children: ReactNode }) {
  const ref = useRef<SurfaceSession | null>(null);
  if (!ref.current) ref.current = new SurfaceSession();
  useLayoutEffect(() => () => ref.current?.dispose(), []);
  return <SurfaceHost.Provider value={ref.current}>{children}</SurfaceHost.Provider>;
}
export function useSurfaceSession() {
  const shared = useContext(SurfaceHost);
  const local = useRef<SurfaceSession | null>(null);
  if (!shared && !local.current) local.current = new SurfaceSession();
  useLayoutEffect(() => () => local.current?.dispose(), []);
  return shared ?? local.current!;
}
