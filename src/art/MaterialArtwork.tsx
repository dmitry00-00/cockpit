import { lazy, Suspense, type CSSProperties } from 'react';
import type { ArtId } from './registry.generated';

export const PRODUCT_MATERIAL_ART = [
  'kimi-material-material-dark-wood-v1',
  'kimi-material-material-plum-leather-v1',
  'kimi-material-material-warm-paper-v1',
  'kimi-material-trim-bronze-strip-v1',
  'kimi-material-trim-bronze-corner-v1',
  'kimi-material-ornament-wax-seal-v1',
] as const satisfies readonly ArtId[];

export type ProductMaterialArtId = typeof PRODUCT_MATERIAL_ART[number];

const ArtImage = lazy(() => import('./ArtImage').then(module => ({ default: module.ArtImage })));

/** Decorative product surface or frame element. Asset metadata remains in the art registry. */
export function MaterialArtwork({ asset, width, className, style }: {
  asset: ProductMaterialArtId;
  width: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Suspense fallback={null}>
      <ArtImage asset={asset} alt="" width={width} sizes={`${width}px`} className={className} style={style} />
    </Suspense>
  );
}

export default MaterialArtwork;
