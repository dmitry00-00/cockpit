import { useEffect, useRef, useState } from 'react';
import type { MapView, TileRect, Viewport } from './projection';
import { forceCanvas } from './renderer';
import { createTilesGl, type TilesGl } from './tilesGl';

interface RasterLayerProps {
  tiles: readonly TileRect[];
  view: MapView;
  vp: Viewport;
  dpr: number;
  pixelated: boolean;
  onError?: () => void;
}

/** Один набор тайлов для GPU и DOM. DOM остаётся под GPU до готовности подложки. */
export function RasterLayer({ tiles, view, vp, dpr, pixelated, onError }: RasterLayerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const errors = useRef(onError);
  errors.current = onError;
  const [gpu, setGpu] = useState<TilesGl | null>(null);
  const [covered, setCovered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed || forceCanvas() || !canvas.current) return;
    const made = createTilesGl(canvas.current, {
      onLost: () => setFailed(true),
      onError: tile => {
        if (tile.z === Math.min(...tilesRef.current.map(t => t.z))) errors.current?.();
        setFailed(true);
      },
      onCoverage: setCovered,
    });
    setGpu(made);
    return () => { made?.dispose(); };
  }, [failed]);

  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  useEffect(() => {
    if (gpu && !failed) gpu.draw(view, vp, dpr, tiles, pixelated);
  }, [gpu, failed, view, vp, dpr, tiles, pixelated]);

  const fallback = !gpu || failed || !covered;
  const base = Math.min(...tiles.map(t => t.z));
  return (
    <div aria-hidden="true" data-part="raster" data-renderer={gpu && !failed ? 'webgl2' : 'dom'} className="absolute inset-0 pointer-events-none">
      {fallback ? <div className="absolute inset-0" style={{ imageRendering: pixelated ? 'pixelated' : undefined }}>
        {tiles.map(t => <img key={t.url} src={t.url} alt="" draggable={false} data-tile={t.key}
          onError={t.z === base ? () => errors.current?.() : undefined}
          className="absolute max-w-none pointer-events-none"
          style={{ left: t.left, top: t.top, width: t.width, height: t.height }} />)}
      </div> : null}
      <canvas ref={canvas} hidden={!gpu || failed} data-part="raster-gl" className="absolute inset-0 size-full pointer-events-none" />
    </div>
  );
}
