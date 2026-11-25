import { lazy, Suspense, type ReactNode } from 'react';
import { isUserPortraitDataUrl, type UserPortraitDataUrl } from './userPortrait';
import { isBuiltInPortraitId, type BuiltInPortraitId } from './portraitIds';
export { BUILT_IN_PORTRAITS, BUILT_IN_PORTRAIT_LABELS, isBuiltInPortraitId } from './portraitIds';
export type { BuiltInPortraitId } from './portraitIds';

/** Explicit built-in portrait identities. User supplied images belong to Q12 and use another storage path. */
export type PortraitRef = BuiltInPortraitId | UserPortraitDataUrl;
const PortraitAsset = lazy(() => import('./PortraitAsset'));

/** Legacy or malformed snapshots can contain unknown values; renderers should retain their normal icon fallback. */
export function resolveBuiltInPortrait(value: unknown): BuiltInPortraitId | undefined {
  return isBuiltInPortraitId(value) ? value : undefined;
}

export function resolvePortrait(value: unknown): PortraitRef | undefined {
  return resolveBuiltInPortrait(value) ?? (isUserPortraitDataUrl(value) ? value : undefined);
}

export function PortraitImage({ portrait, alt, width, sizes, className, fallback }: {
  portrait: unknown;
  alt: string;
  width: number;
  sizes?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const asset = resolveBuiltInPortrait(portrait);
  if (!asset) {
    const userPortrait = isUserPortraitDataUrl(portrait) ? portrait : undefined;
    return userPortrait ? <img src={userPortrait} alt={alt} width={width} height={width} loading="lazy" decoding="async" className={className} /> : null;
  }
  const frame = { width, maxWidth: '100%', height: width, display: 'grid', placeItems: 'center' } as const;
  return (
    <Suspense fallback={<span role="img" aria-label={alt} className={className} style={frame}>{fallback}</span>}>
      <PortraitAsset portrait={asset} alt={alt} width={width} sizes={sizes} className={className} fallback={fallback} />
    </Suspense>
  );
}
